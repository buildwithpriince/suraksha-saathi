import { StyleSheet, Text as NativeText, TextInput as NativeTextInput, type TextInputProps, type TextProps, type TextStyle } from 'react-native';

import { fonts } from './theme';

function faceFor(weight: TextStyle['fontWeight']): string {
  switch (String(weight ?? '400')) {
    case '600':
      return fonts.semiBold;
    case '700':
    case 'bold':
      return fonts.bold;
    case '800':
    case '900':
      return fonts.extraBold;
    default:
      return fonts.regular;
  }
}

/** The bundled face for the style's weight. `fontWeight` is dropped so Android doesn't fake-bold the face. */
function withFont(style: TextProps['style']): TextStyle {
  const { fontWeight, ...rest } = StyleSheet.flatten(style) ?? {};
  return { ...rest, fontFamily: faceFor(fontWeight) };
}

/**
 * All app text renders in the bundled Noto Sans Devanagari (docs/07), so Hindi and Santali
 * conjuncts look the same on every phone. Use these instead of react-native's Text and TextInput.
 */
export function Text(props: TextProps) {
  return <NativeText {...props} style={withFont(props.style)} />;
}

export function TextInput(props: TextInputProps) {
  return <NativeTextInput {...props} style={withFont(props.style)} />;
}
