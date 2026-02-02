/**
 * Voice Activity Detection Utility using Silero VAD
 * Provides accurate end-of-speech detection for Agnes-21
 */

import { MicVAD, RealTimeVADOptions } from '@ricky0123/vad-web';

export interface VADCallbacks {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
  onVADMisfire?: () => void;
}

export interface VADConfig {
  /** Threshold for positive speech detection (0-1, default: 0.8) */
  positiveSpeechThreshold?: number;
  /** Threshold for negative speech detection (0-1, default: 0.3) */
  negativeSpeechThreshold?: number;
  /** Number of frames to wait before considering speech ended (default: 8) */
  redemptionFrames?: number;
  /** Minimum number of frames to consider as speech (default: 3) */
  minSpeechFrames?: number;
  /** Number of frames to pad before speech (default: 1) */
  preSpeechPadFrames?: number;
}

// Default VAD configuration optimized for conversation
const DEFAULT_CONFIG: VADConfig = {
  positiveSpeechThreshold: 0.8,
  negativeSpeechThreshold: 0.35,
  redemptionFrames: 8,
  minSpeechFrames: 3,
  preSpeechPadFrames: 1,
};

let vadInstance: MicVAD | null = null;
let isVADRunning = false;

/**
 * Create and start a new VAD instance
 */
export const createVAD = async (
  callbacks: VADCallbacks,
  config: VADConfig = {}
): Promise<MicVAD> => {
  // Stop existing instance if running
  if (vadInstance && isVADRunning) {
    await stopVAD();
  }

  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  try {
    vadInstance = await MicVAD.new({
      positiveSpeechThreshold: mergedConfig.positiveSpeechThreshold,
      negativeSpeechThreshold: mergedConfig.negativeSpeechThreshold,
      redemptionFrames: mergedConfig.redemptionFrames,
      minSpeechFrames: mergedConfig.minSpeechFrames,
      preSpeechPadFrames: mergedConfig.preSpeechPadFrames,
      onSpeechStart: () => {
        console.log('[VAD] Speech started');
        callbacks.onSpeechStart?.();
      },
      onSpeechEnd: (audio: Float32Array) => {
        console.log('[VAD] Speech ended, audio length:', audio.length);
        callbacks.onSpeechEnd?.(audio);
      },
      onVADMisfire: () => {
        console.log('[VAD] Misfire detected');
        callbacks.onVADMisfire?.();
      },
    });

    return vadInstance;
  } catch (error) {
    console.error('[VAD] Failed to create VAD instance:', error);
    throw error;
  }
};

/**
 * Start the VAD listening
 */
export const startVAD = async (): Promise<void> => {
  if (!vadInstance) {
    throw new Error('VAD not initialized. Call createVAD first.');
  }

  if (isVADRunning) {
    console.log('[VAD] Already running');
    return;
  }

  try {
    vadInstance.start();
    isVADRunning = true;
    console.log('[VAD] Started listening');
  } catch (error) {
    console.error('[VAD] Failed to start:', error);
    throw error;
  }
};

/**
 * Pause the VAD (keeps instance alive)
 */
export const pauseVAD = (): void => {
  if (vadInstance && isVADRunning) {
    vadInstance.pause();
    isVADRunning = false;
    console.log('[VAD] Paused');
  }
};

/**
 * Stop and destroy the VAD instance
 */
export const stopVAD = async (): Promise<void> => {
  if (vadInstance) {
    try {
      vadInstance.pause();
      vadInstance.destroy();
      vadInstance = null;
      isVADRunning = false;
      console.log('[VAD] Stopped and destroyed');
    } catch (error) {
      console.error('[VAD] Error stopping:', error);
      vadInstance = null;
      isVADRunning = false;
    }
  }
};

/**
 * Check if VAD is currently running
 */
export const isVADActive = (): boolean => {
  return isVADRunning && vadInstance !== null;
};

/**
 * Get the current VAD instance (if exists)
 */
export const getVADInstance = (): MicVAD | null => {
  return vadInstance;
};

/**
 * Voice activity detection with timeout
 * Returns true when speech is detected and ends, or false on timeout
 */
export const detectSpeechWithTimeout = async (
  callbacks: VADCallbacks,
  timeoutMs: number = 30000,
  config: VADConfig = {}
): Promise<{ detected: boolean; audio?: Float32Array }> => {
  return new Promise(async (resolve) => {
    let speechDetected = false;
    let timeoutId: NodeJS.Timeout;

    const wrappedCallbacks: VADCallbacks = {
      onSpeechStart: () => {
        speechDetected = true;
        callbacks.onSpeechStart?.();
      },
      onSpeechEnd: (audio) => {
        clearTimeout(timeoutId);
        callbacks.onSpeechEnd?.(audio);
        stopVAD().then(() => {
          resolve({ detected: true, audio });
        });
      },
      onVADMisfire: callbacks.onVADMisfire,
    };

    try {
      await createVAD(wrappedCallbacks, config);
      await startVAD();

      timeoutId = setTimeout(async () => {
        console.log('[VAD] Timeout reached');
        await stopVAD();
        resolve({ detected: speechDetected });
      }, timeoutMs);
    } catch (error) {
      console.error('[VAD] Detection error:', error);
      resolve({ detected: false });
    }
  });
};

/**
 * Simple speech activity checker using frequency analysis (fallback)
 * Used when Silero VAD is not available
 */
export const createFallbackVAD = (
  analyser: AnalyserNode,
  config: {
    threshold?: number;
    silenceTimeout?: number;
    onSpeechStart?: () => void;
    onSpeechEnd?: () => void;
  } = {}
): { start: () => void; stop: () => void } => {
  const threshold = config.threshold ?? 45; // Higher than original 15
  const silenceTimeout = config.silenceTimeout ?? 2000; // 2 seconds

  let isSpeaking = false;
  let silenceStart: number | null = null;
  let rafId: number | null = null;

  const checkActivity = () => {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    // Calculate average volume
    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    const nowSpeaking = average > threshold;

    if (nowSpeaking && !isSpeaking) {
      // Speech started
      isSpeaking = true;
      silenceStart = null;
      config.onSpeechStart?.();
    } else if (!nowSpeaking && isSpeaking) {
      // Potential speech end
      if (!silenceStart) {
        silenceStart = Date.now();
      } else if (Date.now() - silenceStart > silenceTimeout) {
        // Confirmed speech end
        isSpeaking = false;
        silenceStart = null;
        config.onSpeechEnd?.();
      }
    } else if (nowSpeaking) {
      // Reset silence timer if speaking again
      silenceStart = null;
    }

    rafId = requestAnimationFrame(checkActivity);
  };

  return {
    start: () => {
      isSpeaking = false;
      silenceStart = null;
      checkActivity();
    },
    stop: () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  };
};
