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
  const frameCountRef = useRef<number>(0);
  const lastFpsUpdateRef = useRef<number>(0);

  // Calibration state for 2 players
  const calibrationRef = useRef<[CalibrationData, CalibrationData]>([
    { neutral: 0.0, smile: 0.5, frown: -0.4 }, // P1 default
    { neutral: 0.0, smile: 0.5, frown: -0.4 }  // P2 default
  ]);

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

  // Frame detection loop
  const detectFrame = useCallback((time: number) => {
    if (!landmarker || !videoRef.current || videoRef.current.paused || videoRef.current.ended) {
      requestRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    const video = videoRef.current;
    
    // FPS tracking
    frameCountRef.current += 1;
    if (time - lastFpsUpdateRef.current >= 1000) {
      setFps(Math.round((frameCountRef.current * 1000) / (time - lastFpsUpdateRef.current)));
      frameCountRef.current = 0;
      lastFpsUpdateRef.current = time;
    }

    try {
      const startTime = performance.now();
      
      // Detect landmarks
      const results = landmarker.detectForVideo(video, time);
      
      const endTime = performance.now();
      setLatency(Math.round(endTime - startTime));

      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        // Map detected faces
        const faces = results.faceLandmarks.map((landmarks, faceIdx) => {
          // Calculate average X coordinate for sorting (Left to Right)
          const avgX = landmarks.reduce((sum, pt) => sum + pt.x, 0) / landmarks.length;
          
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
            
            // Frown score combines physical frowns, brow furrowing, and lip pursing (pucker)
            // Tuned: frown * 1.3 for sharper frown detection, pucker * 0.8 to quickly override smiles
            const frownScore = Math.max(avgFrown * 1.3, pucker * 0.8, avgBrowDown * 0.6);
            
            // Range is roughly [-1.0, +1.0]
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
            rawSmileMetric,
            calibratedValue: 0 // Will calibrate below after sorting
          };
        });

        // Sort faces descending by raw X to map mirrored screen-left to Player 1
        faces.sort((a, b) => b.avgX - a.avgX);

        // Apply calibration to sorted faces
        const calibratedFaces = faces.map((face, index) => {
          const cal = calibrationRef.current[index] || { neutral: 0.0, smile: 0.5, frown: -0.4 };
          
          let calibratedValue = 0;
          const raw = face.rawSmileMetric;
          
          const deadZone = 0.12; // 12% dead-zone around neutral to filter out minor twitches
          
          if (raw >= cal.neutral) {
            // Smile side (maps neutral..smile to 0..1)
            const range = cal.smile - cal.neutral;
            const rawNormalized = range > 0 ? (raw - cal.neutral) / range : 0;
            if (rawNormalized > deadZone) {
              const scaled = (rawNormalized - deadZone) / (1 - deadZone);
              calibratedValue = Math.min(1.0, scaled * 1.15); // Smoothly ramp up with stable 1.15x multiplier
            } else {
              calibratedValue = 0.0;
            }
          } else {
            // Frown side (maps frown..neutral to -1..0)
            const range = cal.neutral - cal.frown;
            const rawNormalized = range > 0 ? (raw - cal.neutral) / range : 0; // Negative value
            if (rawNormalized < -deadZone) {
              const scaled = (rawNormalized + deadZone) / (1 - deadZone);
              calibratedValue = Math.max(-1.0, scaled * 1.15); // Smoothly ramp down
            } else {
              calibratedValue = 0.0;
            }
          }

          return {
            landmarks: face.landmarks,
            rawSmileMetric: face.rawSmileMetric,
            calibratedValue
          };
        });

        setDetectedFaces(calibratedFaces);
      } else {
        setDetectedFaces([]);
      }
    } catch (err) {
      console.error("Error in face tracking frame processing:", err);
    }

    requestRef.current = requestAnimationFrame(detectFrame);
  }, [landmarker]);

  // Start webcam and hook video element
  const startTracking = useCallback((videoElement: HTMLVideoElement) => {
    videoRef.current = videoElement;
    
    navigator.mediaDevices.getUserMedia({
      video: {
        width: 640,
        height: 480,
        facingMode: 'user'
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
    getCalibration
  };
};
