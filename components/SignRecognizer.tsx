/**
 * SignRecognizer — Camera-based ASL sign recognition using MediaPipe.
 *
 * Extracts hand + pose landmarks from the front camera via MediaPipe
 * HandLandmarker + PoseLandmarker, then:
 *   1. Detects head gestures (nod/shake) from pose landmarks
 *   2. Future: feeds landmarks to TFLite sign classifier (Phase 2b)
 *   3. Falls back to Gemini Vision for unrecognized signs
 *
 * Designed to run as an overlay within the homeowner view of
 * DeafCommunicationPanel. The camera feed is shown small in a corner
 * while landmarks are processed in the background.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, CameraOff, Hand, X } from 'lucide-react';
import {
  detectHeadGesture,
  geminiSignFallback,
  captureFrameAsBase64,
  type LandmarkFrame,
  type HeadGestureResult,
  type SignRecognitionResult,
} from '../services/signLanguageService';
import { env } from '../src/config/env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SignRecognizerProps {
  /** Called when a sign or gesture is recognized */
  onSignDetected: (result: SignRecognitionResult) => void;
  /** Called when a head gesture is detected */
  onHeadGesture: (gesture: HeadGestureResult) => void;
  /** Whether the recognizer is active */
  isActive: boolean;
  /** Called when user toggles camera on/off */
  onToggle: (active: boolean) => void;
}

