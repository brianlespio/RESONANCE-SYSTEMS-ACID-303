export enum Waveform {
  SAWTOOTH = 'sawtooth',
  SQUARE = 'square'
}

export interface SynthParams {
  cutoff: number;      // Filter cutoff frequency (Hz)
  resonance: number;   // Filter resonance (Q)
  envMod: number;      // Envelope modulation amount
  decay: number;       // Envelope decay time (s)
  accent: number;      // Accent volume boost
  waveform: Waveform;  // Oscillator type
  distortion: number;  // Distortion amount
  tempo: number;       // BPM
  
  // Sequencer Controls
  tuning: number;      // Fine tune (-50 to +50 cents) - TB-303 specific
  swing: number;       // 0 to 100% (Groove)
  transpose: number;   // -12 to +12 semitones
  patternLength: number; // 1 to 16 steps (Variable Pattern Length)
  slideTime: number;   // Portamento time (s) - Modded 303 feature
  
  // FX - Delay
  delayTime: number;     // 0.01 to 1.0 seconds
  delayFeedback: number; // 0.0 to 0.9
  delayMix: number;      // 0.0 (Dry) to 1.0 (Wet)
}

export interface SequenceStep {
  id: number;
  active: boolean;
  note: string;     // e.g., "C2", "A#1"
  accent: boolean;  // 303 Accent (louder + more filter)
  slide: boolean;   // 303 Slide (portamento to next note)
  octaveShift: number; // -1, 0, +1
}

export interface Preset {
  id: string;
  name: string;
  params: SynthParams;
  sequence: SequenceStep[]; // Main/Legacy sequence (usually Pattern A)
  patterns?: SequenceStep[][]; // Bank of 8 patterns (optional for backward compat)
  isUser?: boolean;
}

export const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const DEFAULT_SEQUENCE: SequenceStep[] = Array.from({ length: 16 }, (_, i) => ({
  id: i,
  active: i % 4 === 0,
  note: 'C',
  accent: false,
  slide: false,
  octaveShift: 0
}));

export const DEFAULT_PARAMS: SynthParams = {
  cutoff: 400,
  resonance: 15,
  envMod: 2000,
  decay: 0.4,
  accent: 0.5,
  waveform: Waveform.SAWTOOTH,
  distortion: 0,
  tempo: 124,
  tuning: 0,
  swing: 0,
  transpose: 0,
  patternLength: 16,
  slideTime: 0.1, // Classic 303 is approx 60-100ms
  delayTime: 0.3,
  delayFeedback: 0.4,
  delayMix: 0
};