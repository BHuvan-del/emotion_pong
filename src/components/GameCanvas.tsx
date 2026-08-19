import React, { useEffect, useRef } from 'react';
import { playPaddleHit, playWallHit, playScore } from '../utils/audio';

interface GameCanvasProps {
  p1Val: number; // -1 to +1
  p2Val: number; // -1 to +1
  isPlaying: boolean;
  isPaused: boolean;
  p1Name: string;
  p2Name: string;
  isSinglePlayer: boolean;
  onWin: (winner: string, p1Score: number, p2Score: number) => void;
  onScoreUpdate: (p1Score: number, p2Score: number) => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  p1Val,
  p2Val,
  isPlaying,
  isPaused,
  p1Name,
  p2Name,
  isSinglePlayer,
  onWin,
  onScoreUpdate
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number | null>(null);
  // Offscreen canvas: static background pre-rendered once (grid + border + center line)
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── Refs for all frequently-changing props ──
  // The game loop reads these via refs instead of closures so the useEffect
  // never needs to re-run when expression values, names, or pause state change.
  // This prevents the critical bug where the loop was torn down & recreated 20x/sec.
  const p1ValRef = useRef(p1Val);
  const p2ValRef = useRef(p2Val);
  const isPausedRef = useRef(isPaused);
  const p1NameRef = useRef(p1Name);
  const p2NameRef = useRef(p2Name);
  const isSinglePlayerRef = useRef(isSinglePlayer);
  const onWinRef = useRef(onWin);
  const onScoreUpdateRef = useRef(onScoreUpdate);

  // Sync refs on every render (cheap — just pointer assignment, no side effects)
  useEffect(() => { p1ValRef.current = p1Val; }, [p1Val]);
  useEffect(() => { p2ValRef.current = p2Val; }, [p2Val]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { p1NameRef.current = p1Name; }, [p1Name]);
  useEffect(() => { p2NameRef.current = p2Name; }, [p2Name]);
  useEffect(() => { isSinglePlayerRef.current = isSinglePlayer; }, [isSinglePlayer]);
  useEffect(() => { onWinRef.current = onWin; }, [onWin]);
  useEffect(() => { onScoreUpdateRef.current = onScoreUpdate; }, [onScoreUpdate]);

  // Game coordinates and sizes (scaled to 1.5x resolution for huge projection screens)
  const width = 1200;
  const height = 675;
  const paddleWidth = 18;
  const paddleHeight = 120;
  const ballSize = 16;

  // Game physics state
  const stateRef = useRef({
    p1Y: height / 2 - paddleHeight / 2,
    p2Y: height / 2 - paddleHeight / 2,
    p1Score: 0,
    p2Score: 0,
    ballX: width / 2 - ballSize / 2,
    ballY: height / 2 - ballSize / 2,
    ballSpeedX: 4.5,
    ballSpeedY: 2.0,
    serveDirection: 1, // 1 for right, -1 for left
    pointCooldown: 0,  // Cooldown frames after scoring
    isFinished: false,
    lastRallySpeed: 22.0 // Tracks the speed at end of last rally for serve continuity
  });

  // Pre-render static background to offscreen canvas once on mount
  useEffect(() => {
    const bg = document.createElement('canvas');
    bg.width = width;
    bg.height = height;
    const bx = bg.getContext('2d')!;

    // Black fill
    bx.fillStyle = '#000000';
    bx.fillRect(0, 0, width, height);

    // Grid — single batched path
    bx.beginPath();
    bx.strokeStyle = 'rgba(59, 130, 246, 0.18)';
    bx.lineWidth = 1;
    for (let x = 40; x < width; x += 40) { bx.moveTo(x, 0); bx.lineTo(x, height); }
    for (let y = 40; y < height; y += 40) { bx.moveTo(0, y); bx.lineTo(width, y); }
    bx.stroke();

    // Border
    bx.strokeStyle = '#ffd700';
    bx.lineWidth = 4;
    bx.strokeRect(2, 2, width - 4, height - 4);

    // Center dashed line
    bx.setLineDash([15, 12]);
    bx.beginPath();
    bx.moveTo(width / 2, 6);
    bx.lineTo(width / 2, height - 6);
    bx.stroke();
    bx.setLineDash([]);

    bgCanvasRef.current = bg;
  }, []);

  // Reset state when isPlaying changes (new game starts)
  useEffect(() => {
    stateRef.current.isFinished = false;
    stateRef.current.p1Score = 0;
    stateRef.current.p2Score = 0;
    resetBall(true);
  }, [isPlaying]);

