import React, { useEffect, useRef, useState } from 'react';
import { Cpu, Link, Link2Off, RefreshCw } from 'lucide-react';
import { connectSerial, disconnectSerial, isSerialConnected, onSerialLog } from '../utils/serial';

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
  const [serialLogs, setSerialLogs] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  // Set up serial log listener
  useEffect(() => {
    onSerialLog((msg) => {
      setSerialLogs((prev) => [...prev.slice(-30), `[${new Date().toLocaleTimeString()}] ${msg}`]);
    });
    
    // Check initial status
    setIsConnected(isSerialConnected());
  }, []);

  // Auto scroll terminal logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [serialLogs]);

  const handleConnect = async () => {
    if (isConnected) {
      await disconnectSerial();
      setIsConnected(false);
    } else {
      setIsConnecting(true);
      const success = await connectSerial();
      setIsConnected(success);
      setIsConnecting(false);
    }
  };

  return (
    <div className="telemetry-panel flex flex-col h-full bg-black border-2 border-yellow-500 font-mono text-[10px] text-yellow-500 p-3 select-none box-border uppercase leading-tight relative shadow-[0_0_15px_rgba(234,179,8,0.2)]">
      {/* Scanline CRT overlay effect */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(0,0,0,0)_0%,rgba(0,0,0,0.4)_100%)] opacity-30 z-10"></div>
      
      {/* Panel Title */}
      <div className="flex justify-between items-center border-b border-yellow-500 pb-1 mb-2">
        <span className="text-xs font-bold flex items-center gap-1">
          <Cpu className="w-3 h-3 animate-pulse" />
          SYSTEM_TELEMETRY.LOG
        </span>
        <span className="text-[9px] animate-pulse">● RUNNING</span>
      </div>

      {/* Grid: 2 columns */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        {/* ML / INFERENCE PERFORMANCE */}
        <div className="border border-yellow-500/50 p-1.5 flex flex-col justify-between bg-yellow-950/5">
          <div className="text-[9px] text-yellow-400 font-bold mb-1">INFERENCE ENGINE</div>
          <div className="flex justify-between mb-0.5">
            <span>FPS:</span>
            <span className="font-bold text-yellow-300">{fps} Hz</span>
          </div>
          <div className="flex justify-between mb-1">
            <span>LATENCY:</span>
            <span className="font-bold text-yellow-300">{latency} ms</span>
          </div>
          <div className="w-full bg-yellow-950 h-1.5 border border-yellow-500/30 overflow-hidden relative">
            <div 
              className="bg-yellow-500 h-full transition-all duration-100" 
              style={{ width: `${Math.min(100, (fps / 30) * 100)}%` }}
            ></div>
          </div>
        </div>

        {/* SERIAL PORT HARDWARE */}
        <div className="border border-yellow-500/50 p-1.5 flex flex-col justify-between bg-yellow-950/5">
          <div className="text-[9px] text-yellow-400 font-bold mb-1">LED STROBE LINK</div>
          <div className="flex justify-between items-center mb-1">
            <span>SERIAL LINK:</span>
            <span className={`px-1 font-bold ${isConnected ? 'bg-green-500 text-black animate-pulse' : 'bg-red-950 text-red-500 animate-pulse border border-red-500/50'}`}>
              {isConnected ? 'CONNECTED' : 'OFFLINE'}
            </span>
          </div>
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className={`w-full py-1 text-[9px] font-bold border cursor-pointer select-none text-center active:scale-[0.98] transition-all flex items-center justify-center gap-1 ${
              isConnected 
                ? 'border-red-500 bg-red-950/20 text-red-500 hover:bg-red-500 hover:text-black' 
                : 'border-yellow-500 bg-yellow-950/20 text-yellow-500 hover:bg-yellow-500 hover:text-black'
            }`}
          >
            {isConnecting ? (
              <RefreshCw className="w-2.5 h-2.5 animate-spin" />
            ) : isConnected ? (
              <>
                <Link2Off className="w-2.5 h-2.5" />
                DISCONNECT
              </>
            ) : (
              <>
                <Link className="w-2.5 h-2.5" />
                CONNECT PORT
              </>
            )}
          </button>
        </div>
      </div>

      {/* TRACKING DETAILS */}
      <div className="border border-yellow-500/50 p-1.5 mb-2">
        <div className="text-[9px] text-yellow-400 font-bold mb-1 flex justify-between">
          <span>FACIAL DATASTREAM</span>
          <span>FACES_DETECTED: {facesDetected}/2</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[9px]">
          {/* PLAYER 1 */}
          <div className={`p-1 border ${facesDetected >= 1 ? 'border-red-500/30 bg-red-950/5 text-red-400' : 'border-yellow-500/20 opacity-40'}`}>
            <div className={`font-bold border-b pb-0.5 mb-1 ${facesDetected >= 1 ? 'border-red-500/30 text-red-300' : 'border-yellow-500/20'}`}>
              P1 (RED PADDLE)
            </div>
            {facesDetected >= 1 ? (
              <>
                <div className="flex justify-between">
                  <span>RAW SMILE:</span>
                  <span className="text-red-300">{face1Raw.toFixed(4)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>STATE:</span>
                  <span className={face1Val > 0.3 ? 'text-red-300 font-black' : face1Val < -0.3 ? 'text-cyan-400 font-black' : 'text-red-600'}>
                    {face1Val > 0.3 ? 'SMILE (▲)' : face1Val < -0.3 ? 'FROWN (▼)' : 'NEUTRAL (-)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>CALIBRATED:</span>
                  <span className="text-red-300">{face1Val >= 0 ? '+' : ''}{face1Val.toFixed(2)}</span>
                </div>
              </>
            ) : (
              <div className="text-center py-2 text-red-900/60 animate-pulse">NO_SIGNAL</div>
            )}
          </div>

          {/* PLAYER 2 */}
          <div className={`p-1 border ${facesDetected >= 2 ? 'border-blue-500/30 bg-blue-950/5 text-blue-400' : facesDetected === 1 ? 'border-blue-500/20 bg-blue-950/5 text-blue-400/70' : 'border-yellow-500/20 opacity-40'}`}>
            <div className={`font-bold border-b pb-0.5 mb-1 ${facesDetected >= 2 ? 'border-blue-500/30 text-blue-300' : 'border-yellow-500/20'}`}>
              P2 (BLUE PADDLE)
            </div>
            {facesDetected >= 2 ? (
              <>
                <div className="flex justify-between">
                  <span>RAW SMILE:</span>
                  <span className="text-blue-300">{face2Raw.toFixed(4)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>STATE:</span>
                  <span className={face2Val > 0.3 ? 'text-blue-300 font-black' : face2Val < -0.3 ? 'text-cyan-400 font-black' : 'text-blue-600'}>
                    {face2Val > 0.3 ? 'SMILE (▲)' : face2Val < -0.3 ? 'FROWN (▼)' : 'NEUTRAL (-)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>CALIBRATED:</span>
                  <span className="text-blue-300">{face2Val >= 0 ? '+' : ''}{face2Val.toFixed(2)}</span>
                </div>
              </>
            ) : facesDetected === 1 ? (
              <div className="text-center py-2 text-blue-500/60 font-bold animate-pulse">AI COMPUTER</div>
            ) : (
              <div className="text-center py-2 text-blue-900/60 animate-pulse">NO_SIGNAL</div>
            )}
          </div>
        </div>
      </div>

      {/* SERIAL PORT CONSOLE LOGS */}
      <div className="flex-1 border border-yellow-500/50 p-1.5 flex flex-col min-h-[80px] overflow-hidden bg-yellow-950/5">
        <div className="text-[9px] text-yellow-400 font-bold mb-1">TX/RX SERIAL TRANSMISSION BUFFER</div>
        <div 
          ref={logContainerRef}
          className="flex-1 overflow-y-auto font-mono text-[8px] text-yellow-400/80 leading-normal scrollbar-thin scrollbar-thin-yellow scrollbar-track-transparent pr-1 break-all"
        >
          {serialLogs.length === 0 ? (
            <div className="text-yellow-700 select-none">BUFFER EMPTY. AWAITING SERIAL LINK...</div>
          ) : (
            serialLogs.map((log, i) => (
              <div key={i} className="mb-0.5 whitespace-pre-wrap">{log}</div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
