# Emotion Pong — Project Brief, 1-Minute Pitch & Technical Q&A

---

## Part 1: Project Brief (Internal Team & Colleagues)

### Executive Summary
**Emotion Pong** is an interactive, real-time AI-powered arcade Pong cabinet developed for the **IETE (Institution of Electronics and Telecommunication Engineers)** stall. Instead of using traditional physical joysticks or keyboards, players control their paddle height using **real-time facial expressions** (smiles and frowns/furrows) detected via a standard webcam.

It serves as both a high-engagement event attraction and a live demonstration of browser-native Computer Vision, WebAssembly AI inference, real-time Canvas graphics, and Web-Hardware integration.

---

### Key Technical Architecture

```
                       ┌─────────────────────────┐
                       │   Webcam Video Stream   │
                       └────────────┬────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────────┐
                     │ MediaPipe FaceLandmarker GPU │
                     │   (468 3D Facial Mesh)       │
                     └──────────────┬───────────────┘
                                    │
                                    ▼
             ┌──────────────────────────────────────────────┐
             │ Blendshape Metric & Calibration Engine       │
             │ (Smile vs Frown, Dead-zone, Lerp 0.30)      │
             └──────────────────────┬───────────────────────┘
                                    │
                                    ▼
             ┌──────────────────────────────────────────────┐
             │ Custom Canvas Game Engine (1200x675 @ 60 FPS)│
             │  • Continuous Collision Detection (CCD)     │
             │  • Offscreen Canvas Background Blitting     │
             │  • Bounding-Box Crowd Defense Filtering      │
             └──────┬───────────────────────┬───────────────┘
                    │                       │
                    ▼                       ▼
      ┌──────────────────────────┐  ┌──────────────────────────┐
      │ SQLite & Express Backend │  │ Web Serial Hardware Port │
      │ (Stall Lead Capture API) │  │  (Arcade Flash Signals)  │
      └──────────────────────────┘  └──────────────────────────┘
```

---

### Core System Breakdown

1. **Computer Vision & Facial Inference**:
   - **Engine**: Google MediaPipe `FaceLandmarker` (`@mediapipe/tasks-vision`) loaded locally via WebAssembly / GPU delegates.
   - **Tracking**: Detects 468 3D facial landmarks and 52 blendshape metrics.
   - **Expression Score**: Combines `mouthSmileLeft` & `mouthSmileRight` minus a weighted composite of frown metrics (`mouthFrown`, `mouthPucker`, `browDown`).
   - **Throttling**: Inference is decoupled from rendering and throttled to 20 FPS (50 ms intervals) to save CPU/GPU overhead for the 60 FPS game loop.

2. **Automated 3-Step Calibration & Crowd Defense**:
   - **Calibration**: 3-second interactive capture of `Neutral`, `Smile`, and `Frown` baselines per player with dead-zone mapping (`0.12`).
   - **Bystander Protection**: Post-calibration, `lockFaces()` anchors the baseline face bounding-box areas. Distant crowd members with face areas `< 45%` of the calibrated baseline are filtered out dynamically.

3. **High-Performance Physics Engine**:
   - **Continuous Collision Detection (CCD)**: Movement is divided into micro sub-steps (`steps = Math.max(1, Math.ceil(speed / paddleWidth))`) preventing ball "tunneling" at ultra-high speeds (`> 36 px/frame`).
   - **Physics Continuity**: Speed accelerates dynamically during rallies (`1.14x` per bounce) and carries over across points.
   - **Graphics Optimization**: Static background grids are pre-rendered once on an offscreen canvas and blitted per frame. `shadowBlur` is stripped from heavy elements to avoid GPU frame drops.

4. **Hardware & Backend Lead Capture**:
   - **Lead Database**: Express REST API + SQLite (`leads.db`) recording player names and contact numbers.
   - **Serial Arcade Integration**: Web Serial API sends signal pulses (`'1'`, `'2'`, `'W'`) to hardware microcontrollers (e.g. Arduino / ESP32) for physical lights and arcade responses.

---

## Part 2: The 1-Minute Pitch (For Freshers & Stall Visitors)

> **"Hey everyone! Welcome to the IETE stall!**
>
> Have you ever played classic Pong? Now imagine playing it **without touching a single button, joystick, or key**.
>
> Welcome to **Emotion Pong** — an AI-powered retro arcade game where **your face is the controller!** 
>
> Here’s how it works: Our webcam tracks 468 points on your face in real-time using Google MediaPipe AI running straight in your browser. When you **smile**, your paddle glides up. When you **frown or furrow your brow**, your paddle slides down!
>
> We perform a quick 5-second calibration for your unique facial expressions, and then it’s game on — Player 1 vs Player 2, or Player 1 vs our adaptive AI bot.
>
> Under the hood, it’s built with **React, TypeScript, WebAssembly, and custom physics** running at 60 frames per second with hardware light triggers!
>
> Want to test your facial flexes and get on our live leaderboard? Step right up and let’s calibrate!"

