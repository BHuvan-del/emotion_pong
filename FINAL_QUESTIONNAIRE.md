# Emotion Pong — Final Technical Questionnaire & Knowledge Base

---

## 🎯 Section A: AI, Computer Vision & Facial Inference

### Q1: How does the computer detect smiles and frowns in real time without a GPU server?
**Answer:**
We use Google’s **MediaPipe `FaceLandmarker` AI model** running 100% locally in the browser via **WebAssembly (WASM)** and WebGPU delegates. It tracks 468 3D facial coordinates and outputs **52 blendshape score categories**. We combine `mouthSmileLeft` + `mouthSmileRight` and subtract a composite score of frown metrics (`mouthFrown`, `mouthPucker`, `browDown`) to derive a normalized raw metric from `-1.0` (max frown) to `+1.0` (max smile).

---

### Q2: How does the system handle facial twitches, flickering venue lights, or camera noise?
**Answer:**
We apply a two-stage filtering pipeline:
1. **12% Neutral Dead-Zone**: Small mouth movements around a player's resting expression are ignored so normal breathing or talking doesn't move the paddle.
2. **Exponential Moving Average (EMA) Filter ($\alpha = 0.35$)**: We blend current expression values with past frames (`smoothedVal = prevVal + (targetVal - prevVal) * 0.35`). This eliminates micro-jumps and twitches while keeping paddle reaction time instantaneous ($\approx 120\text{ ms}$).

---

### Q3: How does calibration work for different face shapes and expressions?
**Answer:**
Before playing, players complete an automated **3-step calibration** (`Neutral` ➔ `Smile` ➔ `Frown`). The app records each player's individual baseline metrics. This normalizes expressions so a subtle smile or intense smile maps accurately from `0.0` (center of screen) to `+1.0` (top of screen).

---

## 🛡️ Section B: Crowd Defense & Environmental Robustness

### Q4: In a crowded stall, what stops background bystanders from hijacking the paddles?
**Answer:**
We built a multi-tier **Crowd Interference Defense**:
1. **Face-Size Locking (`lockFaces()`)**: Right after calibration, the app calculates the bounding-box surface area of the two active players.
2. **Bystander Rejection ($<45\%$ Area Threshold)**: Any newly detected face whose bounding-box area is $<45\%$ of the calibrated baseline is classified as a distant person standing behind the players and filtered out.
3. **Position Hysteresis**: If players lean close, position hysteresis locks their identity slots to prevent P1 and P2 from swapping paddles.
4. **Last-Good-State Fallback**: If a player is briefly covered, the system re-uses the last known valid face coordinates so paddles don't freeze or jump.

---

### Q5: How does the camera work if the stall or venue gets dim or dark?
**Answer:**
We implemented **Low-Light Camera Optimization**:
1. **Hardware Constraints**: Requests dynamic auto-exposure and frame-rate boundaries (`frameRate: { ideal: 30, min: 15 }`).
2. **Digital Exposure Gain Filter**: We apply a digital enhancement filter (`brightness(1.25) contrast(1.15)`) onto the video stream fed into MediaPipe. This brightens facial features and sharpens edge contrast before landmark extraction, maintaining high tracking accuracy in dim room lighting.

---

## ⚡ Section C: Game Engine, Physics & Performance

### Q6: What prevents fast balls from passing directly through paddles ("tunneling")?
**Answer:**
At high velocities ($>30\text{ px/frame}$), a ball can skip past an $18\text{px}$-wide paddle in a single frame. We prevent this using **Continuous Collision Detection (CCD)** with dynamic micro sub-stepping:
$$\text{steps} = \max\left(1, \left\lceil \frac{|\text{ballSpeedX}|}{\text{paddleWidth}} \right\rceil\right)$$
The physics loop splits movement into sub-pixel steps per frame, checking wall and paddle boundaries at each step so tunneling is physically impossible.

---

### Q7: How do you maintain a locked 60 FPS render loop while running heavy AI models?
**Answer:**
1. **Decoupled AI Loop**: AI inference runs on a separate 20 FPS (50 ms) cycle, freeing 67% of main-thread execution time for rendering.
2. **Ref-based Game Loop**: Fast-changing positions are stored in React `useRef` objects rather than React State, allowing `requestAnimationFrame` to run in a single unbroken 60 FPS loop without triggering React component re-renders.
3. **Offscreen Canvas Blitting**: Static background grids are pre-rendered once onto a hidden offscreen canvas and copied in a single `ctx.drawImage()` GPU call per frame.
4. **Eliminated `shadowBlur`**: Replaced GPU-heavy canvas Gaussian blurs with crisp 2px stroked outlines.

---

## 🗄️ Section D: Lead Capture, Backend & UX Flow

### Q8: How does lead registration work, and what happens if the backend database goes offline?
**Answer:**
Player details are submitted via a Node.js + Express REST API to an SQLite database (`leads.db`).
* **10-Digit Contact Validation**: Form inputs enforce strict 10-digit validation with real-time UI warning counters (`(X/10)`).
* **Instant Fail-Safe Fallback**: API requests include a 1.5-second timeout (`AbortSignal.timeout(1500)`). If `server.js` is offline, the app switches to local arcade mode in under 1.5 seconds without crashing or freezing.

---

### Q9: How does Single-Player AI Mode work?
**Answer:**
If a solo visitor registers without a Player 2, the app assigns P2 to **"COMPUTER"**. The right paddle automatically tracks the ball's Y-coordinate using lagged smooth interpolation (`0.14` lerp factor), creating a fun, beatable AI opponent for solo play.

---

### Q10: How are retro arcade sound effects generated without external audio files?
**Answer:**
We use procedural audio synthesized in real time via the browser's **Web Audio API**. Square wave oscillators produce retro 8-bit paddle bounces and scoring chimes, while triangle wave oscillators synthesize ambient retro background rhythms without loading external MP3/WAV files.
