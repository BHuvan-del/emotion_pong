let audioCtx: AudioContext | null = null;
let bgmInterval: number | null = null;
let isMuted = false;

export const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

export const toggleMute = (): boolean => {
  isMuted = !isMuted;
  if (isMuted) {
    stopBackgroundMusic();
  }
  return isMuted;
};

export const getMuted = (): boolean => {
  return isMuted;
};

export const playPaddleHit = () => {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.type = 'square';
  const now = ctx.currentTime;
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(500, now + 0.1);
  
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  
  osc.start(now);
  osc.stop(now + 0.12);
};

export const playWallHit = () => {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.type = 'triangle';
  const now = ctx.currentTime;
  osc.frequency.setValueAtTime(100, now);
  
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  
  osc.start(now);
  osc.stop(now + 0.09);
};

export const playScore = () => {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  
  const now = ctx.currentTime;
  
  const playTone = (freq: number, start: number, duration: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, start);
    
    gain.gain.setValueAtTime(0.06, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    
    osc.start(start);
    osc.stop(start + duration + 0.02);
  };
  
  // Retro double tone (C5 to G5)
  playTone(523.25, now, 0.08);
  playTone(783.99, now + 0.08, 0.15);
};

export const playWin = () => {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  
  const now = ctx.currentTime;
  const arpeggio = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C Major
  
  arpeggio.forEach((freq, i) => {
    const noteStart = now + i * 0.07;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = i % 2 === 0 ? 'square' : 'triangle';
    osc.frequency.setValueAtTime(freq, noteStart);
    
    gain.gain.setValueAtTime(0.07, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.2);
    
    osc.start(noteStart);
    osc.stop(noteStart + 0.22);
  });
};

export const startBackgroundMusic = () => {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (bgmInterval) return;
  
  const bassNotes = [
    130.81, 130.81, 196.00, 196.00, 
    220.00, 220.00, 174.61, 174.61,
    130.81, 130.81, 196.00, 196.00, 
    164.81, 164.81, 146.83, 196.00
  ];
  
  let step = 0;
  
  bgmInterval = window.setInterval(() => {
    const ctxLive = getAudioContext();
    if (!ctxLive || isMuted) return;
    
    const now = ctxLive.currentTime;
    const osc = ctxLive.createOscillator();
    const gain = ctxLive.createGain();
    
    osc.connect(gain);
    gain.connect(ctxLive.destination);
    
    osc.type = 'triangle';
    const baseFreq = bassNotes[step % bassNotes.length];
    
    osc.frequency.setValueAtTime(baseFreq, now);
    
    gain.gain.setValueAtTime(0.02, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    
    osc.start(now);
    osc.stop(now + 0.25);
    
    if (step % 4 === 0) {
      const trebleOsc = ctxLive.createOscillator();
      const trebleGain = ctxLive.createGain();
      
      trebleOsc.connect(trebleGain);
      trebleGain.connect(ctxLive.destination);
      
      trebleOsc.type = 'square';
      const trebleFreq = baseFreq * 4;
      trebleOsc.frequency.setValueAtTime(trebleFreq, now);
      
      trebleGain.gain.setValueAtTime(0.012, now);
      trebleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      
      trebleOsc.start(now);
      trebleOsc.stop(now + 0.18);
    }
    
    step++;
  }, 250);
};

export const stopBackgroundMusic = () => {
  if (bgmInterval) {
    clearInterval(bgmInterval);
    bgmInterval = null;
  }
};
