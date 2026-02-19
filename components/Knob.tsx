import React, { useState, useEffect, useCallback, useRef } from 'react';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  size?: number;
  color?: string;
  
  // MIDI Mapping Props
  isMapping?: boolean;
  isMapped?: boolean;
  isListening?: boolean;
  onMapSelect?: () => void;
}

const Knob: React.FC<KnobProps> = ({ 
  label, 
  value, 
  min, 
  max, 
  onChange, 
  size = 64,
  color = "#fbbf24",
  isMapping = false,
  isMapped = false,
  isListening = false,
  onMapSelect
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startValue, setStartValue] = useState(0);
  const knobRef = useRef<HTMLDivElement>(null);

  // Convert value to angle (270 degree range: -135 to 135)
  const range = max - min;
  const percentage = (value - min) / range;
  const angle = -135 + (percentage * 270);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMapping) return; // Mapping clicks handled by overlay

    setIsDragging(true);
    setStartY(e.clientY);
    setStartValue(value);
    document.body.style.cursor = 'ns-resize';
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const deltaY = startY - e.clientY;
    const deltaValue = (deltaY / 200) * range;
    
    let newValue = startValue + deltaValue;
    newValue = Math.max(min, Math.min(max, newValue));
    
    onChange(newValue);
  }, [isDragging, startY, startValue, min, max, range, onChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    document.body.style.cursor = 'default';
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div className="flex flex-col items-center gap-1 select-none relative group">
      
      {/* MIDI Mapping Overlay */}
      {isMapping && (
        <div 
            onClick={(e) => { e.stopPropagation(); onMapSelect?.(); }}
            className={`
                absolute -inset-2 z-50 rounded-lg border-2 flex flex-col items-center justify-center transition-all cursor-pointer backdrop-blur-[1px]
                ${isListening 
                    ? 'border-red-500 bg-red-500/10 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-pulse' 
                    : (isMapped 
                        ? 'border-emerald-500 bg-emerald-500/10' 
                        : 'border-slate-600 bg-slate-900/60 hover:border-amber-500 hover:bg-slate-800/80'
                    )
                }
            `}
        >
            {isListening ? (
                 <span className="text-[9px] font-black text-red-500 bg-slate-950/90 px-1.5 py-0.5 rounded border border-red-500/50 shadow-sm whitespace-nowrap">LEARN</span>
            ) : isMapped ? (
                 <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)]"></div>
            ) : (
                 <span className="opacity-0 group-hover:opacity-100 text-[9px] font-bold text-amber-500 uppercase tracking-widest scale-90 group-hover:scale-100 transition-all bg-slate-950/80 px-1 rounded">Map</span>
            )}
        </div>
      )}
      
      {/* Passive Mapped Indicator (when not mapping) */}
      {!isMapping && isMapped && (
          <div className="absolute -top-0.5 -right-0.5 z-10 w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)] pointer-events-none" />
      )}

      <div 
        ref={knobRef}
        onMouseDown={handleMouseDown}
        className={`relative ${isMapping ? 'pointer-events-none' : 'cursor-ns-resize'}`}
        style={{ width: size, height: size }}
      >
        {/* Shadow Ring */}
        <div className="absolute inset-0 rounded-full bg-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]" />
        
        {/* Ticks */}
        <svg className="absolute inset-0 pointer-events-none opacity-40" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill="none" stroke="#475569" strokeWidth="2" strokeDasharray="2 6" transform="rotate(135 50 50)" strokeDashoffset="0" />
        </svg>

        {/* The Knob Body */}
        <div 
          className="absolute top-1 left-1 right-1 bottom-1 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 shadow-[0_4px_6px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.2)]"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          {/* Indicator Line */}
          <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[3px] h-[35%] rounded-full bg-slate-900 shadow-[0_0_2px_rgba(255,255,255,0.1)]">
            <div className="w-full h-[60%] rounded-full shadow-[0_0_5px_currentColor]" style={{ backgroundColor: color }}></div>
          </div>
        </div>
      </div>
      <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">{label}</span>
      <span className="text-[9px] font-mono text-slate-500">{Math.round(value)}</span>
    </div>
  );
};

export default Knob;