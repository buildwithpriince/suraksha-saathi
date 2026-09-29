import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import Storage from 'expo-sqlite/kv-store';

import { isLocale, type Locale } from '@/core/locales';

import en from './generated/en.json';
import hi from './generated/hi.json';
import sat from './generated/sat.json';

export { LOCALES, isLocale, type Locale } from '@/core/locales';

const LANGUAGE_KEY = 'app_language';
const DEFAULT_LOCALE: Locale = 'hi'; // docs/07: default locale on first launch

function savedLocale(): Locale {
  try {
    const value = Storage.getItemSync(LANGUAGE_KEY);
    return isLocale(value) ? value : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi }, sat: { translation: sat } },
  lng: savedLocale(),
  // docs/07: missing sat -> hi; anything missing -> en. Never a raw key.
  fallbackLng: { sat: ['hi', 'en'], hi: ['en'], default: ['en'] },
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
});

export function setLocale(locale: Locale): void {
  Storage.setItemSync(LANGUAGE_KEY, locale);
  // Choosing Santali again brings back the "draft under review" note on Home (D-047)
  if (locale === 'sat') setSatNoteDismissed(false);
  void i18n.changeLanguage(locale);
}

const SAT_NOTE_KEY = 'sat_draft_note_dismissed_v1';

export function isSatNoteDismissed(): boolean {
  try {
    return Storage.getItemSync(SAT_NOTE_KEY) === 'yes';
  } catch {
    return false;
  }
}

export function setSatNoteDismissed(dismissed: boolean): void {
  Storage.setItemSync(SAT_NOTE_KEY, dismissed ? 'yes' : 'no');
}

export default i18n;