  const resetBall = (firstServe: boolean = false) => {
    const state = stateRef.current;
    state.ballX = width / 2 - ballSize / 2;
    state.ballY = height / 2 - ballSize / 2;
    
    // Choose serve direction
    if (!firstServe) {
      state.serveDirection = -state.serveDirection;
    } else {
      state.serveDirection = Math.random() > 0.5 ? 1 : -1;
    }
    
    let serveSpeed: number;
    if (firstServe) {
      // First serve: use score-based base speed
      const totalScore = state.p1Score + state.p2Score;
      serveSpeed = 22 + totalScore * 1.80;
    } else {
      // Subsequent serves: carry forward the speed from the last rally
      // so momentum is preserved and the game stays at the pace it was at
      serveSpeed = state.lastRallySpeed;
    }
    
    // Set starting speed
    state.ballSpeedX = state.serveDirection * serveSpeed;
    // Random vertical velocity (scales with speed to keep angles proportional)
    state.ballSpeedY = (Math.random() * 2 - 1) * (serveSpeed * 0.6);
    state.pointCooldown = 45; // 0.75s freeze
  };

  const gameLoop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = stateRef.current;

    // Read all fast-changing values from refs (never from closure)
    const curP1Val = p1ValRef.current;
    const curP2Val = p2ValRef.current;
    const curIsPaused = isPausedRef.current;
    const curIsSinglePlayer = isSinglePlayerRef.current;

    if (isPlaying && !state.isFinished && !curIsPaused) {
      // 1. UPDATE PADDLE POSITIONS
      const minY = 5;
      const maxY = height - paddleHeight - 5;
      const centerY = height / 2 - paddleHeight / 2;
      const halfRange = (height - paddleHeight - 10) / 2;

      const targetP1Y = centerY - curP1Val * halfRange;
      const targetP2Y = centerY - curP2Val * halfRange;

      // Smooth interpolation (lerp) — 0.28 = effortless gliding (~130ms reach)
      state.p1Y += (targetP1Y - state.p1Y) * 0.35;

      if (curIsSinglePlayer) {
        const aiTargetY = state.ballY - paddleHeight / 2;
        state.p2Y += (aiTargetY - state.p2Y) * 0.14;
      } else {
        state.p2Y += (targetP2Y - state.p2Y) * 0.35;
      }

      // Clamp
      state.p1Y = Math.max(minY, Math.min(maxY, state.p1Y));
      state.p2Y = Math.max(minY, Math.min(maxY, state.p2Y));

      // 2. UPDATE BALL PHYSICS
      if (state.pointCooldown > 0) {
        state.pointCooldown--;
      } else {
        // CCD (Continuous Collision Detection) — sub-step the ball movement
        const steps = Math.max(1, Math.ceil(Math.abs(state.ballSpeedX) / paddleWidth));
        const stepX = state.ballSpeedX / steps;
        const stepY = state.ballSpeedY / steps;

        // FIX: Deduplicate wall hit sounds — only play once per frame
        let wallHitThisFrame = false;

        for (let s = 0; s < steps; s++) {
          state.ballX += stepX;
          state.ballY += stepY;

          // Wall collisions (Top / Bottom)
          if (state.ballY <= 0) {
            state.ballY = 0;
            state.ballSpeedY = Math.abs(state.ballSpeedY);
            if (!wallHitThisFrame) { playWallHit(); wallHitThisFrame = true; }
          } else if (state.ballY >= height - ballSize) {
            state.ballY = height - ballSize;
            state.ballSpeedY = -Math.abs(state.ballSpeedY);
            if (!wallHitThisFrame) { playWallHit(); wallHitThisFrame = true; }
          }

          // Paddle 1 (Left Player) Collision
          const p1X = 20;
          if (state.ballSpeedX < 0 &&
              state.ballX <= p1X + paddleWidth &&
              state.ballX >= p1X - Math.abs(stepX) &&
              state.ballY + ballSize >= state.p1Y &&
              state.ballY <= state.p1Y + paddleHeight) {

            state.ballX = p1X + paddleWidth;
            const relativeIntersectY = (state.p1Y + (paddleHeight / 2)) - (state.ballY + (ballSize / 2));
            const normalizedIntersectY = relativeIntersectY / (paddleHeight / 2);
            const bounceAngle = normalizedIntersectY * (Math.PI / 3.5);
            const speed = Math.min(36.0, Math.abs(state.ballSpeedX) * 1.14);
            state.ballSpeedX = speed;
            state.ballSpeedY = -speed * Math.sin(bounceAngle);
            playPaddleHit();
            break;
          }

          // Paddle 2 (Right Player) Collision
          const p2X = width - 20 - paddleWidth;
          if (state.ballSpeedX > 0 &&
              state.ballX + ballSize >= p2X &&
              state.ballX + ballSize <= p2X + paddleWidth + Math.abs(stepX) &&
              state.ballY + ballSize >= state.p2Y &&
              state.ballY <= state.p2Y + paddleHeight) {

            state.ballX = p2X - ballSize;
            const relativeIntersectY = (state.p2Y + (paddleHeight / 2)) - (state.ballY + (ballSize / 2));
            const normalizedIntersectY = relativeIntersectY / (paddleHeight / 2);
            const bounceAngle = normalizedIntersectY * (Math.PI / 3.5);
            const speed = Math.min(36.0, Math.abs(state.ballSpeedX) * 1.14);
            state.ballSpeedX = -speed;
            state.ballSpeedY = -speed * Math.sin(bounceAngle);
            playPaddleHit();
            break;
          }
        }

        // Score Detection
        if (state.ballX < 0) {
          state.p2Score += 1;
          onScoreUpdateRef.current(state.p1Score, state.p2Score);
          playScore();
          
          if (state.p2Score >= 5) {
            state.isFinished = true;
            onWinRef.current('PLAYER 2', state.p1Score, state.p2Score);
          } else {
            state.lastRallySpeed = Math.abs(state.ballSpeedX);
            resetBall(false);
          }
        } else if (state.ballX > width) {
          state.p1Score += 1;
          onScoreUpdateRef.current(state.p1Score, state.p2Score);
          playScore();
          
          if (state.p1Score >= 5) {
            state.isFinished = true;
            onWinRef.current('PLAYER 1', state.p1Score, state.p2Score);
          } else {
            state.lastRallySpeed = Math.abs(state.ballSpeedX);
            resetBall(false);
          }
        }
      }
    }

