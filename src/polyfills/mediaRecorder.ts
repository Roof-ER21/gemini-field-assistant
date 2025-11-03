// MediaRecorder WAV polyfill for Safari/older browsers
// Uses audio-recorder-polyfill with a WAV encoder when MediaRecorder is missing or limited

// Only run in browser
if (typeof window !== 'undefined') {
  // @ts-ignore
  const MR: typeof MediaRecorder | undefined = (window as any).MediaRecorder;

  const needsPolyfill =
    typeof MR === 'undefined' ||
    (MR && typeof (MR as any).isTypeSupported === 'function' &&
      !(MR as any).isTypeSupported('audio/webm;codecs=opus') &&
      !(MR as any).isTypeSupported('audio/webm') &&
      !(MR as any).isTypeSupported('audio/ogg;codecs=opus') &&
      !(MR as any).isTypeSupported('audio/mp4'));

  if (needsPolyfill) {
    // Dynamically import to avoid affecting modern browsers bundle
    import('audio-recorder-polyfill').then((mod) => {
      const Polyfill: any = (mod as any).default || mod;
      // Use WAV encoder
      import('audio-recorder-polyfill/wave-encoder').then((encoderMod) => {
        (window as any).MediaRecorder = Polyfill;
        (window as any).MediaRecorder.encoder = (encoderMod as any).default || encoderMod;
        (window as any).MediaRecorder.mimeType = 'audio/wav';
        // eslint-disable-next-line no-console
        console.log('[Polyfill] MediaRecorder WAV polyfill active');
      }).catch(() => {
        // eslint-disable-next-line no-console
        console.warn('[Polyfill] Failed to load WAV encoder, MediaRecorder polyfill disabled');
      });
    }).catch(() => {
      // eslint-disable-next-line no-console
      console.warn('[Polyfill] Failed to load MediaRecorder polyfill');
    });
  }
}

