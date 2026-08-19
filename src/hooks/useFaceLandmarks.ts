import { useEffect, useRef, useState, useCallback } from 'react';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

export interface FaceData {
  landmarks: { x: number; y: number; z: number }[];
  rawSmileMetric: number; // raw value
  calibratedValue: number; // -1 (frown) to +1 (smile)
}

export interface CalibrationData {
  neutral: number;
  smile: number;
  frown: number;
}

// Helper: compute face bounding box width (proxy for face size / distance to camera)
function computeFaceSize(landmarks: { x: number; y: number }[]): number {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const pt of landmarks) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }
  return (maxX - minX) * (maxY - minY); // area in normalized coords
}

export const useFaceLandmarks = () => {
  const [landmarker, setLandmarker] = useState<FaceLandmarker | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [latency, setLatency] = useState(0); // in ms
  const [detectedFaces, setDetectedFaces] = useState<FaceData[]>([]);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const requestRef = useRef<number | null>(null);
  const previousTimeRef = useRef<number>(0);

  // FPS counter — counts only actual detection frames, not animation frames
  const detectionCountRef = useRef<number>(0);
  const lastFpsUpdateRef = useRef<number>(0);

  // Calibration state for 2 players
  const calibrationRef = useRef<[CalibrationData, CalibrationData]>([
    { neutral: 0.0, smile: 0.5, frown: -0.4 }, // P1 default
    { neutral: 0.0, smile: 0.5, frown: -0.4 }  // P2 default
  ]);

  // Stable face assignment: stores last known avgX for each player slot
  // to prevent P1/P2 swapping when faces are close (hysteresis)
  const lastAssignmentRef = useRef<[number, number]>([-1, -1]);

  // ── CROWD INTERFERENCE DEFENSE ──
  // After calibration, we lock onto the face sizes of the two real players.
  // During gameplay, we reject faces whose size differs by >50% from the
  // calibrated size — these are bystanders standing behind the players
  // (their faces appear smaller since they're farther from the camera).
  const lockedFaceSizesRef = useRef<[number, number]>([-1, -1]); // [P1 size, P2 size]
  const isLockedRef = useRef(false);

  // Exponential Moving Average (EMA) smoothing for calibrated values (alpha = 0.35)
  // Eliminates facial jitter while maintaining instant ~120ms response time
  const lastCalibratedValuesRef = useRef<[number, number]>([0, 0]);

  // Last known good face data — used as fallback when a real player's face
  // is temporarily occluded by a bystander
  const lastGoodFacesRef = useRef<FaceData[]>([]);

  // Throttle face detection to ~20fps to free main thread for game loop
  const lastDetectionTimeRef = useRef<number>(0);
  const DETECTION_INTERVAL_MS = 50; // 20fps face detection

  // Load landmarker
  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        setIsLoading(true);
        // Load files locally from public/wasm
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "/wasm"
        );
        
        const landmarkerInstance = await FaceLandmarker.createFromOptions(
          filesetResolver,
          {
            baseOptions: {
              modelAssetPath: "/models/face_landmarker.task",
              delegate: "GPU"
            },
            runningMode: "VIDEO",
            numFaces: 2,
            outputFaceBlendshapes: true
          }
        );
        
        if (active) {
          setLandmarker(landmarkerInstance);
          setIsLoading(false);
        }
      } catch (err: any) {
        console.error("Failed to initialize Face Landmarker", err);
        if (active) {
          setError(`Failed to load face detection model: ${err.message || err}`);
          setIsLoading(false);
        }
      }
    };
    
    init();
    
    return () => {
      active = false;
      if (landmarker) {
        landmarker.close();
      }
    };
  }, []);

  const setCalibration = useCallback((playerIndex: 0 | 1, data: CalibrationData) => {
    calibrationRef.current[playerIndex] = data;
    console.log(`Calibrated Player ${playerIndex + 1}:`, data);
  }, []);

  const getCalibration = useCallback((playerIndex: 0 | 1): CalibrationData => {
    return calibrationRef.current[playerIndex];
  }, []);

  // Call this after calibration completes to lock onto the current faces
  const lockFaces = useCallback(() => {
    // Will be populated on next detection frame
    isLockedRef.current = true;
    lockedFaceSizesRef.current = [-1, -1]; // will be set on next successful 2-face detection
    console.log('Face lock ARMED — will lock on next 2-face detection');
  }, []);

  // Call this to unlock (e.g., when returning to calibration screen)
  const unlockFaces = useCallback(() => {
    isLockedRef.current = false;
    lockedFaceSizesRef.current = [-1, -1];
    lastAssignmentRef.current = [-1, -1];
    lastGoodFacesRef.current = [];
    lastCalibratedValuesRef.current = [0, 0];
    console.log('Face lock RELEASED');
  }, []);

  // Frame detection loop
  const detectFrame = useCallback((time: number) => {
    if (!landmarker || !videoRef.current || videoRef.current.paused || videoRef.current.ended) {
      requestRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    const video = videoRef.current;

    // Throttle face detection to DETECTION_INTERVAL_MS to keep main thread free for game loop
    if (time - lastDetectionTimeRef.current < DETECTION_INTERVAL_MS) {
      requestRef.current = requestAnimationFrame(detectFrame);
      return;
    }
    lastDetectionTimeRef.current = time;

    // FPS counter — counts only actual detection frames (not rAF frames)
    detectionCountRef.current += 1;
    if (time - lastFpsUpdateRef.current >= 1000) {
      setFps(Math.round((detectionCountRef.current * 1000) / (time - lastFpsUpdateRef.current)));
      detectionCountRef.current = 0;
      lastFpsUpdateRef.current = time;
    }

    try {
      const startTime = performance.now();
      
      // Detect landmarks
      const results = landmarker.detectForVideo(video, time);
      
      const endTime = performance.now();
      setLatency(Math.round(endTime - startTime));

      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        // Map detected faces with size information
        let faces = results.faceLandmarks.map((landmarks, faceIdx) => {
          const avgX = landmarks.reduce((sum, pt) => sum + pt.x, 0) / landmarks.length;
          const faceSize = computeFaceSize(landmarks);
          
          // Calculate raw smile metric using MediaPipe Face Blendshapes AI model
          const blendshapes = results.faceBlendshapes?.[faceIdx]?.categories;
          let rawSmileMetric = 0;

          if (blendshapes) {
            const smileLeft = blendshapes.find(c => c.categoryName === 'mouthSmileLeft')?.score || 0;
            const smileRight = blendshapes.find(c => c.categoryName === 'mouthSmileRight')?.score || 0;
            const frownLeft = blendshapes.find(c => c.categoryName === 'mouthFrownLeft')?.score || 0;
            const frownRight = blendshapes.find(c => c.categoryName === 'mouthFrownRight')?.score || 0;
            const pucker = blendshapes.find(c => c.categoryName === 'mouthPucker')?.score || 0;
            const browDownLeft = blendshapes.find(c => c.categoryName === 'browDownLeft')?.score || 0;
            const browDownRight = blendshapes.find(c => c.categoryName === 'browDownRight')?.score || 0;

            const avgSmile = (smileLeft + smileRight) / 2;
            const avgFrown = (frownLeft + frownRight) / 2;
            const avgBrowDown = (browDownLeft + browDownRight) / 2;
            
            // Frown score: highly responsive composite of mouth frown (2.5x), brow lowering (1.5x), and lip pucker (1.0x)
            const frownScore = Math.max(avgFrown * 2.5, avgBrowDown * 1.5, pucker * 1.0);
            rawSmileMetric = avgSmile - frownScore;
          } else {
            // Fallback to geometric calculations
            const lm61 = landmarks[61];
            const lm291 = landmarks[291];
            const lm0 = landmarks[0];
            const lm17 = landmarks[17];
            const lm33 = landmarks[33];
            const lm263 = landmarks[263];
            const mouthCenterY = (lm0.y + lm17.y) / 2;
            const mouthCornersY = (lm61.y + lm291.y) / 2;
            const faceWidth = Math.hypot(lm33.x - lm263.x, lm33.y - lm263.y) || 0.1;
            rawSmileMetric = (mouthCenterY - mouthCornersY) / faceWidth;
          }

          return {
            landmarks,
            avgX,
            faceSize,
            rawSmileMetric,
            calibratedValue: 0
          };
        });

        // ── CROWD INTERFERENCE FILTER ──
        // If face lock is active and we have locked sizes, reject faces that
        // are too small (background bystanders standing behind the players).
        const [lockedSize1, lockedSize2] = lockedFaceSizesRef.current;
        if (isLockedRef.current && lockedSize1 > 0 && lockedSize2 > 0) {
          const avgLockedSize = (lockedSize1 + lockedSize2) / 2;
          const minAcceptableSize = avgLockedSize * 0.45; // faces <45% of player size = bystander
          
          // Keep only faces that are large enough to be a real player
          faces = faces.filter(f => f.faceSize >= minAcceptableSize);
          
          // If all faces got filtered (e.g., both players temporarily occluded),
          // fall back to last known good data
          if (faces.length === 0 && lastGoodFacesRef.current.length > 0) {
            setDetectedFaces(lastGoodFacesRef.current);
            requestRef.current = requestAnimationFrame(detectFrame);
            return;
          }
        }

        // ── FACE LOCKING: Record calibrated face sizes on first 2-face detection ──
        if (isLockedRef.current && lockedSize1 === -1 && faces.length === 2) {
          // Sort by X first to establish P1/P2 order, then lock their sizes
          faces.sort((a, b) => b.avgX - a.avgX);
          lockedFaceSizesRef.current = [faces[0].faceSize, faces[1].faceSize];
          console.log('Face sizes LOCKED:', lockedFaceSizesRef.current);
        }

        // ── STABLE FACE ASSIGNMENT (hysteresis) ──
        const [lastP1X, lastP2X] = lastAssignmentRef.current;
        const firstTime = lastP1X === -1;

        if (faces.length === 2) {
          const [fa, fb] = faces;
          if (firstTime) {
            faces.sort((a, b) => b.avgX - a.avgX);
          } else {
            const swapThreshold = 0.08;
            const naturalP1 = fa.avgX > fb.avgX ? fa : fb;
            const naturalP2 = fa.avgX > fb.avgX ? fb : fa;
            const distToLastP1 = Math.abs(naturalP1.avgX - lastP1X);
            const distToLastP2 = Math.abs(naturalP2.avgX - lastP2X);
            const swappedDistToP1 = Math.abs(naturalP2.avgX - lastP1X);
            const swappedDistToP2 = Math.abs(naturalP1.avgX - lastP2X);

            if (swappedDistToP1 + swappedDistToP2 < distToLastP1 + distToLastP2 - swapThreshold) {
              faces[0] = naturalP2;
              faces[1] = naturalP1;
            } else {
              faces[0] = naturalP1;
              faces[1] = naturalP2;
            }
          }
          lastAssignmentRef.current = [faces[0].avgX, faces[1].avgX];
        } else if (faces.length === 1) {
          lastAssignmentRef.current = [faces[0].avgX, -1];
        }

        // Apply calibration to sorted faces with EMA smoothing
        const calibratedFaces: FaceData[] = faces.map((face, index) => {
          const cal = calibrationRef.current[index] || { neutral: 0.0, smile: 0.5, frown: -0.4 };
          
          let targetValue = 0;
          const raw = face.rawSmileMetric;
          
          // Absolute raw threshold around neutral: within +-0.04 raw units = neutral (0.0)
          const rawDelta = raw - cal.neutral;
          const neutralTolerance = 0.04;
          
          if (Math.abs(rawDelta) <= neutralTolerance) {
            targetValue = 0.0;
          } else if (rawDelta > neutralTolerance) {
            // Smile branch (maps neutral + tolerance .. smile to 0.0 .. 1.0)
            const range = cal.smile - (cal.neutral + neutralTolerance);
            const normalized = range > 0 ? (raw - (cal.neutral + neutralTolerance)) / range : 0;
            targetValue = Math.min(1.0, normalized * 1.45);
          } else {
            // Frown branch (maps frown .. neutral - tolerance to -1.0 .. 0.0)
            const range = (cal.neutral - neutralTolerance) - cal.frown;
            const normalized = range > 0 ? ((cal.neutral - neutralTolerance) - raw) / range : 0;
            targetValue = Math.max(-1.0, -normalized * 1.45);
          }

          // Apply EMA smoothing (alpha = 0.35)
          const prevVal = lastCalibratedValuesRef.current[index] || 0;
          const alpha = 0.35;
          const smoothedValue = prevVal + (targetValue - prevVal) * alpha;
          lastCalibratedValuesRef.current[index] = smoothedValue;

          return {
            landmarks: face.landmarks,
            rawSmileMetric: face.rawSmileMetric,
            calibratedValue: smoothedValue
          };
        });

        // Store as last known good data for fallback
        lastGoodFacesRef.current = calibratedFaces;
        setDetectedFaces(calibratedFaces);
      } else {
        // No faces detected — use last good data if locked, otherwise clear
        if (isLockedRef.current && lastGoodFacesRef.current.length > 0) {
          setDetectedFaces(lastGoodFacesRef.current);
        } else {
          setDetectedFaces([]);
        }
      }
    } catch (err) {
      console.error("Error in face tracking frame processing:", err);
    }

    requestRef.current = requestAnimationFrame(detectFrame);
  }, [landmarker]);

  // Start webcam and hook video element
  const startTracking = useCallback((videoElement: HTMLVideoElement) => {
    videoRef.current = videoElement;
    
    // Apply digital exposure gain filter to video element so MediaPipe receives bright, high-contrast frames in dark venue lighting
    videoElement.style.filter = 'brightness(1.25) contrast(1.15)';
    
    navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user',
        frameRate: { ideal: 30, min: 15 }
      },
      audio: false
    })
    .then((stream) => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          previousTimeRef.current = performance.now();
          lastFpsUpdateRef.current = performance.now();
          requestRef.current = requestAnimationFrame(detectFrame);
        };
      }
    })
    .catch((err) => {
      console.error("Camera access failed:", err);
      setError(`Camera access failed: ${err.message || err}. Please ensure webcam permissions are granted.`);
    });
  }, [detectFrame]);

  // Stop webcam
  const stopTracking = useCallback(() => {
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }
    
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  return {
    isLoading,
    error,
    fps,
    latency,
    detectedFaces,
    startTracking,
    stopTracking,
    setCalibration,
    getCalibration,
    lockFaces,
    unlockFaces
  };
};
