import * as Speech from 'expo-speech';

import i18n, { isLocale, type Locale } from '.';

// Temporary text-to-speech until recorded narration exists (docs/07 allows TTS during development;
// T-73 replaces it with recorded clips). Santali has no TTS voice: its text falls back to Hindi.
const VOICE: Record<Locale, string> = { en: 'en-IN', hi: 'hi-IN', sat: 'hi-IN' };
const CHAIN: Record<Locale, Locale[]> = { en: ['en'], hi: ['hi', 'en'], sat: ['sat', 'hi', 'en'] };

/** Speak a string key in the current language (or its docs/07 fallback). `onDone` runs once. */
export function speakKey(key: string, onDone?: () => void): void {
  void Speech.stop();
  const current: Locale = isLocale(i18n.language) ? i18n.language : 'hi';
  let called = false;
  const done = () => {
    if (!called) {
      called = true;
      onDone?.();
    }
  };
  for (const locale of CHAIN[current]) {
    const text: unknown = i18n.getResource(locale, 'translation', key);
    if (typeof text === 'string' && text !== '') {
      Speech.speak(text, { language: VOICE[locale], onDone: done, onError: done });
      return;
    }
  }
  done();
}

export function stopSpeaking(): void {
  void Speech.stop();
}
