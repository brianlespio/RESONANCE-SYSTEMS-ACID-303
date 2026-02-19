import React, { useEffect, useRef } from 'react';

interface OscilloscopeProps {
  analyser: AnalyserNode | null;
}

const Oscilloscope: React.FC<OscilloscopeProps> = ({ analyser }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    // Handle High DPI displays
    const dpr = window.devicePixelRatio || 1;
    // Get actual display size
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.scale(dpr, dpr);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let animationId: number;

    const draw = () => {
      animationId = requestAnimationFrame(draw);

      analyser.getByteTimeDomainData(dataArray);

      // Transparent/Dark background
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = '#020617'; // slate-950
      ctx.fillRect(0, 0, rect.width, rect.height);
      
      // Grid line (Center)
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(0, rect.height / 2);
      ctx.lineTo(rect.width, rect.height / 2);
      ctx.stroke();

      // Waveform
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#f59e0b'; // Amber-500
      ctx.beginPath();

      const sliceWidth = rect.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * rect.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(rect.width, rect.height / 2);
      ctx.stroke();
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [analyser]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-full block"
    />
  );
};

export default Oscilloscope;