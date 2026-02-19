import { SynthParams, SequenceStep, Waveform } from '../types';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private outputNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private distortionNode: WaveShaperNode | null = null;
  
  // FX Nodes
  private delayNode: DelayNode | null = null;
  private feedbackGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  
  private isPlaying: boolean = false;
  private currentStep: number = 0;
  private nextNoteTime: number = 0;
  private timerID: number | undefined;
  
  // Schedule lookahead
  private readonly lookahead = 25.0; // ms
  private readonly scheduleAheadTime = 0.1; // s

  private sequence: SequenceStep[] = [];
  private nextSequence: SequenceStep[] | null = null; // Queue for next loop
  
  private params: SynthParams;
  private onStepCallback: ((step: number) => void) | null = null;
  private onPatternCompleteCallback: (() => void) | null = null;

  constructor(initialParams: SynthParams) {
    this.params = initialParams;
  }

  public init() {
    if (this.ctx) return;
    
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // 1. Create Nodes
    this.outputNode = this.ctx.createGain();
    this.outputNode.gain.value = 0.5;
    
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    
    this.distortionNode = this.ctx.createWaveShaper();
    this.updateDistortionCurve(this.params.distortion);

    // Delay Nodes
    this.delayNode = this.ctx.createDelay(5.0); // Max delay 5s
    this.feedbackGain = this.ctx.createGain();
    this.dryGain = this.ctx.createGain();
    this.wetGain = this.ctx.createGain();

    // 2. Set Initial FX Values
    this.updateDelayParams();

    // 3. Routing Graph
    // Synth Voice -> DistortionNode (Input)
    
    // Split Distortion Output
    this.distortionNode.connect(this.dryGain);
    this.distortionNode.connect(this.delayNode);

    // Delay Loop
    this.delayNode.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode); // Loop
    this.delayNode.connect(this.wetGain);

    // Sum Dry + Wet -> Analyser -> Master
    this.dryGain.connect(this.analyser);
    this.wetGain.connect(this.analyser);
    
    this.analyser.connect(this.outputNode);
    this.outputNode.connect(this.ctx.destination);
  }

  private updateDistortionCurve(amount: number) {
    if (!this.distortionNode) return;
    const k = amount * 100;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    this.distortionNode.curve = curve;
    this.distortionNode.oversample = '4x';
  }

  private updateDelayParams() {
    if (!this.delayNode || !this.feedbackGain || !this.dryGain || !this.wetGain || !this.ctx) return;
    
    const now = this.ctx.currentTime;
    
    // Time
    this.delayNode.delayTime.setTargetAtTime(this.params.delayTime, now, 0.05);
    
    // Feedback
    this.feedbackGain.gain.setTargetAtTime(Math.min(0.95, this.params.delayFeedback), now, 0.05);
    
    // Mix (Equal Power Crossfade)
    const mix = this.params.delayMix;
    // Simple linear for now is fine, or cosine/sine for equal power
    const dryLevel = Math.cos(mix * 0.5 * Math.PI);
    const wetLevel = Math.sin(mix * 0.5 * Math.PI);

    this.dryGain.gain.setTargetAtTime(dryLevel, now, 0.05);
    this.wetGain.gain.setTargetAtTime(wetLevel, now, 0.05);
  }

  public setParams(newParams: SynthParams) {
    this.params = newParams;
    if (this.distortionNode) {
        this.updateDistortionCurve(this.params.distortion);
    }
    this.updateDelayParams();
  }

  public setSequence(seq: SequenceStep[]) {
    this.sequence = seq;
  }

  // Queue a new sequence to play at the start of the next loop (step 0)
  public queueSequence(seq: SequenceStep[]) {
    this.nextSequence = seq;
  }

  public setStepCallback(cb: (step: number) => void) {
    this.onStepCallback = cb;
  }
  
  public setPatternCompleteCallback(cb: () => void) {
    this.onPatternCompleteCallback = cb;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public async start() {
    if (!this.ctx) this.init();
    if (this.ctx?.state === 'suspended') {
      await this.ctx.resume();
    }
    
    this.isPlaying = true;
    this.currentStep = 0;
    this.nextNoteTime = this.ctx!.currentTime;
    this.scheduler();
  }

  public stop() {
    this.isPlaying = false;
    window.clearTimeout(this.timerID);
  }

  private noteToFreq(note: string, octaveShift: number): number {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const baseOctave = 2; // Acid bass sits low
    const noteIndex = notes.indexOf(note);
    
    // Calculate Semitones
    const semitoneOffset = noteIndex + ((baseOctave + octaveShift) * 12) + this.params.transpose;
    
    // Add Fine Tuning (cents) -> 100 cents = 1 semitone
    const fineTune = (this.params.tuning || 0) / 100;
    
    const midiNote = 12 + semitoneOffset + fineTune; 
    
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }

  private scheduler() {
    if (!this.ctx) return;
    // While there are notes that will need to play before the next interval, schedule them and advance the pointer.
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.currentStep, this.nextNoteTime);
      this.nextNote();
    }
    this.timerID = window.setTimeout(this.scheduler.bind(this), this.lookahead);
  }

  private nextNote() {
    const secondsPerBeat = 60.0 / this.params.tempo;
    const baseStepTime = 0.25 * secondsPerBeat; // Standard 16th note
    
    let stepDuration = baseStepTime;

    // Swing Logic:
    const swingFactor = (this.params.swing || 0) / 100;
    const swingOffset = baseStepTime * 0.33 * swingFactor;

    if (this.currentStep % 2 === 0) {
        stepDuration += swingOffset;
    } else {
        stepDuration -= swingOffset;
    }

    this.nextNoteTime += stepDuration;
    this.currentStep++;
    
    // Pattern Length Logic (Variable Step Length)
    // Defaults to 16, but can be truncated for polyrhythms
    const limit = this.params.patternLength || 16;

    if (this.currentStep >= limit) {
      this.currentStep = 0;
      
      // If a next sequence is queued, swap it in now so it plays on Step 0
      if (this.nextSequence) {
        this.sequence = this.nextSequence;
        this.nextSequence = null;
        if (this.onPatternCompleteCallback) this.onPatternCompleteCallback();
      }
    }
  }

  private scheduleNote(stepIndex: number, time: number) {
    if (!this.ctx || !this.distortionNode) return;

    // UI Callback
    const drawTime = (time - this.ctx.currentTime) * 1000;
    if (this.onStepCallback) {
        setTimeout(() => this.onStepCallback!(stepIndex), Math.max(0, drawTime));
    }

    // Wrap index safety in case length changed mid-bar
    if (stepIndex >= this.sequence.length) return;

    const step = this.sequence[stepIndex];
    if (!step.active) return;

    // --- SYNTHESIS VOICES ---
    
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const vca = this.ctx.createGain();

    osc.connect(filter);
    filter.connect(vca);
    vca.connect(this.distortionNode);

    osc.type = this.params.waveform;
    osc.frequency.value = this.noteToFreq(step.note, step.octaveShift);

    // Slide Logic (Variable Slide Time)
    // Previous step index logic handles wrap-around based on current length
    const limit = this.params.patternLength || 16;
    const prevStepIndex = stepIndex === 0 ? (limit - 1) : stepIndex - 1;
    const prevStep = this.sequence[prevStepIndex] || this.sequence[15]; // Fallback
    
    if (prevStep.active && prevStep.slide) {
        const prevFreq = this.noteToFreq(prevStep.note, prevStep.octaveShift);
        osc.frequency.setValueAtTime(prevFreq, time);
        // Use user-defined slide time
        const slideTime = this.params.slideTime || 0.1;
        osc.frequency.exponentialRampToValueAtTime(osc.frequency.value, time + slideTime);
    } else {
        osc.frequency.setValueAtTime(osc.frequency.value, time);
    }

    // Parameters
    const isAccent = step.accent;
    const accentIntensity = this.params.accent;

    const envModMult = isAccent ? (1.0 + accentIntensity) : 1.0;
    const peakFilter = this.params.cutoff + (this.params.envMod * envModMult);
    const minFilter = this.params.cutoff;
    
    filter.type = 'lowpass';
    filter.Q.value = this.params.resonance + (isAccent ? (10 * accentIntensity) : 0);
    
    filter.frequency.setValueAtTime(minFilter, time);
    filter.frequency.linearRampToValueAtTime(peakFilter, time + 0.005);
    const decayTime = isAccent ? (this.params.decay * 0.5) : this.params.decay; 
    filter.frequency.exponentialRampToValueAtTime(minFilter + 10, time + decayTime);

    vca.gain.setValueAtTime(0, time);
    const targetGain = 0.5 + (isAccent ? (0.4 * accentIntensity) : 0);
    vca.gain.linearRampToValueAtTime(targetGain, time + 0.005);
    
    const secondsPerBeat = 60.0 / this.params.tempo;
    const stepDuration = secondsPerBeat * 0.25;
    const gateTime = step.slide ? stepDuration : stepDuration * 0.6; 
    
    vca.gain.exponentialRampToValueAtTime(0.001, time + gateTime);

    osc.start(time);
    osc.stop(time + gateTime + 0.1 + (this.params.delayMix > 0 ? 0 : 0));
    
    osc.onended = () => {
        osc.disconnect();
        filter.disconnect();
        vca.disconnect();
    };
  }
}