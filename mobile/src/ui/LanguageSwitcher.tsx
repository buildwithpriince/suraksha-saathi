import { useTranslation } from 'react-i18next';

import { LOCALES, isIncomplete, isLocale, setLocale, type Locale } from '@/i18n';

import { Body, Segmented } from './components';

/**
 * en / hi / sat, switchable at runtime (docs/00 R5). Picker labels are always in their own script.
 * `onChange` also runs, e.g. to store a worker's preferred language.
 */
export function LanguageSwitcher({ label, onChange }: { label: string; onChange?: (locale: Locale) => void }) {
  const { t, i18n } = useTranslation();
  const current: Locale = isLocale(i18n.language) ? i18n.language : 'hi';
  return (
    <>
      <Body>{label}</Body>
      <Segmented
        options={LOCALES.map((l) => ({ value: l, label: t(`lang.${l}`) }))}
        value={current}
        onChange={(l) => {
          setLocale(l);
          onChange?.(l);
        }}
      />
      {current === 'sat' && isIncomplete('sat') ? <Body muted>{t('lang.sat.pending')}</Body> : null}
    </>
  );
}
