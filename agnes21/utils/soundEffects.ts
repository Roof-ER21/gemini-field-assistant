/**
 * Web Audio API Sound Effects
 * Pure JavaScript sound generation without external audio files
 */

const STORAGE_KEY = 'agnes_sounds_enabled';

// Sound state
let soundsEnabled = true;

// Initialize from localStorage
export const initializeSounds = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  soundsEnabled = stored === null ? true : stored === 'true';
  return soundsEnabled;
};

// Toggle sounds on/off
export const toggleSounds = (enabled?: boolean): boolean => {
  if (enabled !== undefined) {
    soundsEnabled = enabled;
  } else {
    soundsEnabled = !soundsEnabled;
  }
  localStorage.setItem(STORAGE_KEY, String(soundsEnabled));
  return soundsEnabled;
};

// Check if sounds are enabled
export const areSoundsEnabled = (): boolean => {
  return soundsEnabled;
};

/**
 * Create audio context (singleton pattern)
 */
let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
};

/**
 * Play a success sound (pleasant chime)
 * Frequency: E5 (659.25 Hz) -> C6 (1046.50 Hz)
 */
export const playSuccess = () => {
  if (!soundsEnabled) return;

  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Create oscillator for the main tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // Play a pleasant rising chime
    osc.frequency.setValueAtTime(659.25, now); // E5
    osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.15); // C6

    // Envelope: quick attack, gentle decay
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    osc.type = 'sine';
    osc.start(now);
    osc.stop(now + 0.3);

  } catch (error) {
    console.warn('Failed to play success sound:', error);
  }
};

/**
 * Play a perfect score sound (triumphant multi-tone)
 * Major chord: C5 (523.25 Hz) + E5 (659.25 Hz) + G5 (783.99 Hz)
 */
export const playPerfect = () => {
  if (!soundsEnabled) return;

  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Create a major chord (C-E-G)
    const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5

    frequencies.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(freq, now);
      osc.type = 'sine';

      // Stagger the notes slightly for a richer sound
      const startTime = now + (index * 0.05);
      const endTime = startTime + 0.5;

      // Envelope
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, endTime);

      osc.start(startTime);
      osc.stop(endTime);
    });

  } catch (error) {
    console.warn('Failed to play perfect sound:', error);
  }
};

/**
 * Play a level up sound (ascending arpeggio)
 * C5 -> E5 -> G5 -> C6
 */
export const playLevelUp = () => {
  if (!soundsEnabled) return;

  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Ascending arpeggio
    const notes = [
      { freq: 523.25, time: 0 },     // C5
      { freq: 659.25, time: 0.1 },   // E5
      { freq: 783.99, time: 0.2 },   // G5
      { freq: 1046.50, time: 0.3 },  // C6
    ];

    notes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(note.freq, now + note.time);
      osc.type = 'sine';

      const startTime = now + note.time;
      const endTime = startTime + 0.2;

      // Envelope
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.25, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.01, endTime);

      osc.start(startTime);
      osc.stop(endTime);
    });

  } catch (error) {
    console.warn('Failed to play level up sound:', error);
  }
};

// Initialize sounds on module load
initializeSounds();