type RecognizerState = 'off' | 'initializing' | 'running' | 'error';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SignRecognizer: React.FC<SignRecognizerProps> = ({
  onSignDetected,
  onHeadGesture,
  isActive,
  onToggle,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const landmarkBufferRef = useRef<LandmarkFrame[]>([]);
  const lastGestureRef = useRef<string>('none');
  const lastGestureTimeRef = useRef<number>(0);
  const geminiCooldownRef = useRef<number>(0);

  const [state, setState] = useState<RecognizerState>('off');
  const [error, setError] = useState<string | null>(null);
  const [lastDetected, setLastDetected] = useState<string | null>(null);
  const [gestureIndicator, setGestureIndicator] = useState<string | null>(null);

  // MediaPipe refs
  const handLandmarkerRef = useRef<any>(null);
  const poseLandmarkerRef = useRef<any>(null);

  // -----------------------------------------------------------------------
  // Initialize MediaPipe
  // -----------------------------------------------------------------------

  const initMediaPipe = useCallback(async () => {
    try {
      setState('initializing');
      setError(null);

      const vision = await import('@mediapipe/tasks-vision');
      const { HandLandmarker, PoseLandmarker, FilesetResolver } = vision;

      // Load WASM files from CDN
      const wasmFileset = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm'
      );

      // Initialize hand landmarker (21 landmarks per hand)
      handLandmarkerRef.current = await HandLandmarker.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      // Initialize pose landmarker (33 body landmarks)
      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      console.log('[SignRecognizer] MediaPipe initialized');
      return true;
    } catch (err) {
      console.error('[SignRecognizer] MediaPipe init error:', err);
      setError('Could not load sign recognition models');
      setState('error');
      return false;
    }
  }, []);

  // -----------------------------------------------------------------------
  // Start camera
  // -----------------------------------------------------------------------

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      return true;
    } catch (err) {
      console.error('[SignRecognizer] Camera error:', err);
      setError('Camera access denied');
      setState('error');
      return false;
    }
  }, []);

  // -----------------------------------------------------------------------
  // Processing loop
  // -----------------------------------------------------------------------

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const timestamp = performance.now();

    try {
      // Run pose detection for head gestures
      if (poseLandmarkerRef.current) {
        const poseResult = poseLandmarkerRef.current.detectForVideo(video, timestamp);

        if (poseResult?.landmarks?.[0]) {
          const poseLandmarks = poseResult.landmarks[0].map((lm: any) => [lm.x, lm.y, lm.z]);

          // Add to buffer for gesture detection
          landmarkBufferRef.current.push({
            timestamp,
            landmarks: poseLandmarks,
          });

          // Keep only last 60 frames (~2 seconds)
          if (landmarkBufferRef.current.length > 60) {
            landmarkBufferRef.current = landmarkBufferRef.current.slice(-60);
          }

          // Detect head gestures every 10 frames
          if (landmarkBufferRef.current.length % 10 === 0 && landmarkBufferRef.current.length >= 15) {
            const gesture = detectHeadGesture(landmarkBufferRef.current);

            if (
              gesture.gesture !== 'none' &&
              gesture.confidence > 0.6 &&
              (gesture.gesture !== lastGestureRef.current || timestamp - lastGestureTimeRef.current > 2000)
            ) {
              lastGestureRef.current = gesture.gesture;
              lastGestureTimeRef.current = timestamp;
              onHeadGesture(gesture);

              // Show brief indicator
              setGestureIndicator(gesture.gesture === 'nod' ? 'Yes (nod)' : 'No (shake)');
              setTimeout(() => setGestureIndicator(null), 2000);
            }
          }
        }
      }

      // Run hand detection
      if (handLandmarkerRef.current) {
        const handResult = handLandmarkerRef.current.detectForVideo(video, timestamp);

        if (handResult?.landmarks?.length > 0) {
          // Hands detected — in the future, feed to TFLite sign classifier
          // For now, track that hands are visible (for UI feedback)
          const handCount = handResult.landmarks.length;

          // Draw hand landmarks on overlay canvas (optional visual feedback)
          drawHandLandmarks(handResult.landmarks);

          // Gemini fallback: every 3 seconds, if hands are visible, try Gemini
          const apiKey = import.meta.env.VITE_GOOGLE_AI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY;
          if (apiKey && timestamp - geminiCooldownRef.current > 3000) {
            geminiCooldownRef.current = timestamp;

            const frame = captureFrameAsBase64(video, 0.6);
            if (frame) {
              // Fire and forget — don't block the frame loop
              geminiSignFallback(frame, apiKey).then(result => {
                if (result && result.confidence > 0.7) {
                  setLastDetected(result.sign);
                  onSignDetected(result);
                  setTimeout(() => setLastDetected(null), 3000);
                }
              });
            }
          }
        }
      }
    } catch (err) {
      // Don't crash the loop on individual frame errors
      console.warn('[SignRecognizer] Frame error:', err);
    }

    animFrameRef.current = requestAnimationFrame(processFrame);
  }, [onHeadGesture, onSignDetected]);

  // -----------------------------------------------------------------------
  // Draw hand landmarks (visual feedback)
  // -----------------------------------------------------------------------

  const drawHandLandmarks = (handsLandmarks: any[][]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw connection lines and points for each hand
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],       // thumb
      [0, 5], [5, 6], [6, 7], [7, 8],       // index
      [0, 9], [9, 10], [10, 11], [11, 12],  // middle
      [0, 13], [13, 14], [14, 15], [15, 16],// ring
      [0, 17], [17, 18], [18, 19], [19, 20],// pinky
      [5, 9], [9, 13], [13, 17],             // palm
    ];

    for (const landmarks of handsLandmarks) {
      // Draw connections
      ctx.strokeStyle = 'rgba(182, 8, 7, 0.7)';
      ctx.lineWidth = 2;
      for (const [start, end] of connections) {
        const s = landmarks[start];
        const e = landmarks[end];
        if (!s || !e) continue;
        ctx.beginPath();
        ctx.moveTo(s.x * canvas.width, s.y * canvas.height);
        ctx.lineTo(e.x * canvas.width, e.y * canvas.height);
        ctx.stroke();
      }

      // Draw points
      ctx.fillStyle = '#fff';
      for (const lm of landmarks) {
        ctx.beginPath();
        ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (isActive && state === 'off') {
      (async () => {
        const mpReady = await initMediaPipe();
        if (!mpReady) return;

        const camReady = await startCamera();
        if (!camReady) return;

        setState('running');
        animFrameRef.current = requestAnimationFrame(processFrame);
      })();
    }

    if (!isActive && state === 'running') {
      cleanup();
    }

    return () => {
      if (!isActive) cleanup();
    };
  }, [isActive]);

  const cleanup = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    landmarkBufferRef.current = [];
    lastGestureRef.current = 'none';
    setState('off');
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  // Toggle button (when camera is off)
  if (!isActive) {
    return (
      <button
        onClick={() => onToggle(true)}
        aria-label="Start sign language camera"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '14px 20px',
          borderRadius: '12px',
          border: '2px solid rgba(182, 8, 7, 0.5)',
          background: 'rgba(182, 8, 7, 0.1)',
          color: '#fff',
          fontSize: '15px',
          fontWeight: 600,
          cursor: 'pointer',
          width: '100%',
        }}
      >
        <Hand className="w-5 h-5" />
        Sign Language Mode
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '2px solid rgba(182, 8, 7, 0.4)',
        background: '#000',
      }}
    >
      {/* Camera preview */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3' }}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)', // Mirror for selfie camera
          }}
        />

        {/* Landmark overlay */}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            transform: 'scaleX(-1)',
            pointerEvents: 'none',
          }}
        />

        {/* Status badges */}
        <div
          style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            display: 'flex',
            gap: '6px',
          }}
        >
          {state === 'initializing' && (
            <span
              style={{
                background: 'rgba(234, 179, 8, 0.8)',
                color: '#000',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              Loading models...
            </span>
          )}

          {state === 'running' && (
            <span
              style={{
                background: 'rgba(34, 197, 94, 0.8)',
                color: '#000',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#000',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
              Watching
            </span>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={() => onToggle(false)}
          aria-label="Stop sign language camera"
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: 'rgba(0,0,0,0.6)',
            border: 'none',
            borderRadius: '50%',
            padding: '6px',
            cursor: 'pointer',
            color: '#fff',
          }}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Detected sign overlay */}
        {lastDetected && (
          <div
            style={{
              position: 'absolute',
              bottom: '8px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(182, 8, 7, 0.9)',
              color: '#fff',
              padding: '8px 20px',
              borderRadius: '20px',
              fontSize: '18px',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            {lastDetected}
          </div>
        )}

        {/* Head gesture indicator */}
        {gestureIndicator && (
          <div
            style={{
              position: 'absolute',
              top: '8px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: gestureIndicator.startsWith('Yes')
                ? 'rgba(34, 197, 94, 0.9)'
                : 'rgba(239, 68, 68, 0.9)',
              color: '#fff',
              padding: '6px 16px',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            {gestureIndicator}
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div
          style={{
            padding: '12px',
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444',
            fontSize: '13px',
            textAlign: 'center',
          }}
        >
          {error}
          <button
            onClick={() => {
              setError(null);
              onToggle(false);
              setTimeout(() => onToggle(true), 100);
            }}
            style={{
              display: 'block',
              margin: '8px auto 0',
              padding: '6px 16px',
              borderRadius: '6px',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              background: 'transparent',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Inline CSS animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
};

export default SignRecognizer;
