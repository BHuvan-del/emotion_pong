import React from 'react';
import { Cpu } from 'lucide-react';

interface TelemetryHudProps {
  fps: number;
  latency: number;
  face1Val: number; // -1 to 1
  face2Val: number; // -1 to 1
  face1Raw: number;
  face2Raw: number;
  facesDetected: number;
}

export const TelemetryHud: React.FC<TelemetryHudProps> = ({
  fps,
  latency,
  face1Val,
  face2Val,
  face1Raw,
  face2Raw,
  facesDetected
}) => {
  return (
    <div className="telemetry-panel flex flex-col h-full bg-black border-4 border-yellow-500 font-mono text-xs text-yellow-500 p-4.5 select-none box-border uppercase leading-tight relative shadow-[0_0_15px_rgba(234,179,8,0.25)]">
      {/* Scanline CRT overlay effect */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(0,0,0,0)_0%,rgba(0,0,0,0.4)_100%)] opacity-30 z-10"></div>
      
      {/* Panel Title */}
      <div className="flex justify-between items-center border-b-2 border-yellow-500 pb-1.5 mb-3">
        <span className="text-sm font-bold flex items-center gap-1">
          <Cpu className="w-3.5 h-3.5 animate-pulse" />
          SYSTEM_TELEMETRY.LOG
        </span>
        <span className="text-xs animate-pulse">● RUNNING</span>
      </div>

      {/* ML / INFERENCE PERFORMANCE */}
      <div className="border-2 border-yellow-500/50 p-2 flex flex-col mb-3 bg-yellow-950/5">
        <div className="text-[10px] text-yellow-400 font-bold mb-1.5">INFERENCE ENGINE</div>
        <div className="flex justify-between mb-1">
          <span>DETECTION FPS:</span>
          <span className="font-bold text-yellow-300">{fps} Hz</span>
        </div>
        <div className="flex justify-between mb-1.5">
          <span>LATENCY:</span>
          <span className="font-bold text-yellow-300">{latency} ms</span>
        </div>
        <div className="w-full bg-yellow-950 h-2 border border-yellow-500/30 overflow-hidden relative">
          <div 
            className="bg-yellow-500 h-full transition-all duration-100" 
            style={{ width: `${Math.min(100, (fps / 20) * 100)}%` }}
          ></div>
        </div>
      </div>

      {/* TRACKING DETAILS */}
      <div className="border-2 border-yellow-500/50 p-2.5 mb-3">
        <div className="text-[10px] text-yellow-400 font-bold mb-1.5 flex justify-between">
          <span>FACIAL DATASTREAM</span>
          <span>FACES_DETECTED: {facesDetected}/2</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-[10px]">
          {/* PLAYER 1 */}
          <div className={`p-2 border-2 ${facesDetected >= 1 ? 'border-red-500/50 bg-red-950/10 text-red-400' : 'border-yellow-500/20 opacity-40'}`}>
            <div className={`font-bold border-b-2 pb-1 mb-1.5 ${facesDetected >= 1 ? 'border-red-500/30 text-red-300' : 'border-yellow-500/20'}`}>
              P1 (RED PADDLE)
            </div>
            {facesDetected >= 1 ? (
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>RAW SMILE:</span>
                  <span className="text-red-300 font-semibold">{face1Raw.toFixed(4)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>STATE:</span>
                  <span className={face1Val > 0.3 ? 'text-red-300 font-black' : face1Val < -0.3 ? 'text-cyan-400 font-black' : 'text-red-500'}>
                    {face1Val > 0.3 ? 'SMILE (▲)' : face1Val < -0.3 ? 'FROWN (▼)' : 'NEUTRAL (-)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>CALIBRATED:</span>
                  <span className="text-red-300 font-bold">{face1Val >= 0 ? '+' : ''}{face1Val.toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-red-900/60 font-bold animate-pulse text-[10px]">NO_SIGNAL</div>
            )}
          </div>

          {/* PLAYER 2 */}
          <div className={`p-2 border-2 ${facesDetected >= 2 ? 'border-blue-500/50 bg-blue-950/10 text-blue-400' : facesDetected === 1 ? 'border-blue-500/20 bg-blue-950/10 text-blue-400/80' : 'border-yellow-500/20 opacity-40'}`}>
            <div className={`font-bold border-b-2 pb-1 mb-1.5 ${facesDetected >= 2 ? 'border-blue-500/30 text-blue-300' : 'border-yellow-500/20'}`}>
              P2 (BLUE PADDLE)
            </div>
            {facesDetected >= 2 ? (
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>RAW SMILE:</span>
                  <span className="text-blue-300 font-semibold">{face2Raw.toFixed(4)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>STATE:</span>
                  <span className={face2Val > 0.3 ? 'text-blue-300 font-black' : face2Val < -0.3 ? 'text-cyan-400 font-black' : 'text-blue-500'}>
                    {face2Val > 0.3 ? 'SMILE (▲)' : face2Val < -0.3 ? 'FROWN (▼)' : 'NEUTRAL (-)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>CALIBRATED:</span>
                  <span className="text-blue-300 font-bold">{face2Val >= 0 ? '+' : ''}{face2Val.toFixed(2)}</span>
                </div>
              </div>
            ) : facesDetected === 1 ? (
              <div className="text-center py-4 text-blue-500/70 font-bold animate-pulse text-[10px]">AI COMPUTER</div>
            ) : (
              <div className="text-center py-4 text-blue-900/60 font-bold animate-pulse text-[10px]">NO_SIGNAL</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
