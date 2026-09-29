import * as SecureStore from 'expo-secure-store';
import * as Speech from 'expo-speech';

import i18n, { isLocale, type Locale } from '.';

// Temporary text-to-speech until recorded narration exists (docs/07 allows TTS during development;
// T-73 replaces it with recorded clips). Android has no Santali voice, and a Hindi voice can't read
// Ol Chiki, so sat speaks the Hindi text while the Santali caption stays on screen (D-047; the Home
// note says so).
const VOICE: Record<Locale, string> = { en: 'en-IN', hi: 'hi-IN', sat: 'hi-IN' };
const CHAIN: Record<Locale, Locale[]> = { en: ['en'], hi: ['hi', 'en'], sat: ['hi', 'en'] };

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

/**
 * Speech the app starts by itself (a step's instruction, a result, a scan outcome), unless
 * automatic speech is muted in Settings (D-041). When muted nothing is said (a Replay still
 * playing from the previous step stops, as it would unmuted) and `onDone` never runs, so a
 * narration step waits for Continue. Speech the worker asks for (Replay, tap to hear) calls
 * `speakKey` and is never muted.
 */
export function autoSpeakKey(key: string, onDone?: () => void): void {
  if (isAutoSpeechMuted()) {
    stopSpeaking();
    return;
  }
  speakKey(key, onDone);
}

export function stopSpeaking(): void {
  void Speech.stop();
}

// A device preference, not a secret; stored like the anchoring settings (training/anchoringSetting.ts).
const MUTE_KEY = 'auto_speech_muted_v1';

export function isAutoSpeechMuted(): boolean {
  try {
    return SecureStore.getItem(MUTE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setAutoSpeechMuted(muted: boolean): void {
  SecureStore.setItem(MUTE_KEY, muted ? 'on' : 'off');
  if (muted) stopSpeaking();
}
