export interface MidiMapping {
  id: string; // The unique ID of the UI parameter (e.g., 'cutoff', 'play')
  channel: number;
  cc?: number;   // For knobs/faders
  note?: number; // For buttons
}

// Global type declarations for Web MIDI API to ensure compatibility
// We only extend Navigator here to avoid conflicts with existing DOM types for MIDIAccess etc.
declare global {
  interface Navigator {
    requestMIDIAccess(options?: { sysex: boolean }): Promise<MIDIAccess>;
  }
}

class MidiService {
  private midiAccess: MIDIAccess | null = null;
  private mappings: MidiMapping[] = [];
  private learnCallback: ((mapping: MidiMapping) => void) | null = null;
  private inputCallback: ((id: string, value: number) => void) | null = null;

  constructor() {
    this.loadMappings();
  }

  async init() {
    if (!navigator.requestMIDIAccess) {
      console.warn("Web MIDI API not supported in this browser.");
      return;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess();
      
      // Listen to all currently connected inputs
      this.midiAccess.inputs.forEach((input) => {
        input.onmidimessage = this.handleMessage.bind(this);
      });

      // Handle hot-plugging (e.g. plugging in Xone K2 after load)
      this.midiAccess.onstatechange = (e: Event) => {
        // Cast generic Event to MIDIConnectionEvent to access .port
        const event = e as MIDIConnectionEvent;
        
        if (event.port && event.port.type === 'input' && event.port.state === 'connected') {
           (event.port as MIDIInput).onmidimessage = this.handleMessage.bind(this);
        }
      };
      
      console.log("MIDI Engine Initialized. Devices found:", this.midiAccess.inputs.size);
    } catch (err) {
      console.error("MIDI Init Failed", err);
    }
  }

  private handleMessage(event: MIDIMessageEvent) {
    const data = event.data;
    if (!data) return;

    const [status, data1, data2] = data;
    const command = status & 0xf0;
    const channel = status & 0x0f;

    // We primarily care about Note On (144) and Control Change (176)
    // Xone K2 often sends Note On for buttons and CC for faders/knobs
    if (command !== 144 && command !== 176 && command !== 128) return;

    // --- LEARNING MODE ---
    if (this.learnCallback) {
      // Ignore Note Off (128) or Note On with vel 0 for mapping purposes
      // This prevents mapping the "release" of a button immediately after pressing it
      if (command === 128 || (command === 144 && data2 === 0)) return;

      const newMapping: MidiMapping = {
        id: '', // ID will be injected by the UI handler
        channel: channel,
        cc: command === 176 ? data1 : undefined,
        note: command === 144 ? data1 : undefined
      };
      
      this.learnCallback(newMapping);
      return;
    }

    // --- NORMAL OPERATION ---
    if (this.inputCallback) {
      const mapping = this.mappings.find(m => {
        if (m.channel !== channel) return false;
        // Match CC
        if (command === 176 && m.cc === data1) return true;
        // Match Note (On or Off)
        if ((command === 144 || command === 128) && m.note === data1) return true;
        return false;
      });

      if (mapping) {
        let value = 0;
        
        if (command === 176) {
           // Normalize CC 0-127 to 0.0-1.0
           value = data2 / 127; 
        } else if (command === 144) {
           // Note On: value 1 if velocity > 0, else 0
           value = data2 > 0 ? 1 : 0;
        } else if (command === 128) {
           // Note Off: value 0
           value = 0;
        }
        
        this.inputCallback(mapping.id, value);
      }
    }
  }

  public startLearning(callback: (mapping: MidiMapping) => void) {
    this.learnCallback = callback;
  }

  public stopLearning() {
    this.learnCallback = null;
  }

  public setInputHandler(callback: (id: string, value: number) => void) {
    this.inputCallback = callback;
  }

  public saveMapping(id: string, mappingData: MidiMapping) {
    // Remove any existing mapping for this specific parameter
    this.mappings = this.mappings.filter(m => m.id !== id);
    
    // Add the new mapping
    this.mappings.push({ ...mappingData, id });
    this.persistMappings();
  }

  public clearMapping(id: string) {
    this.mappings = this.mappings.filter(m => m.id !== id);
    this.persistMappings();
  }

  public getMapping(id: string) {
    return this.mappings.find(m => m.id === id);
  }

  private persistMappings() {
    localStorage.setItem('acid303_midi_map', JSON.stringify(this.mappings));
  }

  private loadMappings() {
    const stored = localStorage.getItem('acid303_midi_map');
    if (stored) {
      try {
        this.mappings = JSON.parse(stored);
      } catch (e) {
        console.error("Failed to load MIDI mappings", e);
        this.mappings = [];
      }
    }
  }
}

export const midiService = new MidiService();