import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Square, RefreshCw, Zap, Volume2, Trash2, Wand2, X, FolderOpen, Download, Cable, Activity, Layers, Copy, Link as LinkIcon, Music, Sliders, Settings2 } from 'lucide-react';
import { AudioEngine } from './services/audioEngine';
import { generateAcidPattern, generateSynthParams } from './services/geminiService';
import { PresetLibrary } from './services/presetLibrary';
import { exportToWav } from './services/audioExporter';
import { midiService } from './services/midiService';
import Knob from './components/Knob';
import Oscilloscope from './components/Oscilloscope';
import PresetModal from './components/PresetModal';
import { SequenceStep, SynthParams, Waveform, DEFAULT_SEQUENCE, DEFAULT_PARAMS, NOTES, Preset } from './types';

const App: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(-1);
  const [params, setParams] = useState<SynthParams>(DEFAULT_PARAMS);
  
  // Pattern Bank State
  const [patternBank, setPatternBank] = useState<SequenceStep[][]>(
    Array(8).fill(null).map((_, i) => i === 0 ? [...DEFAULT_SEQUENCE] : DEFAULT_SEQUENCE.map(s => ({...s, active: false})))
  );
  const [activePatternIdx, setActivePatternIdx] = useState(0); // The pattern currently playing
  const [viewPatternIdx, setViewPatternIdx] = useState(0);     // The pattern currently being edited
  const [nextPatternIdx, setNextPatternIdx] = useState<number | null>(null); // Queued for next bar

  // Chain Mode State
  const [chainMode, setChainMode] = useState(false);
  const [chainSelection, setChainSelection] = useState<number[]>([0]); // Default chain is just Pattern A

  // Derived state for current sequence being edited
  const sequence = useMemo(() => patternBank[viewPatternIdx], [patternBank, viewPatternIdx]);
  
  const [selectedStepId, setSelectedStepId] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("dark techno acid");
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // MIDI State
  const [isMidiMapping, setIsMidiMapping] = useState(false);
  const [listeningParam, setListeningParam] = useState<string | null>(null);

  // Audio Engine Instance
  const engine = useRef<AudioEngine | null>(null);
  const paramsRef = useRef(params);
  const isPlayingRef = useRef(isPlaying);
  // Refs for chain logic to be accessible inside callbacks
  const chainModeRef = useRef(chainMode);
  const chainSelectionRef = useRef(chainSelection);
  const patternBankRef = useRef(patternBank);
  const activePatternIdxRef = useRef(activePatternIdx);

  useEffect(() => {
      paramsRef.current = params;
      isPlayingRef.current = isPlaying;
      chainModeRef.current = chainMode;
      chainSelectionRef.current = chainSelection;
      patternBankRef.current = patternBank;
      activePatternIdxRef.current = activePatternIdx;
  }, [params, isPlaying, chainMode, chainSelection, patternBank, activePatternIdx]);

  // Initialize Engine, Presets and MIDI
  useEffect(() => {
    engine.current = new AudioEngine(params);
    engine.current.setSequence(patternBank[0]);
    engine.current.setStepCallback((step) => {
        setCurrentStep(step);
        // Queue next pattern logic near end of bar (step 14 = 2nd to last 16th note)
        if (step === 14) {
            handleAutoQueue();
        }
    });
    
    // Fallback: update UI when engine internally swaps pattern (at step 0)
    engine.current.setPatternCompleteCallback(() => {
        // This runs when step 0 starts with a NEW sequence
        // We need to sync our UI state 'activePatternIdx' to match
        // Note: This needs careful sync with handleAutoQueue
    });
    
    setPresets(PresetLibrary.getPresets());
    midiService.init();
    midiService.setInputHandler(handleMidiInput);

    return () => {
      engine.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAutoQueue = () => {
      if (!engine.current) return;

      if (chainModeRef.current) {
          // CHAIN LOGIC
          const currentChainIndex = chainSelectionRef.current.indexOf(activePatternIdxRef.current);
          let nextChainIndex = 0;
          
          if (currentChainIndex !== -1 && currentChainIndex < chainSelectionRef.current.length - 1) {
              nextChainIndex = currentChainIndex + 1;
          } else {
              // Wrap to start of chain
              nextChainIndex = 0;
          }
          
          const nextPatternId = chainSelectionRef.current[nextChainIndex];
          const nextSeq = patternBankRef.current[nextPatternId];
          
          // Queue it in engine
          engine.current.queueSequence(nextSeq);
          
          // Update UI state for "Next"
          setNextPatternIdx(nextPatternId);
          
          // Delay the actual "Active" switch until the bar actually ends? 
          // For UI simplicity, we can set a timeout or rely on engine callback.
          // Let's rely on a timeout to flip the "Active" UI roughly when bar resets
          const tempo = paramsRef.current.tempo;
          const stepTime = (60/tempo) * 0.25;
          setTimeout(() => {
              setActivePatternIdx(nextPatternId);
              setViewPatternIdx(nextPatternId); // Auto-follow view in chain mode
              setNextPatternIdx(null);
          }, stepTime * 2 * 1000); // Wait 2 steps (approx)
      } else {
          // MANUAL QUEUE LOGIC
          // If user clicked a button (setting setNextPatternIdx), queue it now
          // We can't access React state 'nextPatternIdx' reliably here if it wasn't in a Ref, 
          // but we actually set queue immediately on click. 
          // This block checks if we need to do anything else.
      }
  };

  const handleMidiInput = (id: string, value: number) => {
    if (id === 'play_toggle' && value > 0.5) { 
       togglePlay();
       return;
    }
    // ... (rest of midi handling same as before)
    if (id === 'waveform') {
        const wf = value > 0.5 ? Waveform.SQUARE : Waveform.SAWTOOTH;
        setParams(prev => ({ ...prev, waveform: wf }));
        return;
    }
    let min = 0, max = 100;
    switch(id) {
        case 'cutoff': min = 20; max = 1000; break;
        case 'resonance': min = 0; max = 30; break;
        case 'envMod': min = 0; max = 5000; break;
        case 'decay': min = 0.1; max = 2.0; break;
        case 'accent': min = 0; max = 1; break;
        case 'distortion': min = 0; max = 10; break;
        case 'tempo': min = 60; max = 200; break;
        case 'tuning': min = -50; max = 50; break;
        case 'swing': min = 0; max = 100; break;
        case 'transpose': min = -12; max = 12; break;
        case 'delayTime': min = 0.05; max = 1.0; break;
        case 'delayFeedback': min = 0; max = 0.95; break;
        case 'delayMix': min = 0; max = 1; break;
        case 'patternLength': min = 1; max = 16; break;
        case 'slideTime': min = 0.05; max = 0.4; break;
    }
    const actualValue = min + (value * (max - min));
    setParams(prev => ({ ...prev, [id]: actualValue }));
  };

  // Sync Params
  useEffect(() => { engine.current?.setParams(params); }, [params]);

  // Sync Current Edited Sequence (Instant update if editing currently playing pattern)
  useEffect(() => {
      // If we are viewing the active pattern, update engine immediately
      if (viewPatternIdx === activePatternIdx) {
          engine.current?.setSequence(patternBank[viewPatternIdx]);
      }
  }, [patternBank, viewPatternIdx, activePatternIdx]);

  const togglePlay = async () => {
    if (!engine.current) return;
    if (isPlaying) {
      engine.current.stop();
      setIsPlaying(false);
      setCurrentStep(-1);
    } else {
      await engine.current.start();
      setIsPlaying(true);
    }
  };

  const updateParam = <K extends keyof SynthParams>(key: K, value: SynthParams[K]) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  // Step Editing Wrapper
  const updateSequenceStep = (newStepFn: (prev: SequenceStep[]) => SequenceStep[]) => {
      setPatternBank(prevBank => {
          const newBank = [...prevBank];
          newBank[viewPatternIdx] = newStepFn(newBank[viewPatternIdx]);
          return newBank;
      });
  };

  const toggleStepActive = (id: number) => {
    updateSequenceStep(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
  };

  const updateStep = <K extends keyof SequenceStep>(id: number, key: K, value: SequenceStep[K]) => {
    updateSequenceStep(prev => prev.map(s => s.id === id ? { ...s, [key]: value } : s));
  };

  const clearPattern = () => {
    updateSequenceStep(prev => prev.map(s => ({ ...s, active: false, accent: false, slide: false })));
  };

  const randomizePattern = () => {
    updateSequenceStep(prev => prev.map(s => ({
      ...s,
      active: Math.random() > 0.4,
      note: NOTES[Math.floor(Math.random() * 12)],
      accent: Math.random() > 0.7,
      slide: Math.random() > 0.7,
      octaveShift: Math.random() > 0.8 ? 1 : (Math.random() > 0.8 ? -1 : 0)
    })));
  };

  const copyPattern = () => {
      localStorage.setItem('acid303_clipboard', JSON.stringify(patternBank[viewPatternIdx]));
  };

  const pastePattern = () => {
      const stored = localStorage.getItem('acid303_clipboard');
      if (stored) {
          const loadedSeq = JSON.parse(stored);
          setPatternBank(prev => {
              const newBank = [...prev];
              newBank[viewPatternIdx] = loadedSeq;
              return newBank;
          });
      }
  };

  const handlePatternSelect = (idx: number) => {
      if (chainMode) {
          setChainSelection(prev => {
              if (prev.includes(idx)) {
                  if (prev.length === 1) return prev;
                  return prev.filter(i => i !== idx).sort((a,b) => a-b);
              } else {
                  return [...prev, idx].sort((a,b) => a-b);
              }
          });
          setViewPatternIdx(idx);
      } else {
          setViewPatternIdx(idx);
          if (isPlaying) {
              setNextPatternIdx(idx);
              engine.current?.queueSequence(patternBank[idx]);
              const tempo = params.tempo;
              const stepTime = (60/tempo) * 0.25;
              const stepsLeft = 16 - currentStep;
              setTimeout(() => {
                  setActivePatternIdx(idx);
                  setNextPatternIdx(null);
              }, stepsLeft * stepTime * 1000); 
          } else {
              setActivePatternIdx(idx);
              engine.current?.setSequence(patternBank[idx]);
          }
      }
  };

  const handleAiGeneratePattern = async () => {
    setIsGenerating(true);
    try {
        const newSeq = await generateAcidPattern(params.tempo, aiPrompt);
        setPatternBank(prev => {
            const newBank = [...prev];
            newBank[viewPatternIdx] = newSeq;
            return newBank;
        });
    } catch (e) {
        alert("Failed to generate pattern.");
    } finally {
        setIsGenerating(false);
    }
  };

  const handleAiGenerateSound = async () => {
    setIsGenerating(true);
    try {
        const newParams = await generateSynthParams(aiPrompt);
        setParams(newParams);
    } catch (e) {
        alert("Failed to generate sound patch.");
    } finally {
        setIsGenerating(false);
    }
  };
  
  const handleExport = async () => {
    setIsExporting(true);
    try {
        const blob = await exportToWav(patternBank[viewPatternIdx], params, 4); 
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `acid-export-${Date.now()}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error(e);
        alert("Export failed.");
    } finally {
        setIsExporting(false);
    }
  };
  
  // MIDI Mapping Handlers
  const toggleMidiMode = () => {
      const newState = !isMidiMapping;
      setIsMidiMapping(newState);
      if (!newState) {
          midiService.stopLearning();
          setListeningParam(null);
      }
  };

  const handleMapSelect = (paramId: string) => {
      if (!isMidiMapping) return;
      setListeningParam(paramId);
      midiService.clearMapping(paramId);
      midiService.startLearning((mapping) => {
          midiService.saveMapping(paramId, mapping);
          setListeningParam(null);
          midiService.stopLearning();
      });
  };

  const isMapped = (id: string) => !!midiService.getMapping(id);
  const analyser = useMemo(() => engine.current?.getAnalyser() || null, [engine.current]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-2 font-inter">
      <div className={`max-w-4xl w-full bg-slate-900 rounded-xl shadow-2xl overflow-hidden border relative transition-colors duration-300 ${isMidiMapping ? 'border-amber-500' : 'border-slate-700'}`}>
        <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/brushed-alum-dark.png')]"></div>

        {/* Status Bar for MIDI Mapping */}
        {isMidiMapping && (
             <div className="absolute top-0 left-0 right-0 z-[60] bg-slate-950/95 backdrop-blur-sm border-b border-amber-500/50 text-slate-200 text-[10px] font-bold py-1.5 px-3 flex items-center justify-between shadow-2xl animate-in slide-in-from-top duration-300">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_red]" />
                    <span className="tracking-widest text-amber-500">MIDI MAPPING ACTIVE</span>
                </div>
                <div className="text-slate-300 font-mono">
                    {listeningParam 
                        ? <span className="text-red-400 animate-pulse">WAITING FOR MIDI SIGNAL: {listeningParam.toUpperCase()}</span>
                        : <span className="opacity-70">CLICK A CONTROL TO MAP</span>}
                </div>
                <button onClick={toggleMidiMode} className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-slate-300"><X size={12} /></button>
            </div>
        )}

        {/* Top Control Section - Compact */}
        <div className="relative z-10 bg-gradient-to-b from-slate-800 to-slate-900 border-b border-slate-950 p-3">
            {/* Header / Brand */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 select-none">
                    {/* Logo: Rayo Monocromático (using Amber for brand consistency with this specific model) */}
                    <div className="w-8 h-8 bg-slate-800 rounded flex items-center justify-center border border-slate-700 shadow-inner">
                        <Zap className="text-amber-500" size={18} fill="currentColor" />
                    </div>
                    <div className="flex flex-col justify-center">
                        <span className="text-[8px] font-bold text-slate-500 tracking-[0.2em] uppercase leading-none mb-0.5">RESONANCE SYSTEMS</span>
                        <span className="text-lg font-black italic text-slate-100 tracking-tighter leading-none">
                            ACID <span className="text-amber-500">303</span>
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-3 bg-slate-950/40 p-1 rounded-lg border border-slate-800 relative group/play">
                     {isMidiMapping && (
                        <div 
                            onClick={() => handleMapSelect('play_toggle')} 
                            className={`absolute -inset-1 z-50 rounded-lg border-2 flex items-center justify-center cursor-pointer backdrop-blur-[1px]
                                ${listeningParam === 'play_toggle' ? 'border-red-500 bg-red-500/10 animate-pulse' : (isMapped('play_toggle') ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-600 bg-slate-900/60 hover:border-amber-500')}
                            `}
                        >
                             {listeningParam === 'play_toggle' && <span className="text-[8px] font-black text-red-500 bg-slate-950 px-1 rounded">LEARN</span>}
                        </div>
                     )}
                     <button 
                       onClick={isMidiMapping ? () => handleMapSelect('play_toggle') : togglePlay}
                       className={`w-8 h-8 rounded flex items-center justify-center transition-all border-b-2 active:border-b-0 active:translate-y-[2px] 
                         ${isPlaying 
                           ? 'bg-red-600 border-red-800 text-white shadow-[0_0_10px_rgba(220,38,38,0.5)]' 
                           : 'bg-slate-700 border-slate-900 text-slate-300 hover:bg-slate-600'
                       }`}
                     >
                       {isPlaying ? <Square fill="currentColor" size={14} /> : <Play fill="currentColor" size={14} />}
                     </button>
                     
                     <div className="h-5 w-px bg-slate-700 mx-1"></div>
                     
                     <div className="flex flex-col gap-0.5 px-1 relative group/wave">
                        {isMidiMapping && (
                            <div 
                                onClick={() => handleMapSelect('waveform')} 
                                className={`absolute -inset-1 z-50 rounded border-2 flex items-center justify-center cursor-pointer backdrop-blur-[1px]
                                    ${listeningParam === 'waveform' ? 'border-red-500 bg-red-500/10 animate-pulse' : (isMapped('waveform') ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-600 bg-slate-900/60 hover:border-amber-500')}
                                `}
                            >
                                {listeningParam === 'waveform' && <span className="text-[8px] font-black text-red-500 bg-slate-950 px-1 rounded">LEARN</span>}
                            </div>
                        )}
                        <span className="text-[7px] font-bold text-slate-500 uppercase text-center leading-none">Wave</span>
                        <div className="flex bg-slate-900 rounded border border-slate-800 overflow-hidden">
                            <button onClick={() => updateParam('waveform', Waveform.SAWTOOTH)} className={`px-1.5 py-0.5 ${params.waveform === Waveform.SAWTOOTH ? 'bg-amber-500 text-slate-900' : 'text-slate-500 hover:text-slate-300'}`}><Zap size={10} /></button>
                            <button onClick={() => updateParam('waveform', Waveform.SQUARE)} className={`px-1.5 py-0.5 ${params.waveform === Waveform.SQUARE ? 'bg-amber-500 text-slate-900' : 'text-slate-500 hover:text-slate-300'}`}><Square size={10} /></button>
                        </div>
                     </div>
                </div>

                <div className="hidden sm:block w-32 h-8 bg-slate-950 rounded border border-slate-800 overflow-hidden opacity-70">
                    <Oscilloscope analyser={analyser} />
                </div>
            </div>

            {/* Knobs - Tighter Grid */}
            <div className="flex flex-wrap justify-center sm:justify-between items-end gap-x-1 gap-y-2 px-1 pb-1">
                 <Knob label="Tune" value={params.tuning} min={-50} max={50} onChange={v => updateParam('tuning', v)} size={48} 
                       isMapping={isMidiMapping} isListening={listeningParam === 'tuning'} isMapped={isMapped('tuning')} onMapSelect={() => handleMapSelect('tuning')} />
                 <Knob label="Cutoff" value={params.cutoff} min={20} max={1000} onChange={v => updateParam('cutoff', v)} size={48} 
                       isMapping={isMidiMapping} isListening={listeningParam === 'cutoff'} isMapped={isMapped('cutoff')} onMapSelect={() => handleMapSelect('cutoff')} />
                 <Knob label="Resonance" value={params.resonance} min={0} max={30} onChange={v => updateParam('resonance', v)} size={48}
                       isMapping={isMidiMapping} isListening={listeningParam === 'resonance'} isMapped={isMapped('resonance')} onMapSelect={() => handleMapSelect('resonance')} />
                 <Knob label="Env Mod" value={params.envMod} min={0} max={5000} onChange={v => updateParam('envMod', v)} size={48}
                       isMapping={isMidiMapping} isListening={listeningParam === 'envMod'} isMapped={isMapped('envMod')} onMapSelect={() => handleMapSelect('envMod')} />
                 <Knob label="Decay" value={params.decay} min={0.1} max={2.0} onChange={v => updateParam('decay', v)} size={48}
                       isMapping={isMidiMapping} isListening={listeningParam === 'decay'} isMapped={isMapped('decay')} onMapSelect={() => handleMapSelect('decay')} />
                 <Knob label="Accent" value={params.accent} min={0} max={1} onChange={v => updateParam('accent', v)} size={48}
                       isMapping={isMidiMapping} isListening={listeningParam === 'accent'} isMapped={isMapped('accent')} onMapSelect={() => handleMapSelect('accent')} />
                 
                 {/* Divider */}
                 <div className="hidden sm:block w-px h-8 bg-slate-700 mx-1 self-center"></div>
                 
                 <Knob label="Tempo" value={params.tempo} min={60} max={200} onChange={v => updateParam('tempo', v)} size={48} color="#3b82f6"
                       isMapping={isMidiMapping} isListening={listeningParam === 'tempo'} isMapped={isMapped('tempo')} onMapSelect={() => handleMapSelect('tempo')} />
                 
                 <Knob label="Transp" value={params.transpose} min={-12} max={12} onChange={v => updateParam('transpose', v)} size={48} color="#8b5cf6"
                       isMapping={isMidiMapping} isListening={listeningParam === 'transpose'} isMapped={isMapped('transpose')} onMapSelect={() => handleMapSelect('transpose')} />

                 <Knob label="Distort" value={params.distortion} min={0} max={10} onChange={v => updateParam('distortion', v)} size={48} color="#ef4444"
                       isMapping={isMidiMapping} isListening={listeningParam === 'distortion'} isMapped={isMapped('distortion')} onMapSelect={() => handleMapSelect('distortion')} />
            </div>

            {/* MODS & FX Section */}
            <div className="mt-2 pt-2 border-t border-slate-700/50 flex flex-wrap items-center justify-between gap-3 px-1">
                <div className="flex items-center gap-3">
                     <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-950/50 px-2 py-0.5 rounded">
                        <Settings2 size={10} className="text-pink-500" />
                        <span>MODS</span>
                    </div>
                    <Knob label="Length" value={params.patternLength || 16} min={1} max={16} onChange={v => updateParam('patternLength', v)} size={36} color="#ec4899"
                            isMapping={isMidiMapping} isListening={listeningParam === 'patternLength'} isMapped={isMapped('patternLength')} onMapSelect={() => handleMapSelect('patternLength')} />
                    <Knob label="Slide Tm" value={params.slideTime || 0.1} min={0.05} max={0.4} onChange={v => updateParam('slideTime', v)} size={36} color="#ec4899"
                            isMapping={isMidiMapping} isListening={listeningParam === 'slideTime'} isMapped={isMapped('slideTime')} onMapSelect={() => handleMapSelect('slideTime')} />
                    <Knob label="Swing" value={params.swing} min={0} max={100} onChange={v => updateParam('swing', v)} size={36} color="#ec4899"
                       isMapping={isMidiMapping} isListening={listeningParam === 'swing'} isMapped={isMapped('swing')} onMapSelect={() => handleMapSelect('swing')} />
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-950/50 px-2 py-0.5 rounded">
                        <Activity size={10} className="text-emerald-500" />
                        <span>DELAY</span>
                    </div>
                    <Knob label="Time" value={params.delayTime} min={0.05} max={1.0} onChange={v => updateParam('delayTime', v)} size={36} color="#10b981"
                        isMapping={isMidiMapping} isListening={listeningParam === 'delayTime'} isMapped={isMapped('delayTime')} onMapSelect={() => handleMapSelect('delayTime')} />
                    <Knob label="Fdbk" value={params.delayFeedback} min={0} max={0.95} onChange={v => updateParam('delayFeedback', v)} size={36} color="#10b981"
                        isMapping={isMidiMapping} isListening={listeningParam === 'delayFeedback'} isMapped={isMapped('delayFeedback')} onMapSelect={() => handleMapSelect('delayFeedback')} />
                    <Knob label="Mix" value={params.delayMix} min={0} max={1} onChange={v => updateParam('delayMix', v)} size={36} color="#10b981"
                        isMapping={isMidiMapping} isListening={listeningParam === 'delayMix'} isMapped={isMapped('delayMix')} onMapSelect={() => handleMapSelect('delayMix')} />
                </div>
            </div>
        </div>

        {/* Pattern & Chain Control - Compact */}
        <div className="bg-slate-900 border-b border-slate-950 py-1 px-3 flex items-center gap-3 overflow-x-auto">
             <div className="flex items-center gap-2 pr-3 border-r border-slate-800">
                <span className="text-[9px] font-bold text-slate-500 uppercase">MODE</span>
                <button 
                  onClick={() => setChainMode(!chainMode)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border transition-all ${chainMode ? 'bg-amber-500 border-amber-500 text-slate-900 shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                >
                    <LinkIcon size={10} /> CHAIN
                </button>
             </div>

             <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-slate-500 uppercase">PATTERNS</span>
                <div className="flex gap-0.5">
                    {patternBank.map((_, idx) => {
                        const label = String.fromCharCode(65 + idx); // A, B, C...
                        const isActive = activePatternIdx === idx;
                        const isSelected = viewPatternIdx === idx;
                        const isQueued = nextPatternIdx === idx;
                        const isInChain = chainSelection.includes(idx);
                        
                        return (
                            <button
                                key={idx}
                                onClick={() => handlePatternSelect(idx)}
                                className={`
                                    w-6 h-6 rounded text-[9px] font-bold relative transition-all duration-150
                                    ${isActive ? 'bg-amber-500 text-slate-900 shadow-[0_0_8px_rgba(245,158,11,0.5)] z-10 scale-105' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}
                                    ${isSelected && !isActive ? 'ring-1 ring-slate-400' : ''}
                                    ${chainMode && isInChain && !isActive ? 'border border-amber-500/50 text-amber-500/80' : ''}
                                `}
                            >
                                {isQueued && (
                                    <span className="absolute inset-0 bg-amber-500/20 animate-pulse rounded" />
                                )}
                                {label}
                            </button>
                        );
                    })}
                </div>
             </div>
             
             <div className="flex-1"></div>
             
             {/* Pattern Utility */}
             <div className="flex gap-0.5">
                 <button onClick={copyPattern} className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors" title="Copy Pattern"><Copy size={12} /></button>
                 <button onClick={pastePattern} className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors" title="Paste Pattern"><Layers size={12} /></button>
             </div>
        </div>

        {/* AI & Tools Bar - Compact */}
        <div className="relative z-10 bg-slate-800 border-b border-slate-950 py-1 px-2 flex flex-col sm:flex-row items-center justify-between gap-2 shadow-inner">
             <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64 group">
                    <Wand2 size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-amber-500 transition-colors" />
                    <input 
                        type="text" 
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-full pl-7 pr-3 py-1 text-[10px] text-slate-200 focus:outline-none focus:border-amber-500 placeholder:text-slate-600 transition-colors"
                        placeholder="Describe sound or pattern..."
                    />
                </div>
                <div className="flex gap-0.5">
                    <button 
                        onClick={handleAiGeneratePattern}
                        disabled={isGenerating}
                        className="bg-slate-700 hover:bg-amber-600 text-slate-200 hover:text-slate-900 text-[9px] font-bold py-1 px-2.5 rounded-l-full flex items-center gap-1 shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap border-r border-slate-800"
                    >
                        {isGenerating ? <RefreshCw className="animate-spin" size={10} /> : <Music size={10} fill="currentColor" />}
                        PATT
                    </button>
                    <button 
                        onClick={handleAiGenerateSound}
                        disabled={isGenerating}
                        className="bg-slate-700 hover:bg-amber-600 text-slate-200 hover:text-slate-900 text-[9px] font-bold py-1 px-2.5 rounded-r-full flex items-center gap-1 shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                        {isGenerating ? <RefreshCw className="animate-spin" size={10} /> : <Sliders size={10} />}
                        PATCH
                    </button>
                </div>
             </div>

             <div className="flex gap-1.5">
                 <button onClick={toggleMidiMode} className={`text-[9px] font-bold rounded px-1.5 py-0.5 flex items-center gap-1 transition-colors border ${isMidiMapping ? 'bg-amber-500 border-amber-500 text-slate-900 animate-pulse' : 'text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 border-slate-600'}`}><Cable size={10} /> MIDI</button>
                 <button onClick={() => setIsPresetModalOpen(true)} className="text-[9px] font-bold text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded px-1.5 py-0.5 flex items-center gap-1 transition-colors"><FolderOpen size={10} /> LIBRARY</button>
                 <button onClick={handleExport} disabled={isExporting} className="text-[9px] font-bold text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded px-1.5 py-0.5 flex items-center gap-1 transition-colors disabled:opacity-50">{isExporting ? <RefreshCw className="animate-spin" size={10} /> : <Download size={10} />} EXPORT</button>
                 <div className="w-px h-5 bg-slate-700 mx-0.5"></div>
                 <button onClick={randomizePattern} className="text-[9px] font-bold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded px-1.5 py-0.5 flex items-center gap-1 transition-colors"><RefreshCw size={10} /> RND</button>
                 <button onClick={clearPattern} className="text-[9px] font-bold text-slate-400 hover:text-red-300 bg-slate-800 hover:bg-red-900/40 border border-slate-700 rounded px-1.5 py-0.5 flex items-center gap-1 transition-colors"><Trash2 size={10} /> CLR</button>
             </div>
        </div>

        {/* Sequencer Strip - Compact */}
        <div className="relative z-10 bg-slate-950 p-2">
             {/* Pattern Indicator */}
             <div className="mb-1 flex justify-between items-end">
                <span className="text-[9px] font-bold text-slate-600">
                    EDITING PATTERN: <span className="text-amber-500 text-base ml-1">{String.fromCharCode(65 + viewPatternIdx)}</span>
                </span>
             </div>
             
             <div className="flex justify-between gap-0.5 mb-2 overflow-x-auto pb-1 scrollbar-hide">
                 {sequence.map((step, idx) => (
                     <div key={step.id} className={`flex flex-col items-center gap-0.5 min-w-[30px] transition-opacity duration-300 ${idx >= (params.patternLength || 16) ? 'opacity-20 blur-[1px]' : 'opacity-100'}`}>
                         <div className={`w-1 h-1 rounded-full transition-all duration-75 ${currentStep === step.id ? 'bg-red-500 shadow-[0_0_8px_#ef4444] scale-125' : 'bg-slate-800'}`} />
                         <button
                            onClick={() => toggleStepActive(step.id)}
                            className={`
                                w-7 h-10 rounded-sm border-b-2 text-[9px] font-bold flex flex-col items-center justify-center transition-all duration-100 group
                                ${step.active 
                                    ? 'bg-slate-300 border-slate-400 text-slate-900 translate-y-0 shadow-[0_0_10px_rgba(255,255,255,0.15)]' 
                                    : 'bg-slate-800 border-slate-900 text-slate-500 hover:bg-slate-700 translate-y-[1px]'
                                }
                                ${selectedStepId === step.id ? 'ring-1 ring-amber-500' : ''}
                            `}
                         >
                            <span className="mb-0.5">{step.id + 1}</span>
                            <div className={`w-2.5 h-0.5 rounded-full ${step.active ? 'bg-red-500' : 'bg-slate-700 group-hover:bg-slate-600'}`} />
                         </button>
                         <button onClick={() => setSelectedStepId(selectedStepId === step.id ? null : step.id)} className={`w-full h-1 rounded-full mt-0.5 transition-colors ${selectedStepId === step.id ? 'bg-amber-500' : 'bg-slate-800 hover:bg-slate-600'}`} />
                     </div>
                 ))}
             </div>

             {/* Step Editor */}
             <div className={`transition-all duration-200 ease-out overflow-hidden bg-slate-900 rounded border border-slate-800 shadow-xl ${selectedStepId !== null ? 'max-h-20 opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0'}`}>
                 {selectedStepId !== null && (
                    <div className="p-1 px-3 flex items-center justify-between gap-3 h-full">
                        <div className="flex items-center gap-3">
                            <div className="flex flex-col">
                                <span className="text-amber-500 font-bold text-[9px] leading-tight">STEP</span>
                                <span className="text-slate-300 font-black text-lg leading-none">{selectedStepId + 1}</span>
                            </div>
                            <div className="h-5 w-px bg-slate-700"></div>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[8px] text-slate-500 font-bold uppercase">Note</span>
                                <select value={sequence[selectedStepId].note} onChange={(e) => updateStep(selectedStepId, 'note', e.target.value)} className="bg-slate-950 text-slate-200 text-[10px] font-mono font-bold rounded border border-slate-700 px-1 py-0.5 outline-none focus:border-amber-500">
                                    {NOTES.map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[8px] text-slate-500 font-bold uppercase">Octave</span>
                                <div className="flex bg-slate-950 rounded border border-slate-700 p-0.5">
                                    {[-1, 0, 1].map(oct => (
                                        <button key={oct} onClick={() => updateStep(selectedStepId, 'octaveShift', oct)} className={`w-5 py-0.5 text-[9px] font-bold rounded-sm transition-colors ${sequence[selectedStepId].octaveShift === oct ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>{oct > 0 ? '+' + oct : oct}</button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                             <button onClick={() => updateStep(selectedStepId, 'accent', !sequence[selectedStepId].accent)} className={`px-2 py-1 rounded border text-[9px] font-bold flex items-center gap-1 transition-all ${sequence[selectedStepId].accent ? 'bg-amber-500/10 border-amber-500 text-amber-500' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'}`}><Volume2 size={10} /> ACCENT</button>
                             <button onClick={() => updateStep(selectedStepId, 'slide', !sequence[selectedStepId].slide)} className={`px-2 py-1 rounded border text-[9px] font-bold flex items-center gap-1 transition-all ${sequence[selectedStepId].slide ? 'bg-amber-500/10 border-amber-500 text-amber-500' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'}`}><span className="italic font-serif text-xs leading-none">~</span> SLIDE</button>
                        </div>
                        <button onClick={() => setSelectedStepId(null)} className="w-5 h-5 flex items-center justify-center text-slate-600 hover:text-slate-400 hover:bg-slate-800 rounded transition-colors"><X size={12} /></button>
                    </div>
                 )}
             </div>
        </div>
      </div>
      
      <PresetModal 
        isOpen={isPresetModalOpen}
        onClose={() => setIsPresetModalOpen(false)}
        presets={presets}
        onLoad={(preset) => {
            setParams(preset.params);
            if (preset.patterns) {
                setPatternBank(preset.patterns);
                // Reset to pattern A
                setActivePatternIdx(0);
                setViewPatternIdx(0);
                setChainSelection([0]);
                engine.current?.setSequence(preset.patterns[0]);
            } else {
                // Backward compatibility for old presets (create temporary bank)
                const blank = DEFAULT_SEQUENCE.map(s => ({...s, active: false}));
                const newBank = Array(8).fill(null).map((_, i) => i === 0 ? preset.sequence : blank);
                setPatternBank(newBank);
                setActivePatternIdx(0);
                setViewPatternIdx(0);
                engine.current?.setSequence(preset.sequence);
            }
        }}
        onSave={(name) => {
            const newPreset = PresetLibrary.savePreset(name, params, patternBank[0], patternBank);
            setPresets(prev => [...prev, newPreset]);
        }}
        onDelete={(id) => {
            PresetLibrary.deletePreset(id);
            setPresets(prev => prev.filter(p => p.id !== id));
        }}
      />
    </div>
  );
};

export default App;