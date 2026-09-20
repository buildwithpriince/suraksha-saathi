/** App locales (docs/07). Workers' `preferredLang` is one of these. */
export const LOCALES = ['en', 'hi', 'sat'] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(value: string | null): value is Locale {
  return value !== null && (LOCALES as readonly string[]).includes(value);
}