    // 3. RENDER STAGE
    // Blit pre-rendered static background in one draw call
    if (bgCanvasRef.current) {
      ctx.drawImage(bgCanvasRef.current, 0, 0);
    } else {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
    }

    // Draw paddles — solid fill + crisp outline (no shadowBlur)
    ctx.fillStyle = '#ff2400';
    ctx.fillRect(20, state.p1Y, paddleWidth, paddleHeight);
    ctx.strokeStyle = 'rgba(255,100,80,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, state.p1Y, paddleWidth, paddleHeight);

    ctx.fillStyle = '#007fff';
    ctx.fillRect(width - 20 - paddleWidth, state.p2Y, paddleWidth, paddleHeight);
    ctx.strokeStyle = 'rgba(80,160,255,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(width - 20 - paddleWidth, state.p2Y, paddleWidth, paddleHeight);

    // Draw ball — minimal blur=8 only (small element, affordable)
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(state.ballX, state.ballY, ballSize, ballSize);
    ctx.shadowBlur = 0;

    // Score UI — no shadow
    ctx.fillStyle = '#ffd700';
    ctx.font = '72px "Press Start 2P", "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(state.p1Score.toString(), width / 2 - 80, 100);
    ctx.textAlign = 'left';
    ctx.fillText(state.p2Score.toString(), width / 2 + 80, 100);

    // Draw Player Names (read from refs)
    ctx.font = '16px "Press Start 2P", "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff2400';
    ctx.fillText(p1NameRef.current.toUpperCase(), 50, height - 30);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#007fff';
    ctx.fillText(p2NameRef.current.toUpperCase(), width - 50, height - 30);

    // Ready / Freeze message overlay — NO shadowBlur (was 15, caused GPU stalls)
    if (isPlaying && state.pointCooldown > 0 && !state.isFinished) {
      ctx.font = '28px "Press Start 2P", "Courier New", monospace';
      ctx.fillStyle = '#ffd700';
      ctx.textAlign = 'center';
      
      const secondsLeft = Math.ceil(state.pointCooldown / 30);
      if (secondsLeft > 1) {
        ctx.fillText(`GET READY...`, width / 2, height / 2 + 150);
      } else {
        ctx.fillText(`SERVE!`, width / 2, height / 2 + 150);
      }
    }

    // Pause overlay — NO shadowBlur (was 20, caused GPU stalls)
    if (isPlaying && curIsPaused && !state.isFinished) {
      ctx.font = '48px "Press Start 2P", "Courier New", monospace';
      ctx.fillStyle = '#ff2400';
      ctx.textAlign = 'center';
      ctx.fillText(`PAUSED`, width / 2, height / 2 - 20);
      
      ctx.font = '20px "Press Start 2P", "Courier New", monospace';
      ctx.fillStyle = '#ffd700';
      ctx.fillText(`PRESS RESUME TO CONTINUE`, width / 2, height / 2 + 50);
    }

    requestRef.current = requestAnimationFrame(gameLoop);
  };

  // ── CRITICAL FIX: Only depend on [isPlaying] ──
  // Previously depended on [isPlaying, p1Val, p2Val, p1Name, p2Name]
  // which caused the loop to be torn down and recreated 20x/sec.
  // Now all fast-changing values are read from refs inside gameLoop.
  useEffect(() => {
    requestRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isPlaying]);

  return (
    <div className="relative border-4 border-[#ffd700] bg-black aspect-[16/9] w-full overflow-hidden shadow-[0_0_20px_rgba(234,179,8,0.35)]">
      {/* Scanline CRT overlay effect */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(239,68,68,0.04),rgba(59,130,246,0.02),rgba(234,179,8,0.04))] bg-[size:100%_4px,6px_100%] z-20"></div>
      
      {/* Screen flicker simulation */}
      <div className="absolute inset-0 pointer-events-none bg-yellow-500/3 animate-[flicker_0.15s_infinite] z-20"></div>

      <canvas 
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full h-full block bg-black"
      />
    </div>
  );
};
