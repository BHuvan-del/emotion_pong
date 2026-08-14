import React, { useEffect, useRef } from 'react';
import { playPaddleHit, playWallHit, playScore } from '../utils/audio';
import { sendSerialCommand } from '../utils/serial';

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
    isFinished: false
  });

  // Track calibration values and positions
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
    
    // Calculate speed progression: Base speed escalates with each point scored (starts at 10.5, grows by 1.80 per score)
    const totalScore = state.p1Score + state.p2Score;
    const baseSpeed = 10.5 + totalScore * 1.80;
    
    // Set starting speed
    state.ballSpeedX = state.serveDirection * baseSpeed;
    // Random vertical velocity (scales with speed to keep angles proportional)
    state.ballSpeedY = (Math.random() * 2 - 1) * (baseSpeed * 0.6);
    state.pointCooldown = 90; // 1.5s freeze
  };

  const gameLoop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = stateRef.current;

    if (isPlaying && !state.isFinished && !isPaused) {
      // 1. UPDATE PADDLE POSITIONS
      // Map expression values (-1 to +1) to screen positions
      // -1 (frown) should be bottom of screen, +1 (smile) should be top
      // Paddles boundaries
      const minY = 5;
      const maxY = height - paddleHeight - 5;
      const centerY = height / 2 - paddleHeight / 2;
      const halfRange = (height - paddleHeight - 10) / 2;

      // Target positions
      const targetP1Y = centerY - p1Val * halfRange;
      const targetP2Y = centerY - p2Val * halfRange;

      // Smooth interpolation (lerp) for retro responsive sliding
      state.p1Y += (targetP1Y - state.p1Y) * 0.15;

      if (isSinglePlayer) {
        // AI mode: Paddle 2 tracks the ball's Y position with lag
        const aiTargetY = state.ballY - paddleHeight / 2;
        state.p2Y += (aiTargetY - state.p2Y) * 0.055;
      } else {
        state.p2Y += (targetP2Y - state.p2Y) * 0.15;
      }

      // Clamp
      state.p1Y = Math.max(minY, Math.min(maxY, state.p1Y));
      state.p2Y = Math.max(minY, Math.min(maxY, state.p2Y));

      // 2. UPDATE BALL PHYSICS
      if (state.pointCooldown > 0) {
        state.pointCooldown--;
      } else {
        // Move ball
        state.ballX += state.ballSpeedX;
        state.ballY += state.ballSpeedY;

        // Wall collisions (Top / Bottom)
        if (state.ballY <= 0) {
          state.ballY = 0;
          state.ballSpeedY = -state.ballSpeedY;
          playWallHit();
        } else if (state.ballY >= height - ballSize) {
          state.ballY = height - ballSize;
          state.ballSpeedY = -state.ballSpeedY;
          playWallHit();
        }

        // Paddle 1 (Left Player) Collision
        const p1X = 20; // X position of Left Paddle
        if (state.ballSpeedX < 0 && 
            state.ballX <= p1X + paddleWidth && 
            state.ballX >= p1X &&
            state.ballY + ballSize >= state.p1Y && 
            state.ballY <= state.p1Y + paddleHeight) {
          
          state.ballX = p1X + paddleWidth;
          // Calculate relative hit position to apply spin/angle variation
          const relativeIntersectY = (state.p1Y + (paddleHeight / 2)) - (state.ballY + (ballSize / 2));
          const normalizedIntersectY = relativeIntersectY / (paddleHeight / 2);
          const bounceAngle = normalizedIntersectY * (Math.PI / 3.5); // max 51 degree bounce

          // Increase speed on hit for excitement (8% speedup up to 36.0 max speed)
          const speed = Math.min(36.0, Math.abs(state.ballSpeedX) * 1.08);
          state.ballSpeedX = speed;
          state.ballSpeedY = -speed * Math.sin(bounceAngle);
          
          playPaddleHit();
        }

        // Paddle 2 (Right Player) Collision
        const p2X = width - 20 - paddleWidth; // X position of Right Paddle
        if (state.ballSpeedX > 0 && 
            state.ballX + ballSize >= p2X && 
            state.ballX + ballSize <= p2X + paddleWidth &&
            state.ballY + ballSize >= state.p2Y && 
            state.ballY <= state.p2Y + paddleHeight) {
          
          state.ballX = p2X - ballSize;
          // Calculate relative hit position to apply spin/angle variation
          const relativeIntersectY = (state.p2Y + (paddleHeight / 2)) - (state.ballY + (ballSize / 2));
          const normalizedIntersectY = relativeIntersectY / (paddleHeight / 2);
          const bounceAngle = normalizedIntersectY * (Math.PI / 3.5); // max 51 degree bounce

          const speed = Math.min(36.0, Math.abs(state.ballSpeedX) * 1.08);
          state.ballSpeedX = -speed;
          state.ballSpeedY = -speed * Math.sin(bounceAngle);
          
          playPaddleHit();
        }

        // Score Detection
        if (state.ballX < 0) {
          // Player 2 Scores!
          state.p2Score += 1;
          onScoreUpdate(state.p1Score, state.p2Score);
          playScore();
          sendSerialCommand('2'); // Trigger external hardware for P2 score
          
          if (state.p2Score >= 5) {
            state.isFinished = true;
            sendSerialCommand('W'); // Trigger win hardware flash
            onWin('PLAYER 2', state.p1Score, state.p2Score);
          } else {
            resetBall(false);
          }
        } else if (state.ballX > width) {
          // Player 1 Scores!
          state.p1Score += 1;
          onScoreUpdate(state.p1Score, state.p2Score);
          playScore();
          sendSerialCommand('1'); // Trigger external hardware for P1 score
          
          if (state.p1Score >= 5) {
            state.isFinished = true;
            sendSerialCommand('W'); // Trigger win hardware flash
            onWin('PLAYER 1', state.p1Score, state.p2Score);
          } else {
            resetBall(false);
          }
        }
      }
    }

    // 3. RENDER STAGE (Solid 8-bit retro scanline look)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // Grid details (Retro background vertical lines or border) - Vibrant Blue Grid
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.18)';
    ctx.lineWidth = 1;
    for (let x = 40; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 40; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Outer pixel frame border - Neon Gold
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, width - 4, height - 4);

    // Dashed center court line - Neon Gold
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 4;
    ctx.setLineDash([15, 12]);
    ctx.beginPath();
    ctx.moveTo(width / 2, 6);
    ctx.lineTo(width / 2, height - 6);
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash

    // Draw paddles - Player 1 (Glowing Red), Player 2 (Glowing Blue)
    // P1 Paddle (Red)
    ctx.fillStyle = '#ff2400';
    ctx.fillRect(20, state.p1Y, paddleWidth, paddleHeight);
    ctx.shadowColor = '#ff2400';
    ctx.shadowBlur = 12;
    ctx.fillRect(20, state.p1Y, paddleWidth, paddleHeight);
    ctx.shadowBlur = 0; // Reset shadow

    // P2 Paddle (Blue)
    ctx.fillStyle = '#007fff';
    ctx.fillRect(width - 20 - paddleWidth, state.p2Y, paddleWidth, paddleHeight);
    ctx.shadowColor = '#007fff';
    ctx.shadowBlur = 12;
    ctx.fillRect(width - 20 - paddleWidth, state.p2Y, paddleWidth, paddleHeight);
    ctx.shadowBlur = 0; // Reset shadow

    // Draw square ball - Glowing Gold Coin
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(state.ballX, state.ballY, ballSize, ballSize);
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 15;
    ctx.fillRect(state.ballX, state.ballY, ballSize, ballSize);
    ctx.shadowBlur = 0;

    // Draw Score UI - Glowing Gold Coin
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 15;
    ctx.font = '72px "Press Start 2P", "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(state.p1Score.toString(), width / 2 - 80, 100);
    ctx.textAlign = 'left';
    ctx.fillText(state.p2Score.toString(), width / 2 + 80, 100);
    ctx.shadowBlur = 0;

    // Draw Player Names
    ctx.font = '16px "Press Start 2P", "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff2400'; // P1 Red Name
    ctx.fillText(p1Name.toUpperCase(), 50, height - 30);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#007fff'; // P2 Blue Name
    ctx.fillText(p2Name.toUpperCase(), width - 50, height - 30);

    // Ready / Freeze message overlay - Glowing Gold
    if (isPlaying && state.pointCooldown > 0 && !state.isFinished) {
      ctx.font = '28px "Press Start 2P", "Courier New", monospace';
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 15;
      ctx.textAlign = 'center';
      
      const secondsLeft = Math.ceil(state.pointCooldown / 30);
      if (secondsLeft > 1) {
        ctx.fillText(`GET READY...`, width / 2, height / 2 + 150);
      } else {
        ctx.fillText(`SERVE!`, width / 2, height / 2 + 150);
      }
      ctx.shadowBlur = 0;
    }

    // Pause overlay - Blinking Red/Yellow
    if (isPlaying && isPaused && !state.isFinished) {
      ctx.font = '48px "Press Start 2P", "Courier New", monospace';
      ctx.fillStyle = '#ff2400';
      ctx.shadowColor = '#ff2400';
      ctx.shadowBlur = 20;
      ctx.textAlign = 'center';
      ctx.fillText(`PAUSED`, width / 2, height / 2 - 20);
      ctx.shadowBlur = 0;
      
      ctx.font = '20px "Press Start 2P", "Courier New", monospace';
      ctx.fillStyle = '#ffd700';
      ctx.fillText(`PRESS RESUME TO CONTINUE`, width / 2, height / 2 + 50);
    }

    requestRef.current = requestAnimationFrame(gameLoop);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isPlaying, p1Val, p2Val, p1Name, p2Name]);

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
