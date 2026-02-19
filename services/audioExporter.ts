import { SynthParams, SequenceStep } from '../types';

// Helper to calculate frequency (duplicated from Engine to ensure offline consistency)
const noteToFreq = (note: string, octaveShift: number, transpose: number, tuning: number): number => {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const baseOctave = 2; 
  const noteIndex = notes.indexOf(note);
  const semitoneOffset = noteIndex + ((baseOctave + octaveShift) * 12) + transpose;
  const fineTune = tuning / 100;
  const midiNote = 12 + semitoneOffset + fineTune; 
  return 440 * Math.pow(2, (midiNote - 69) / 12);
};

const createDistortionCurve = (amount: number): Float32Array => {
  const k = amount * 100;
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
  }
  return curve;
};

// Write WAV header
const bufferToWave = (abuffer: AudioBuffer, len: number) => {
  const numOfChan = abuffer.numberOfChannels;
  const length = len * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this example)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for(i = 0; i < abuffer.numberOfChannels; i++)
    channels.push(abuffer.getChannelData(i));

  while(pos < len) {
    for(i = 0; i < numOfChan; i++) {
      // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; // scale to 16-bit signed int
      view.setInt16(44 + offset, sample, true); // write 16-bit sample
      offset += 2;
    }
    pos++;
  }

  return new Blob([buffer], {type: "audio/wav"});

  function setUint16(data: any) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: any) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
};

export const exportToWav = async (
  sequence: SequenceStep[],
  params: SynthParams,
  loops: number = 4
): Promise<Blob> => {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const sampleRate = 44100;
  
  // Calculate duration with swing
  const secondsPerBeat = 60.0 / params.tempo;
  const baseStepDuration = secondsPerBeat * 0.25; 
  
  const patternLength = params.patternLength || 16;
  const loopDuration = baseStepDuration * patternLength;
  const totalDuration = loopDuration * loops;
  
  // Add delay tail to duration
  const tail = params.delayMix > 0 ? 2.0 : 0.1;
  
  // Create Offline Context
  const offlineCtx = new OfflineAudioContext(2, (sampleRate * totalDuration) + (sampleRate * tail), sampleRate);
  
  // Master Chain
  const masterGain = offlineCtx.createGain();
  masterGain.gain.value = 0.5;

  // FX Nodes
  const delayNode = offlineCtx.createDelay(5.0);
  const feedbackGain = offlineCtx.createGain();
  const dryGain = offlineCtx.createGain();
  const wetGain = offlineCtx.createGain();
  
  const distortionNode = offlineCtx.createWaveShaper();
  distortionNode.curve = createDistortionCurve(params.distortion);
  distortionNode.oversample = '4x';
  
  // Connect Graph
  distortionNode.connect(dryGain);
  distortionNode.connect(delayNode);
  
  delayNode.connect(feedbackGain);
  feedbackGain.connect(delayNode);
  delayNode.connect(wetGain);
  
  dryGain.connect(masterGain);
  wetGain.connect(masterGain);
  masterGain.connect(offlineCtx.destination);
  
  // Set FX Params
  delayNode.delayTime.value = params.delayTime;
  feedbackGain.gain.value = Math.min(0.95, params.delayFeedback);
  
  const mix = params.delayMix;
  dryGain.gain.value = Math.cos(mix * 0.5 * Math.PI);
  wetGain.gain.value = Math.sin(mix * 0.5 * Math.PI);
  
  // Schedule Notes
  let currentTime = 0;
  const swingFactor = (params.swing || 0) / 100;
  const swingOffset = baseStepDuration * 0.33 * swingFactor;
  
  for (let l = 0; l < loops; l++) {
    // Loop based on Pattern Length, not hardcoded 16
    for (let i = 0; i < patternLength; i++) {
        const step = sequence[i];
        
        // Determine start time for this step and duration for next logic
        let currentStepDuration = baseStepDuration;
        if (i % 2 === 0) {
            currentStepDuration += swingOffset;
        } else {
            currentStepDuration -= swingOffset;
        }

        if (step.active) {
            const osc = offlineCtx.createOscillator();
            const filter = offlineCtx.createBiquadFilter();
            const vca = offlineCtx.createGain();
            
            osc.connect(filter);
            filter.connect(vca);
            vca.connect(distortionNode);
            
            osc.type = params.waveform;
            osc.frequency.value = noteToFreq(step.note, step.octaveShift, params.transpose, params.tuning || 0);
            
            // Slide (Simplified offline)
            const prevIndex = i === 0 ? (patternLength - 1) : i - 1;
            const prevStep = sequence[prevIndex];
            
            if (prevStep.active && prevStep.slide) {
                const prevFreq = noteToFreq(prevStep.note, prevStep.octaveShift, params.transpose, params.tuning || 0);
                osc.frequency.setValueAtTime(prevFreq, currentTime);
                const slideTime = params.slideTime || 0.1;
                osc.frequency.exponentialRampToValueAtTime(osc.frequency.value, currentTime + slideTime);
            } else {
                osc.frequency.setValueAtTime(osc.frequency.value, currentTime);
            }

            // Envelopes
            const isAccent = step.accent;
            const accentIntensity = params.accent;

            const envModMult = isAccent ? (1.0 + accentIntensity) : 1.0;
            const peakFilter = params.cutoff + (params.envMod * envModMult);
            const minFilter = params.cutoff;
            
            filter.type = 'lowpass';
            filter.Q.value = params.resonance + (isAccent ? (10 * accentIntensity) : 0);
            
            filter.frequency.setValueAtTime(minFilter, currentTime);
            filter.frequency.linearRampToValueAtTime(peakFilter, currentTime + 0.005);
            const decayTime = isAccent ? (params.decay * 0.5) : params.decay;
            filter.frequency.exponentialRampToValueAtTime(minFilter + 10, currentTime + decayTime);
            
            vca.gain.setValueAtTime(0, currentTime);
            const targetGain = 0.5 + (isAccent ? (0.4 * accentIntensity) : 0);
            vca.gain.linearRampToValueAtTime(targetGain, currentTime + 0.005);
            
            const gateTime = step.slide ? baseStepDuration : baseStepDuration * 0.6;
            vca.gain.exponentialRampToValueAtTime(0.001, currentTime + gateTime);
            
            osc.start(currentTime);
            osc.stop(currentTime + gateTime + 0.1);
        }
        currentTime += currentStepDuration;
    }
  }
  
  const renderedBuffer = await offlineCtx.startRendering();
  return bufferToWave(renderedBuffer, renderedBuffer.length);
};