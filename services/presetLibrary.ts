import { Preset, DEFAULT_PARAMS, DEFAULT_SEQUENCE, Waveform, SequenceStep } from '../types';

// Helper to create empty bank
const createBank = (initialSeq: SequenceStep[]) => {
    const bank = Array(8).fill(null).map((_, i) => 
        // Slot 0 gets the initial sequence, others are cleared
        i === 0 ? initialSeq : DEFAULT_SEQUENCE.map(s => ({...s, active: false}))
    );
    return bank;
};

const BUILT_IN_PRESETS: Preset[] = [
  {
    id: 'init',
    name: 'Init Pattern',
    params: DEFAULT_PARAMS,
    sequence: DEFAULT_SEQUENCE,
    patterns: createBank(DEFAULT_SEQUENCE)
  },
  {
    id: 'acid-house-1',
    name: 'Classic Acid House',
    params: { 
        ...DEFAULT_PARAMS, 
        cutoff: 300, 
        resonance: 18, 
        distortion: 2, 
        tempo: 128,
        tuning: 0,
        swing: 25,
        transpose: 0,
        patternLength: 16,
        slideTime: 0.12,
        delayMix: 0.3,
        delayTime: 0.35,
        delayFeedback: 0.5
    },
    sequence: [
      { id: 0, active: true, note: 'C', accent: true, slide: false, octaveShift: -1 },
      { id: 1, active: false, note: 'C', accent: false, slide: false, octaveShift: 0 },
      { id: 2, active: true, note: 'C', accent: false, slide: true, octaveShift: 0 },
      { id: 3, active: true, note: 'A#', accent: false, slide: false, octaveShift: 0 },
      { id: 4, active: true, note: 'G', accent: true, slide: false, octaveShift: -1 },
      { id: 5, active: false, note: 'C', accent: false, slide: false, octaveShift: 0 },
      { id: 6, active: true, note: 'C', accent: false, slide: true, octaveShift: 1 },
      { id: 7, active: false, note: 'C', accent: false, slide: false, octaveShift: 0 },
      { id: 8, active: true, note: 'C', accent: true, slide: false, octaveShift: -1 },
      { id: 9, active: false, note: 'C', accent: false, slide: false, octaveShift: 0 },
      { id: 10, active: true, note: 'D#', accent: false, slide: true, octaveShift: 0 },
      { id: 11, active: true, note: 'F', accent: false, slide: false, octaveShift: 0 },
      { id: 12, active: true, note: 'C', accent: true, slide: false, octaveShift: -1 },
      { id: 13, active: true, note: 'C', accent: false, slide: true, octaveShift: 0 },
      { id: 14, active: false, note: 'C', accent: false, slide: false, octaveShift: 0 },
      { id: 15, active: true, note: 'A#', accent: false, slide: false, octaveShift: -1 },
    ],
    // For simplicity, we just duplicate this pattern into slot 0 of the bank
    patterns: createBank([
      { id: 0, active: true, note: 'C', accent: true, slide: false, octaveShift: -1 },
      { id: 1, active: false, note: 'C', accent: false, slide: false, octaveShift: 0 },
      { id: 2, active: true, note: 'C', accent: false, slide: true, octaveShift: 0 },
      { id: 3, active: true, note: 'A#', accent: false, slide: false, octaveShift: 0 },
      { id: 4, active: true, note: 'G', accent: true, slide: false, octaveShift: -1 },
      { id: 5, active: false, note: 'C', accent: false, slide: false, octaveShift: 0 },
      { id: 6, active: true, note: 'C', accent: false, slide: true, octaveShift: 1 },
      { id: 7, active: false, note: 'C', accent: false, slide: false, octaveShift: 0 },
      { id: 8, active: true, note: 'C', accent: true, slide: false, octaveShift: -1 },
      { id: 9, active: false, note: 'C', accent: false, slide: false, octaveShift: 0 },
      { id: 10, active: true, note: 'D#', accent: false, slide: true, octaveShift: 0 },
      { id: 11, active: true, note: 'F', accent: false, slide: false, octaveShift: 0 },
      { id: 12, active: true, note: 'C', accent: true, slide: false, octaveShift: -1 },
      { id: 13, active: true, note: 'C', accent: false, slide: true, octaveShift: 0 },
      { id: 14, active: false, note: 'C', accent: false, slide: false, octaveShift: 0 },
      { id: 15, active: true, note: 'A#', accent: false, slide: false, octaveShift: -1 },
    ])
  },
  {
    id: 'hard-techno',
    name: 'Hard Techno Rumble',
    params: { 
        ...DEFAULT_PARAMS, 
        cutoff: 200, 
        resonance: 10, 
        distortion: 8, 
        envMod: 3000, 
        decay: 0.3, 
        waveform: Waveform.SQUARE, 
        tempo: 140,
        tuning: 0,
        swing: 0,
        transpose: -2,
        patternLength: 14, // Polyrhythm
        slideTime: 0.08,
        delayMix: 0.1,
        delayTime: 0.15,
        delayFeedback: 0.3 
    },
    sequence: Array.from({ length: 16 }, (_, i) => ({
      id: i,
      active: true,
      note: i % 2 === 0 ? 'C' : 'C',
      accent: i % 4 === 0,
      slide: Math.random() > 0.5,
      octaveShift: -1
    })),
    patterns: createBank(Array.from({ length: 16 }, (_, i) => ({
      id: i,
      active: true,
      note: i % 2 === 0 ? 'C' : 'C',
      accent: i % 4 === 0,
      slide: Math.random() > 0.5,
      octaveShift: -1
    })))
  },
  {
    id: 'squelch-master',
    name: 'Squelch Master',
    params: { 
        ...DEFAULT_PARAMS, 
        cutoff: 800, 
        resonance: 28, 
        envMod: 4000, 
        decay: 0.2, 
        distortion: 4, 
        tempo: 135,
        tuning: 10,
        swing: 10,
        transpose: 0,
        patternLength: 16,
        slideTime: 0.25, // Long slides
        delayMix: 0.5,
        delayTime: 0.25,
        delayFeedback: 0.7
    },
    sequence: DEFAULT_SEQUENCE.map(s => ({ ...s, active: Math.random() > 0.3, slide: true })),
    patterns: createBank(DEFAULT_SEQUENCE.map(s => ({ ...s, active: Math.random() > 0.3, slide: true })))
  }
];

const STORAGE_KEY = 'acid303_user_presets';

export const PresetLibrary = {
  getPresets: (): Preset[] => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const userPresets = stored ? JSON.parse(stored) : [];
    return [...BUILT_IN_PRESETS, ...userPresets];
  },

  savePreset: (name: string, params: any, sequence: any, patterns?: SequenceStep[][]): Preset => {
    const newPreset: Preset = {
      id: `user-${Date.now()}`,
      name,
      params,
      sequence, // Kept for backward compat
      patterns: patterns || createBank(sequence),
      isUser: true
    };
    
    const stored = localStorage.getItem(STORAGE_KEY);
    const userPresets = stored ? JSON.parse(stored) : [];
    userPresets.push(newPreset);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userPresets));
    return newPreset;
  },

  deletePreset: (id: string) => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const userPresets = JSON.parse(stored).filter((p: Preset) => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userPresets));
  }
};