---

## Part 3: Deep Technical Questionnaire (For Freshers & Interviews)

### Q1: How does the computer know if I'm smiling or frowning?
**Answer:**
We use Google’s MediaPipe `FaceLandmarker` model running locally in the browser via WebAssembly (WASM). It identifies 468 3D coordinates on your face and outputs **52 blendshape category scores** (ranging from 0.0 to 1.0). We combine the left and right mouth smile scores and subtract a composite score of `mouthFrown`, `mouthPucker` (lip pursing), and `browDown` (furrowing) to compute a single normalized expression value from `-1.0` (max frown) to `+1.0` (max smile).

---

### Q2: Why is calibration necessary before playing?
**Answer:**
Everyone’s facial anatomy is unique! A natural resting face for one person might look like a slight smile or frown to an AI model. During our 3-step calibration (`Neutral` ➔ `Smile` ➔ `Frown`), we record your personal baseline metrics. We map your neutral state to 0.0 (center of screen) with a 12% dead-zone to prevent paddle jitter from minor facial twitches.

---

### Q3: What happens when people stand behind the players in a crowded room? Doesn't the camera get confused?
**Answer:**
We implemented a multi-stage **Crowd Interference Filter**:
1. **Face-Size Locking (`lockFaces()`)**: After calibration, the app calculates the bounding-box surface area of the two primary players.
2. **Distance Filtering**: During the game, any newly detected face whose area is `< 45%` of the calibrated baseline is classified as a distant bystander and filtered out.
3. **Identity Hysteresis**: If two faces get close, position hysteresis prevents Player 1 and Player 2 from rapidly swapping paddles between frames.
4. **Last-Good-State Fallback**: If a player is briefly covered or steps out, the system uses the last known valid face data so the paddle glides smoothly instead of freezing or jumping.

---

### Q4: When the ball gets super fast, how do you stop it from passing through the paddle ("tunneling")?
**Answer:**
In simple games, if the ball speed is 40 pixels per frame and the paddle width is 18 pixels, the ball can skip completely over the paddle in a single frame. This is called **tunneling**. 
We solved this using **Continuous Collision Detection (CCD)** with sub-stepping:
```typescript
const steps = Math.max(1, Math.ceil(Math.abs(ballSpeedX) / paddleWidth));
```
We divide the ball's movement into micro-steps per frame, moving and checking collisions at pixel-level boundaries so the ball can never bypass a paddle regardless of speed.

---

### Q5: How do you keep the game running smoothly at 60 FPS while running heavy AI models?
**Answer:**
We applied several key performance optimization strategies:
1. **Decoupled AI Inference**: AI face detection is throttled to 20 FPS (50ms interval), which is more than enough for human reaction times, leaving 67% of main-thread execution time for rendering.
2. **Ref-based Game Loop**: React state updates can tear down and recreate animation loops. We store fast-changing positions in React `useRef` objects so `requestAnimationFrame` runs in a single, unbroken 60 FPS loop without React re-renders.
3. **Offscreen Canvas Blitting**: The retro background grid and border are rendered once onto a hidden offscreen canvas and copied in 1 GPU call per frame using `ctx.drawImage()`.
4. **Eliminated `shadowBlur`**: Canvas Gaussian `shadowBlur` forces the GPU to blur millions of pixels every frame. Replacing paddle glows with crisp 2px stroked outlines eliminated GPU bottlenecking.

---

### Q6: How does the game communicate with external hardware like arcade lights?
**Answer:**
We use the **Web Serial API** built into modern browsers. When events happen in the JavaScript game loop (e.g. P1 scores, P2 scores, or game win), `sendSerialCommand()` writes single-byte ASCII characters (`'1'`, `'2'`, `'W'`) over a USB serial connection to an Arduino or ESP32 microcontroller, which triggers physical LED strips or arcade strobe lights.

---

### Q7: What technology stack was used to build this project?
**Answer:**
- **Frontend Framework**: React 19 + TypeScript + Vite
- **Styling**: TailwindCSS v4 + Custom Retro Arcade CSS Design System
- **AI & Vision**: MediaPipe Vision WASM / WebGPU Delegates
- **Audio**: Custom Web Audio API Synthesizers (procedural 8-bit square/triangle waves)
- **Backend & Database**: Node.js + Express + SQLite3 (`leads.db`)
- **Hardware Protocol**: Web Serial API
