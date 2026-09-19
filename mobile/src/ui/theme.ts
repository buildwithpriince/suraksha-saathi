export const colors = {
  background: '#F4F7FB',
  surface: '#FFFFFF',
  text: '#1F2933',
  muted: '#52606D',
  primary: '#0B3D63',
  primaryText: '#FFFFFF',
  border: '#D9E2EC',
  green: '#1E7B34',
  greenBg: '#E3F9E5',
  amber: '#8D5B00',
  amberBg: '#FFF3C4',
  red: '#B42318',
  redBg: '#FDE8E7',
  overlay: 'rgba(0, 0, 0, 0.55)',
} as const;

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24 } as const;

/**
 * Noto Sans Devanagari faces (docs/07), loaded by the root layout. The font also covers the Latin
 * text, so en, hi and sat all use it. Runtime-loaded fonts get one family name per weight, so
 * `ui/Text` picks the face from `fontWeight`.
 */
export const fonts = {
  regular: 'NotoSansDevanagari_400Regular',
  semiBold: 'NotoSansDevanagari_600SemiBold',
  bold: 'NotoSansDevanagari_700Bold',
  extraBold: 'NotoSansDevanagari_800ExtraBold',
} as const;
