import { GoogleGenAI, Type } from "@google/genai";
import { SequenceStep, NOTES, SynthParams, Waveform } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function generateAcidPattern(
  currentTempo: number,
  description: string
): Promise<SequenceStep[]> {
  try {
    const model = "gemini-3-flash-preview";
    
    const prompt = `
      Create a 16-step TB-303 Acid Bass sequence.
      Style/Vibe: ${description}
      Tempo is ${currentTempo}.
      
      Rules:
      - Use notes from C, C#, D, D#, E, F, F#, G, G#, A, A#, B.
      - octaveShift should be -1, 0, or 1.
      - 'active' determines if the note plays.
      - 'accent' makes it louder and squelchier.
      - 'slide' glides to the next note.
      - Create a groovy, rhythmic, syncopated bassline typical of Acid House or Techno.
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.INTEGER },
              active: { type: Type.BOOLEAN },
              note: { type: Type.STRING },
              accent: { type: Type.BOOLEAN },
              slide: { type: Type.BOOLEAN },
              octaveShift: { type: Type.INTEGER }
            },
            required: ["id", "active", "note", "accent", "slide", "octaveShift"]
          }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No data returned from Gemini");

    const rawData = JSON.parse(jsonText);
    
    // Validate and Sanitize
    return rawData.map((step: any, index: number) => ({
      id: index,
      active: Boolean(step.active),
      note: NOTES.includes(step.note) ? step.note : 'C',
      accent: Boolean(step.accent),
      slide: Boolean(step.slide),
      octaveShift: Math.max(-1, Math.min(1, Number(step.octaveShift) || 0))
    })).slice(0, 16);

  } catch (error) {
    console.error("Gemini generation failed:", error);
    // Return empty array or throw to be handled by UI
    throw error;
  }
}

export async function generateSynthParams(
  description: string
): Promise<SynthParams> {
  try {
    const model = "gemini-3-flash-preview";
    
    const prompt = `
      Act as a sound designer for a TB-303 Acid Synthesizer.
      Create a patch (knob settings) matching this description: "${description}".

      Parameter Ranges:
      - cutoff: 20 to 1000 (Frequency in Hz)
      - resonance: 0 to 30 (Filter Q)
      - envMod: 0 to 5000 (Envelope Modulation depth)
      - decay: 0.1 to 2.0 (Decay time in seconds)
      - accent: 0 to 1 (Accent intensity)
      - waveform: 'sawtooth' or 'square'
      - distortion: 0 to 10 (Drive amount)
      - delayTime: 0.05 to 1.0 (Seconds)
      - delayFeedback: 0 to 0.95
      - delayMix: 0 to 1 (Wet/Dry)
      - tempo: 60 to 200 (BPM)
      - patternLength: 1 to 16
      - slideTime: 0.05 to 0.4

      Ensure the sound matches the vibe (e.g. "liquid", "aggressive", "hollow", "distorted").
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cutoff: { type: Type.NUMBER },
            resonance: { type: Type.NUMBER },
            envMod: { type: Type.NUMBER },
            decay: { type: Type.NUMBER },
            accent: { type: Type.NUMBER },
            waveform: { type: Type.STRING, enum: ["sawtooth", "square"] },
            distortion: { type: Type.NUMBER },
            tempo: { type: Type.NUMBER },
            delayTime: { type: Type.NUMBER },
            delayFeedback: { type: Type.NUMBER },
            delayMix: { type: Type.NUMBER },
            patternLength: { type: Type.INTEGER },
            slideTime: { type: Type.NUMBER }
          },
          required: ["cutoff", "resonance", "envMod", "decay", "waveform", "distortion"]
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No data returned from Gemini");
    
    const data = JSON.parse(jsonText);
    
    // Sanitize return values to ensure they stay within UI bounds
    return {
      cutoff: Math.max(20, Math.min(1000, data.cutoff)),
      resonance: Math.max(0, Math.min(30, data.resonance)),
      envMod: Math.max(0, Math.min(5000, data.envMod)),
      decay: Math.max(0.1, Math.min(2.0, data.decay)),
      accent: Math.max(0, Math.min(1, data.accent)),
      waveform: data.waveform === 'square' ? Waveform.SQUARE : Waveform.SAWTOOTH,
      distortion: Math.max(0, Math.min(10, data.distortion)),
      tempo: Math.max(60, Math.min(200, data.tempo || 120)),
      tuning: 0,
      swing: 0,
      transpose: 0,
      patternLength: Math.max(1, Math.min(16, data.patternLength || 16)),
      slideTime: Math.max(0.01, Math.min(0.5, data.slideTime || 0.1)),
      delayTime: Math.max(0.05, Math.min(1.0, data.delayTime || 0.3)),
      delayFeedback: Math.max(0, Math.min(0.95, data.delayFeedback || 0)),
      delayMix: Math.max(0, Math.min(1, data.delayMix || 0))
    };

  } catch (error) {
    console.error("Gemini sound design failed:", error);
    throw error;
  }
}