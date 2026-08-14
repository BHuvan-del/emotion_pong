import { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Volume2, 
  VolumeX, 
  Camera, 
  RotateCcw, 
  ShieldAlert, 
  TrendingUp,
  Clock,
  Sparkles
} from 'lucide-react';
import { useFaceLandmarks } from './hooks/useFaceLandmarks';
import { GameCanvas } from './components/GameCanvas';
import { TelemetryHud } from './components/TelemetryHud';
import { ModelAccuracyPanel } from './components/ModelAccuracyPanel';
import { Leaderboard, addLeaderboardEntry } from './components/Leaderboard';
import { 
  startBackgroundMusic, 
  stopBackgroundMusic, 
  playScore, 
  playWin, 
  toggleMute, 
  getMuted, 
  getAudioContext 
} from './utils/audio';

type ScreenState = 'login' | 'hook' | 'calibrate' | 'match' | 'reveal';
type CalibrationStep = 'idle' | 'neutral' | 'smile' | 'frown' | 'complete';

export default function App() {
  const [screen, setScreen] = useState<ScreenState>('login');
  const [p1Name, setP1Name] = useState('Player 1');
  const [p2Name, setP2Name] = useState('Player 2');
  const [p1Contact, setP1Contact] = useState('');
  const [p2Contact, setP2Contact] = useState('');
  const [isSubmittingLeads, setIsSubmittingLeads] = useState(false);
  const [leadError, setLeadError] = useState('');
  
  // Game metrics for leaderboard
  const [matchScore, setMatchScore] = useState({ p1: 0, p2: 0 });
  const [winnerName, setWinnerName] = useState('');
  const [matchStats, setMatchStats] = useState({
    maxSmileP1: 0,
    maxSmileP2: 0,
    avgFps: 60,
    matchDurationSec: 0
  });

  // Mute state
  const [muted, setMuted] = useState(false);

  // Pause state
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);

  // Calibration process states
  const [calStep, setCalStep] = useState<CalibrationStep>('idle');
  const [calCountdown, setCalCountdown] = useState(0);
  const [calProgress, setCalProgress] = useState(0); // 0 to 100%

  // Hooks & Refs
  const {
    isLoading,
    error,
    fps,
    latency,
    detectedFaces,
    startTracking,
    stopTracking,
    setCalibration
  } = useFaceLandmarks();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const calSampleRef = useRef<number[]>([]);
  const matchIntervalRef = useRef<number | null>(null);
  const matchDurationRef = useRef<number>(0);
  const fpsRef = useRef(60);
  const maxSmileP1Ref = useRef<number>(0);
  const maxSmileP2Ref = useRef<number>(0);
  const fpsAccumulatorRef = useRef<number[]>([]);

  const detectedFacesRef = useRef(detectedFaces);
  useEffect(() => {
    detectedFacesRef.current = detectedFaces;
  }, [detectedFaces]);

  // Initialize and track muted status
  useEffect(() => {
    setMuted(getMuted());
  }, []);

  // Background Music controller based on screens
  useEffect(() => {
    if (screen === 'hook') {
      startBackgroundMusic();
    } else {
      stopBackgroundMusic();
    }
    
    return () => {
      stopBackgroundMusic();
    };
  }, [screen, muted]);

  const handleRegisterAndStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!p1Name.trim() || !p1Contact.trim()) {
      setLeadError('PLAYER 1 NAME AND CONTACT NUMBER ARE REQUIRED!');
      return;
    }
    
    setIsSubmittingLeads(true);
    setLeadError('');
    
    try {
      // Register Player 1
      await fetch('http://localhost:3001/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: p1Name.trim(), contact: p1Contact.trim() })
      });
      
      // Register Player 2 if provided
      if (p2Name.trim() && p2Name !== 'Player 2' && p2Contact.trim()) {
        await fetch('http://localhost:3001/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: p2Name.trim(), contact: p2Contact.trim() })
        });
      } else if (!p2Name.trim() || p2Name === 'Player 2') {
        setP2Name('COMPUTER');
      }
      
      setScreen('hook');
    } catch (err) {
      console.warn("SQL Database offline. Continuing locally.", err);
      if (!p2Name.trim() || p2Name === 'Player 2') {
        setP2Name('COMPUTER');
      }
      setScreen('hook');
    } finally {
      setIsSubmittingLeads(false);
    }
  };

  // Sync camera when entering calibrate screen
  const handleStartArcade = () => {
    getAudioContext();
    setScreen('calibrate');
    setTimeout(() => {
      if (videoRef.current) {
        startTracking(videoRef.current);
      }
    }, 100);
  };

  // Render Face Meshes on overlay canvas in real time
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw current video frame to canvas (for mirroring and PiP display)
    if (videoRef.current && videoRef.current.readyState >= 2) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (detectedFaces.length === 0) return;

    // Draw glowing meshes for detected faces
    detectedFaces.forEach((face, index) => {
      const landmarks = face.landmarks;
      
      // Color coding: Player 1 (Red), Player 2 (Blue)
      const color = index === 0 ? '#ff2400' : '#007fff';
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;

      // Draw all 468 points as small circles
      landmarks.forEach((pt) => {
        const px = pt.x * canvas.width;
        const py = pt.y * canvas.height;
        ctx.beginPath();
        ctx.arc(px, py, 1.0, 0, 2 * Math.PI);
        ctx.fill();
      });
      ctx.shadowBlur = 0;

      // Draw wireframe outline for mouth
      ctx.strokeStyle = index === 0 ? 'rgba(255, 36, 0, 0.45)' : 'rgba(0, 127, 255, 0.45)';
      ctx.lineWidth = 1;
      
      // Mouth outer loop
      const mouthOuter = [61, 37, 0, 267, 291, 314, 17, 84, 61];
      ctx.beginPath();
      mouthOuter.forEach((idx, i) => {
        const pt = landmarks[idx];
        const px = pt.x * canvas.width;
        const py = pt.y * canvas.height;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      // Eyebrows
      const leftEyebrow = [70, 63, 105, 66, 107];
      ctx.beginPath();
      leftEyebrow.forEach((idx, i) => {
        const pt = landmarks[idx];
        const px = pt.x * canvas.width;
        const py = pt.y * canvas.height;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      const rightEyebrow = [300, 293, 334, 296, 336];
      ctx.beginPath();
      rightEyebrow.forEach((idx, i) => {
        const pt = landmarks[idx];
        const px = pt.x * canvas.width;
        const py = pt.y * canvas.height;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      // Draw active player tags above their heads
      const forehead = landmarks[10]; // Center forehead point
      const fx = forehead.x * canvas.width;
      const fy = forehead.y * canvas.height - 15;
      ctx.fillStyle = color;
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(index === 0 ? p1Name.toUpperCase() : p2Name.toUpperCase(), fx, fy);
    });
  }, [detectedFaces, p1Name, p2Name]);

  // Automated Calibration Workflow
  const startCalibrationSequence = async () => {
    const initialFaces = detectedFacesRef.current;
    if (initialFaces.length < 1) {
      alert("WARNING: NO FACE DETECTED! PLEASE STAND IN FRONT OF THE CAMERA TO CALIBRATE.");
      return;
    }
    
    // Step 1: NEUTRAL
    setCalStep('neutral');
    setCalCountdown(3);
    calSampleRef.current = [];
    
    // Countdown
    for (let c = 3; c > 0; c--) {
      setCalCountdown(c);
      playScore(); // transition sound
      await new Promise(r => setTimeout(r, 800));
    }
    
    // Capture Neutral (1 second / 20 frames sample)
    setCalCountdown(0);
    setCalProgress(0);
    const neutralSamples: [number[], number[]] = [[], []];
    for (let i = 0; i < 20; i++) {
      const currentFaces = detectedFacesRef.current;
      if (currentFaces[0]) neutralSamples[0].push(currentFaces[0].rawSmileMetric);
      if (currentFaces[1]) neutralSamples[1].push(currentFaces[1].rawSmileMetric);
      setCalProgress(Math.round(((i + 1) / 20) * 100));
      await new Promise(r => setTimeout(r, 50));
    }
    const n1 = neutralSamples[0].reduce((s, v) => s + v, 0) / neutralSamples[0].length || 0.0;
    const n2 = neutralSamples[1].reduce((s, v) => s + v, 0) / neutralSamples[1].length || 0.0;

    // Step 2: SMILE
    setCalStep('smile');
    setCalCountdown(3);
    for (let c = 3; c > 0; c--) {
      setCalCountdown(c);
      playScore();
      await new Promise(r => setTimeout(r, 800));
    }
    setCalCountdown(0);
    setCalProgress(0);
    const smileSamples: [number[], number[]] = [[], []];
    for (let i = 0; i < 20; i++) {
      const currentFaces = detectedFacesRef.current;
      if (currentFaces[0]) smileSamples[0].push(currentFaces[0].rawSmileMetric);
      if (currentFaces[1]) smileSamples[1].push(currentFaces[1].rawSmileMetric);
      setCalProgress(Math.round(((i + 1) / 20) * 100));
      await new Promise(r => setTimeout(r, 50));
    }
    const s1 = smileSamples[0].reduce((s, v) => s + v, 0) / smileSamples[0].length || 0.5;
    const s2 = smileSamples[1].reduce((s, v) => s + v, 0) / smileSamples[1].length || 0.5;

    // Step 3: FROWN
    setCalStep('frown');
    setCalCountdown(3);
    for (let c = 3; c > 0; c--) {
      setCalCountdown(c);
      playScore();
      await new Promise(r => setTimeout(r, 800));
    }
    setCalCountdown(0);
    setCalProgress(0);
    const frownSamples: [number[], number[]] = [[], []];
    for (let i = 0; i < 20; i++) {
      const currentFaces = detectedFacesRef.current;
      if (currentFaces[0]) frownSamples[0].push(currentFaces[0].rawSmileMetric);
      if (currentFaces[1]) frownSamples[1].push(currentFaces[1].rawSmileMetric);
      setCalProgress(Math.round(((i + 1) / 20) * 100));
      await new Promise(r => setTimeout(r, 50));
    }
    const f1 = frownSamples[0].reduce((s, v) => s + v, 0) / frownSamples[0].length || -0.4;
    const f2 = frownSamples[1].reduce((s, v) => s + v, 0) / frownSamples[1].length || -0.4;

    // Save calibration parameters
    setCalibration(0, { neutral: n1, smile: s1, frown: f1 });
    setCalibration(1, { neutral: n2, smile: s2, frown: f2 });
    
    setCalStep('complete');
    playWin(); // win completion sound
  };

  const handleStartMatch = () => {
    setScreen('match');
    setIsPaused(false);
    isPausedRef.current = false;
    setMatchScore({ p1: 0, p2: 0 });
    maxSmileP1Ref.current = 0;
    maxSmileP2Ref.current = 0;
    fpsAccumulatorRef.current = [];
    matchDurationRef.current = 0;
    
    // Start duration tracker
    matchIntervalRef.current = window.setInterval(() => {
      if (!isPausedRef.current) {
        matchDurationRef.current += 1;
        // Record average stats
        fpsAccumulatorRef.current.push(fpsRef.current);
      }
    }, 1000);
  };

  // Sync state to refs and BGM pause loop
  useEffect(() => {
    isPausedRef.current = isPaused;
    if (isPaused) {
      stopBackgroundMusic();
    } else if (screen === 'match' && !muted) {
      startBackgroundMusic();
    }
  }, [isPaused, screen, muted]);

  useEffect(() => {
    fpsRef.current = fps;
  }, [fps]);

  // Monitor expression peaks during game for reveal stats
  useEffect(() => {
    if (screen === 'match' && !isPaused) {
      if (detectedFaces[0]) {
        maxSmileP1Ref.current = Math.max(maxSmileP1Ref.current, detectedFaces[0].calibratedValue);
      }
      if (detectedFaces[1]) {
        maxSmileP2Ref.current = Math.max(maxSmileP2Ref.current, detectedFaces[1].calibratedValue);
      }
    }
  }, [detectedFaces, screen, isPaused]);

  const handleScoreUpdate = (p1: number, p2: number) => {
    setMatchScore({ p1, p2 });
  };

  const handleWin = (winner: string, p1Score: number, p2Score: number) => {
    if (matchIntervalRef.current) {
      clearInterval(matchIntervalRef.current);
    }
    setIsPaused(false);
    isPausedRef.current = false;
    stopBackgroundMusic();

    const finalWinnerName = winner === 'PLAYER 1' ? p1Name : p2Name;
    setWinnerName(finalWinnerName);
    
    const avgFps = fpsAccumulatorRef.current.length > 0 
      ? Math.round(fpsAccumulatorRef.current.reduce((s, v) => s + v, 0) / fpsAccumulatorRef.current.length) 
      : 60;
      
    const finalStats = {
      maxSmileP1: maxSmileP1Ref.current,
      maxSmileP2: maxSmileP2Ref.current,
      avgFps,
      matchDurationSec: matchDurationRef.current
    };
    
    setMatchStats(finalStats);
    
    // Save to leaderboard
    addLeaderboardEntry({
      p1Name,
      p2Name,
      p1Score,
      p2Score,
      winner: finalWinnerName,
      maxSmile1: finalStats.maxSmileP1,
      maxSmile2: finalStats.maxSmileP2,
      avgFps
    });

    playWin();
    setScreen('reveal');
  };

  const handlePlayAgain = () => {
    setScreen('calibrate');
    setCalStep('idle');
  };

  const handleReturnMenu = () => {
    stopTracking();
    stopBackgroundMusic();
    setIsPaused(false);
    isPausedRef.current = false;
    setScreen('hook');
    setCalStep('idle');
  };

  const toggleMuted = () => {
    const isMuted = toggleMute();
    setMuted(isMuted);
  };

  // Extract calibrated and raw smile scores to send to Telemetry HUD
  const p1Calibrated = detectedFaces[0]?.calibratedValue || 0;
  const p2Calibrated = detectedFaces[1]?.calibratedValue || 0;
  const p1Raw = detectedFaces[0]?.rawSmileMetric || 0;
  const p2Raw = detectedFaces[1]?.rawSmileMetric || 0;

  return (
    <div className="w-screen h-screen flex flex-col items-center justify-between p-3 select-none box-border relative overflow-hidden bg-black text-yellow-500 crt-overlay uppercase">
      {/* Hidden video element that stays mounted forever */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* Background neon grid */}
      <div className="absolute inset-0 arcade-grid pointer-events-none z-0"></div>

      {/* HEADER SECTION */}
      <header className="w-full max-w-7xl flex justify-between items-center z-10 border-b-2 border-yellow-500 pb-2">
        <div className="flex items-center gap-2">
          <div className="font-arcade text-xs tracking-wider glow-text-yellow animate-pulse">
            EMOTION PONG // IETE
          </div>
        </div>
        
        {/* AUDIO MUTE TOGGLE */}
        <button 
          onClick={toggleMuted}
          className="p-1 border-2 border-yellow-500/50 hover:border-yellow-500 hover:bg-yellow-950/30 cursor-pointer active:scale-95 text-yellow-500 select-none transition-all flex items-center justify-center"
        >
          {muted ? <VolumeX className="w-4 h-4 text-red-500 animate-pulse" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </header>

      {/* SCREEN ROUTING */}
      <main className="flex-1 w-full max-w-7xl flex flex-col justify-center items-center py-4 z-10 overflow-hidden">
        
        {/* LOADING INDICATOR */}
        {isLoading && screen !== 'hook' && (
          <div className="flex flex-col items-center gap-3 retro-panel-glass-cyan p-6 text-center border-2 border-cyan-500 max-w-sm">
            <div className="font-arcade text-[10px] text-cyan-400 animate-bounce">LOADING MACHINE LEARNING ENGINE...</div>
            <div className="text-[9px] font-mono text-cyan-500/80">INITIALIZING WEBCAM AND COMPILING WEBASSEMBLY RUNTIME</div>
            <div className="w-32 bg-cyan-950 h-2 border border-cyan-500 overflow-hidden relative mt-2">
              <div className="bg-cyan-500 h-full w-full animate-[loading-bar_1.5s_infinite] origin-left"></div>
            </div>
          </div>
        )}

        {/* ERROR SCREEN */}
        {error && (
          <div className="flex flex-col items-center gap-3 bg-red-950/40 border-2 border-red-500 p-6 text-center max-w-md text-red-500 retro-panel-glass-red">
            <ShieldAlert className="w-8 h-8 text-red-500 animate-pulse" />
            <div className="font-arcade text-[10px] glow-text-red">SYSTEM FATAL CRASH</div>
            <div className="text-[9px] font-mono leading-relaxed">{error}</div>
            <button 
              onClick={() => window.location.reload()} 
              className="mt-3 px-4 py-1.5 border-2 border-red-500 bg-red-900/30 font-arcade text-[8px] cursor-pointer hover:bg-red-500 hover:text-black transition-all"
            >
              RESTART CABIN
            </button>
          </div>
        )}

        {!isLoading && !error && (
          <>
            {/* 0. LOGIN SCREEN */}
            {screen === 'login' && (
              <div className="flex flex-col items-center justify-between text-center gap-6 max-w-lg">
                <div className="flex flex-col items-center gap-2">
                  <h1 className="font-arcade text-3xl sm:text-4xl tracking-tighter animate-[pulse_1.5s_infinite] select-none">
                    <span className="text-[#ff2400] glow-text-red">EMOTION</span> <span className="text-[#007fff] glow-text-blue">PONG</span>
                  </h1>
                  <p className="text-xs font-arcade text-yellow-600 tracking-wide mt-1">
                    STALL LEAD CAPTURE & REGISTRATION
                  </p>
                </div>

                <form onSubmit={handleRegisterAndStart} className="border-4 border-yellow-500 p-8 bg-black/60 relative w-full flex flex-col gap-5 shadow-[0_0_20px_rgba(234,179,8,0.2)] text-left select-none max-w-md">
                  <div className="absolute top-2 left-2 text-[8px] text-yellow-600 font-mono">SQL_DATABASE_CONNECT // PORT 3001</div>
                  
                  {leadError && (
                    <div className="text-[10px] font-mono text-red-500 border border-red-500/50 p-2 bg-red-950/20 text-center uppercase">
                      {leadError}
                    </div>
                  )}

                  {/* Player 1 details */}
                  <div className="flex flex-col border border-red-500/50 bg-black/40 p-3">
                    <label className="text-[9px] font-arcade text-red-400 mb-1">PLAYER 1 NAME *</label>
                    <input 
                      type="text" 
                      placeholder="ENTER NAME"
                      value={p1Name === 'Player 1' ? '' : p1Name} 
                      onChange={(e) => setP1Name(e.target.value.substring(0, 15))} 
                      className="bg-black border border-red-500/30 text-red-400 p-2 text-xs font-mono uppercase focus:border-red-500 focus:outline-none"
                      required
                    />
                    <label className="text-[9px] font-arcade text-red-400 mt-2 mb-1">PLAYER 1 CONTACT NUMBER *</label>
                    <input 
                      type="tel" 
                      placeholder="ENTER CONTACT NUMBER"
                      value={p1Contact} 
                      onChange={(e) => setP1Contact(e.target.value.substring(0, 15))} 
                      className="bg-black border border-red-500/30 text-red-400 p-2 text-xs font-mono focus:border-red-500 focus:outline-none"
                      required
                    />
                  </div>

                  {/* Player 2 details */}
                  <div className="flex flex-col border border-blue-500/50 bg-black/40 p-3">
                    <label className="text-[9px] font-arcade text-blue-400 mb-1">PLAYER 2 NAME (OPTIONAL)</label>
                    <input 
                      type="text" 
                      placeholder="ENTER P2 NAME"
                      value={p2Name === 'Player 2' ? '' : p2Name} 
                      onChange={(e) => setP2Name(e.target.value.substring(0, 15))} 
                      className="bg-black border border-blue-500/30 text-blue-400 p-2 text-xs font-mono uppercase focus:border-blue-500 focus:outline-none"
                    />
                    <label className="text-[9px] font-arcade text-blue-400 mt-2 mb-1">PLAYER 2 CONTACT NUMBER (OPTIONAL)</label>
                    <input 
                      type="tel" 
                      placeholder="ENTER P2 CONTACT NUMBER"
                      value={p2Contact} 
                      onChange={(e) => setP2Contact(e.target.value.substring(0, 15))} 
                      className="bg-black border border-blue-500/30 text-blue-400 p-2 text-xs font-mono focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingLeads}
                    className="w-full py-3 border-2 border-yellow-500 bg-yellow-950/30 font-arcade text-xs text-yellow-500 cursor-pointer hover:bg-yellow-500 hover:text-black transition-all flex justify-center items-center gap-2 select-none active:scale-95 disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5 fill-current" />
                    {isSubmittingLeads ? 'SAVING DATA...' : 'ENTER GAME CABINET'}
                  </button>
                </form>
              </div>
            )}

            {/* 1. HOOK SCREEN */}
            {screen === 'hook' && (
              <div className="flex flex-col items-center justify-between text-center gap-6 max-w-lg">
                <div className="flex flex-col items-center gap-2">
                  <h1 className="font-arcade text-3xl sm:text-4xl tracking-tighter animate-[pulse_1.5s_infinite]">
                    <span className="text-[#ff2400] glow-text-red">EMOTION</span> <span className="text-[#007fff] glow-text-blue">PONG</span>
                  </h1>
                  <p className="text-xs font-arcade text-yellow-500 tracking-wide mt-2">
                    FACIAL RECOGNITION ARCADE EXPERIENCE
                  </p>
                </div>

                {/* Simulated CRT Screen Preview box */}
                <div className="border-4 border-yellow-500 p-10 bg-black/60 relative w-full aspect-[4/3] flex flex-col justify-center items-center gap-4 shadow-[0_0_20px_rgba(234,179,8,0.2)] select-none max-w-md">
                  <div className="absolute top-2 left-2 text-[10px] text-yellow-500 font-mono font-semibold">CRT_STALL_SYS // PORT 9600</div>
                  <div className="absolute top-2 right-2 text-[10px] text-yellow-500 font-mono font-semibold">1v1_MODE</div>
                  
                  <div className="font-arcade text-base text-yellow-400 animate-pulse glow-text-yellow mt-4">
                    PRESS START CABINET
                  </div>
                  
                  <div className="text-xs font-mono text-yellow-300 leading-relaxed text-center max-w-sm mt-2 border border-yellow-500/50 p-4 bg-yellow-950/20">
                    PADDLE 1 CONTROLLED BY SMILE (▲) & FROWN (▼) OF LEFT PLAYER.<br/>
                    PADDLE 2 CONTROLLED BY SMILE (▲) & FROWN (▼) OF RIGHT PLAYER.<br/>
                    * BALL SPEEDS UP WITH EACH SCORE FOR MAXIMUM INTENSITY! *
                  </div>
                </div>

                <button
                  onClick={handleStartArcade}
                  className="px-8 py-4 border-2 border-yellow-500 bg-yellow-950/30 font-arcade text-sm text-yellow-500 cursor-pointer hover:bg-yellow-500 hover:text-black transition-all flex items-center gap-2 select-none shadow-[0_0_10px_rgba(234,179,8,0.25)] active:scale-95"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  START GAME CABINET
                </button>
              </div>
            )}

            {/* 2. ENROLLMENT / CALIBRATION SCREEN */}
            {screen === 'calibrate' && (
              <div className="w-full flex flex-col items-center gap-4">
                <div className="text-center">
                  <h2 className="font-arcade text-base glow-text-yellow mb-2">PLAYER REGISTRATION & CALIBRATION</h2>
                  <p className="text-xs text-yellow-400 font-mono font-semibold">SIT SIDE-BY-SIDE IN FRONT OF THE CAMERA. ADJUST LIGHTING.</p>
                </div>

                {/* Input Fields */}
                <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                  <div className="flex flex-col border border-yellow-500/50 bg-black/40 p-2.5">
                    <label className="text-[10px] font-arcade text-red-400 mb-1">P1 NAME (RED PADDLE)</label>
                    <input 
                      type="text" 
                      value={p1Name} 
                      onChange={(e) => setP1Name(e.target.value.substring(0, 15))} 
                      className="bg-black border border-red-500/30 text-red-400 p-2 text-xs font-mono uppercase focus:border-red-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col border border-yellow-500/50 bg-black/40 p-2.5">
                    <label className="text-[10px] font-arcade text-blue-400 mb-1">P2 NAME (BLUE PADDLE)</label>
                    <input 
                      type="text" 
                      value={p2Name} 
                      onChange={(e) => setP2Name(e.target.value.substring(0, 15))} 
                      className="bg-black border border-blue-500/30 text-blue-400 p-2 text-xs font-mono uppercase focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Webcam Box & Overlay */}
                <div className="relative w-full max-w-[480px] aspect-[4/3] border-4 border-yellow-500 bg-black shadow-[0_0_15px_rgba(234,179,8,0.15)]">
                  {/* Mesh Canvas overlay mirrored (displays both the video feed and the wireframe mesh) */}
                  <canvas 
                    ref={overlayCanvasRef} 
                    width={480}
                    height={360}
                    className="w-full h-full object-cover scale-x-[-1]" 
                  />

                  {/* Calibration overlay card */}
                  {calStep !== 'idle' && calStep !== 'complete' && (
                    <div className="absolute inset-0 bg-black/85 flex flex-col justify-center items-center text-center p-6 border-2 border-yellow-500">
                      {calCountdown > 0 ? (
                        <>
                          <div className="font-arcade text-sm text-yellow-400 mb-3">GET READY TO CALIBRATE</div>
                          <div className="font-arcade text-4xl text-yellow-300 animate-ping">{calCountdown}</div>
                          <div className="text-sm font-mono text-yellow-300 font-bold mt-6">
                            {calStep === 'neutral' && 'LOOK NEUTRAL AND RELAXED'}
                            {calStep === 'smile' && 'SMILE AS WIDE AS YOU CAN'}
                            {calStep === 'frown' && 'FROWN / PURSE LIPS / FURROW EYEBROWS'}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="font-arcade text-xs text-yellow-300 mb-2">RECORDING FACIAL PATTERN...</div>
                          <div className="font-arcade text-[10px] text-yellow-500 mb-4">{calProgress}%</div>
                          <div className="w-32 bg-yellow-950 h-2 border border-yellow-500 overflow-hidden relative">
                            <div className="bg-yellow-500 h-full" style={{ width: `${calProgress}%` }}></div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Face detection warning helper */}
                  {calStep === 'idle' && (
                    <div className={`absolute bottom-2 left-2 right-2 border-2 p-2.5 text-center font-mono text-xs animate-pulse ${
                      detectedFaces.length === 0 
                        ? 'bg-red-950/80 border-red-500 text-red-500' 
                        : detectedFaces.length === 1 
                          ? 'bg-yellow-950/80 border-yellow-500 text-yellow-500' 
                          : 'bg-green-950/80 border-green-500 text-green-500'
                    }`}>
                      ▲ SYSTEM SIGNAL: DETECTED_FACES: {detectedFaces.length}/2. 
                      {detectedFaces.length === 0 && " NO FACE DETECTED. PLEASE FACE THE CAMERA."}
                      {detectedFaces.length === 1 && " SINGLE FACE DETECTED. PLAYER 2 WILL BE CONTROLLED BY AI."}
                      {detectedFaces.length >= 2 && " DUAL FACES READY. 1v1 MATCH MODE ENABLED."}
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="flex gap-4">
                  {calStep === 'idle' && (
                    <button
                      onClick={startCalibrationSequence}
                      disabled={detectedFaces.length < 1}
                      className={`px-6 py-3 border-2 font-arcade text-xs transition-all ${
                        detectedFaces.length < 1 
                          ? 'border-yellow-950 text-yellow-800 bg-black/20 cursor-not-allowed'
                          : 'border-yellow-500 text-yellow-500 bg-yellow-950/20 cursor-pointer hover:bg-yellow-500 hover:text-black active:scale-95'
                      }`}
                    >
                      INITIATE 3-STEP CALIBRATION
                    </button>
                  )}

                  {calStep === 'complete' && (
                    <button
                      onClick={handleStartMatch}
                      className="px-8 py-3 border-2 border-yellow-500 bg-yellow-950/20 text-yellow-500 font-arcade text-xs cursor-pointer hover:bg-yellow-500 hover:text-black active:scale-95 transition-all animate-pulse"
                    >
                      START MATCH
                    </button>
                  )}

                  <button
                    onClick={handleReturnMenu}
                    className="px-6 py-3 border-2 border-red-500/50 bg-red-950/15 text-red-500 font-arcade text-xs cursor-pointer hover:bg-red-500 hover:text-black active:scale-95 transition-all"
                  >
                    RETURN TO MENU
                  </button>
                </div>
              </div>
            )}

            {/* 3. MATCH SCREEN */}
            {screen === 'match' && (
              <div className="w-full flex flex-col lg:flex-row gap-6 items-stretch justify-center h-full">
                {/* LEFT COLUMN: GAME PANEL */}
                <div className="flex-[3.5] flex flex-col justify-center gap-2 min-w-0">
                  <div className="flex justify-between items-center border-2 border-yellow-500/30 bg-black/85 p-3.5 text-xs font-mono text-yellow-500">
                    <div className="flex items-center gap-2">
                      <span className={isPaused ? "text-red-500 animate-pulse font-bold" : "animate-pulse"}>
                        ● STATUS: {isPaused ? 'PAUSED' : 'ACTIVE'}
                      </span>
                      <span className="text-yellow-600">|</span>
                      <span>1v1 EMOTION PROGRESSION CLASH</span>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => setIsPaused(!isPaused)}
                        className={`px-3 py-1 border-2 font-arcade text-[10px] cursor-pointer select-none active:scale-95 transition-all ${
                          isPaused
                            ? 'border-green-500 bg-green-950/20 text-green-500 hover:bg-green-500 hover:text-black'
                            : 'border-yellow-500 bg-yellow-950/20 text-yellow-500 hover:bg-yellow-500 hover:text-black'
                        }`}
                      >
                        {isPaused ? 'RESUME' : 'PAUSE'}
                      </button>
                      <button
                        onClick={handleReturnMenu}
                        className="px-3 py-1 border-2 border-red-500 bg-red-950/20 text-red-500 hover:bg-red-500 hover:text-black font-arcade text-[10px] cursor-pointer select-none active:scale-95 transition-all"
                      >
                        QUIT
                      </button>
                    </div>
                  </div>

                  <GameCanvas 
                    p1Val={p1Calibrated}
                    p2Val={p2Calibrated}
                    isPlaying={screen === 'match'}
                    isPaused={isPaused}
                    p1Name={p1Name}
                    p2Name={p2Name}
                    isSinglePlayer={detectedFaces.length < 2}
                    onWin={handleWin}
                    onScoreUpdate={handleScoreUpdate}
                  />

                  {/* Visualizer showing webcam PiP with overlays */}
                  <div className="flex justify-between items-center border border-yellow-500/30 bg-black/60 p-2 mt-1">
                    <div className="flex items-center gap-2">
                      <Camera className="w-4.5 h-4.5 text-yellow-500/70" />
                      <span className="text-xs font-mono text-yellow-500/80">CAMERA STREAM & WIREFRAME</span>
                    </div>
                    {/* Micro camera canvas feed */}
                    <div className="relative w-36 aspect-[4/3] border border-yellow-500 bg-black overflow-hidden">
                      <canvas 
                        ref={overlayCanvasRef} 
                        width={144}
                        height={108}
                        className="w-full h-full object-cover scale-x-[-1]" 
                      />
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: TELEMETRY HUD & MODEL ACCURACY PANEL */}
                <div className="flex-[1] min-w-[280px] lg:max-w-[360px] flex flex-col">
                  <TelemetryHud 
                    fps={fps}
                    latency={latency}
                    face1Val={p1Calibrated}
                    face2Val={p2Calibrated}
                    face1Raw={p1Raw}
                    face2Raw={p2Raw}
                    facesDetected={detectedFaces.length}
                  />
                  <ModelAccuracyPanel 
                    detectedFaces={detectedFaces}
                    latency={latency}
                  />
                </div>
              </div>
            )}

            {/* 4. REVEAL SCREEN */}
            {screen === 'reveal' && (
              <div className="w-full flex flex-col md:flex-row gap-6 max-w-4xl justify-center items-stretch py-2 font-mono">
                {/* MATCH RESULTS STATS */}
                <div className="flex-1 p-6 uppercase retro-panel-glass-yellow text-yellow-500 flex flex-col justify-between shadow-[0_0_15px_rgba(234,179,8,0.2)] min-h-[380px]">
                  <div className="border-b border-yellow-500 pb-2.5 mb-3 flex items-center gap-2 justify-between">
                    <span className="text-sm font-arcade glow-text-yellow">MATCH RESULTS SUMMARY</span>
                    <Sparkles className="w-3.5 h-3.5 text-yellow-400 animate-spin" />
                  </div>

                  <div className="flex flex-col items-center text-center gap-2 my-2">
                    <span className="text-[10px] font-arcade text-yellow-600">WINNER REVEALED</span>
                    <h3 className="font-arcade text-lg sm:text-xl glow-text-yellow text-yellow-300 animate-[bounce_1s_infinite]">
                      🏆 {winnerName}
                    </h3>
                    <div className="font-arcade text-base border-2 border-yellow-500/50 px-6 py-2 mt-2 text-yellow-400 bg-yellow-950/15">
                      FINAL: {matchScore.p1} - {matchScore.p2}
                    </div>
                  </div>

                  {/* DATA METRICS */}
                  <div className="border-2 border-yellow-500/50 p-3.5 my-2 bg-yellow-950/5 space-y-2.5 text-xs">
                    <div className="font-bold border-b border-yellow-500/30 pb-1 text-yellow-400 mb-1 text-center">
                      SPATIAL MOVEMENT & PERFORMANCE DATA
                    </div>
                    <div className="flex justify-between">
                      <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5 text-yellow-600" /> DURATION:</span>
                      <span className="text-yellow-300 font-bold">{matchStats.matchDurationSec} SECONDS</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="flex items-center gap-1"><TrendingUp className="w-2.5 h-2.5 text-yellow-600" /> PEAK EXPRESSION (P1):</span>
                      <span className="text-yellow-300 font-bold">{(matchStats.maxSmileP1 * 100).toFixed(0)}% SMILE</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="flex items-center gap-1"><TrendingUp className="w-2.5 h-2.5 text-yellow-600" /> PEAK EXPRESSION (P2):</span>
                      <span className="text-yellow-300 font-bold">{(matchStats.maxSmileP2 * 100).toFixed(0)}% SMILE</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="flex items-center gap-1"><RotateCcw className="w-2.5 h-2.5 text-yellow-600" /> AVG INFERENCE RATE:</span>
                      <span className="text-yellow-300 font-bold">{matchStats.avgFps} FPS</span>
                    </div>
                  </div>

                  {/* BUTTONS */}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={handlePlayAgain}
                      className="flex-1 py-3 border-2 border-yellow-500 bg-yellow-950/20 text-yellow-500 font-arcade text-xs cursor-pointer hover:bg-yellow-500 hover:text-black active:scale-95 transition-all text-center flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      PLAY AGAIN
                    </button>
                    <button
                      onClick={handleReturnMenu}
                      className="flex-1 py-3 border-2 border-red-500 bg-red-950/20 text-red-500 font-arcade text-xs cursor-pointer hover:bg-red-500 hover:text-black active:scale-95 transition-all text-center flex items-center justify-center gap-1.5"
                    >
                      MAIN MENU
                    </button>
                  </div>
                </div>

                {/* LEADERBOARD VIEW */}
                <div className="flex-1 min-w-[300px]">
                  <Leaderboard />
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* FOOTER SECTION */}
      <footer className="w-full max-w-7xl border-t border-yellow-500/30 pt-2 flex justify-between items-center text-[10px] font-mono text-yellow-600/80 z-10 uppercase">
        <span>STALL_HARDWARE: DISCOVERABLE</span>
        <span>© 2026 INSTITUTION OF ELECTRONICS AND TELECOMMUNICATION ENGINEERS</span>
        <span>SYSTEM_STATUS: OK</span>
      </footer>
    </div>
  );
}
