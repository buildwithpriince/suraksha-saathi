import type { ReactNode } from 'react';
import { StyleSheet, Text as NativeText, TextInput as NativeTextInput, type TextInputProps, type TextProps, type TextStyle } from 'react-native';

import i18n from '@/i18n';

import { fonts, olChikiFonts, type FontSet } from './theme';

const OL_CHIKI = /[᱐-᱿]/;

/** The text of plain string children, or null when they include elements. */
function plainText(children: ReactNode): string | null {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) {
    let text = '';
    for (const child of children) {
      if (child === null || child === undefined || typeof child === 'boolean') continue;
      if (typeof child !== 'string' && typeof child !== 'number') return null;
      text += String(child);
    }
    return text;
  }
  return null;
}

/**
 * Ol Chiki text gets Noto Sans Ol Chiki, everything else Noto Sans Devanagari (D-047). Deciding by
 * the text rather than the locale also covers Ol Chiki shown in another language (the picker label)
 * and Devanagari or Latin shown under sat (worker names, codes). Nested elements go by the locale.
 */
export function fontSetFor(text: string | null): FontSet {
  if (text !== null) return OL_CHIKI.test(text) ? olChikiFonts : fonts;
  return i18n.language === 'sat' ? olChikiFonts : fonts;
}

function faceFor(set: FontSet, weight: TextStyle['fontWeight']): string {
  switch (String(weight ?? '400')) {
    case '600':
      return set.semiBold;
    case '700':
    case 'bold':
      return set.bold;
    case '800':
    case '900':
      return set.extraBold;
    default:
      return set.regular;
  }
}

/** The bundled face for the style's weight. `fontWeight` is dropped so Android doesn't fake-bold the face. */
function withFont(style: TextProps['style'], set: FontSet): TextStyle {
  const { fontWeight, ...rest } = StyleSheet.flatten(style) ?? {};
  return { ...rest, fontFamily: faceFor(set, fontWeight) };
}

/**
 * All app text renders in a bundled Noto face (docs/07): Devanagari for en and hi, Ol Chiki for
 * Santali, so every phone shapes it the same. Use these instead of react-native's Text and TextInput.
 */
export function Text(props: TextProps) {
  return <NativeText {...props} style={withFont(props.style, fontSetFor(plainText(props.children)))} />;
}

export function TextInput(props: TextInputProps) {
  const shown = props.value || props.defaultValue || props.placeholder || null;
  return <NativeTextInput {...props} style={withFont(props.style, fontSetFor(shown ?? null))} />;
}
