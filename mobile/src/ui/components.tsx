import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type TextInputProps } from 'react-native';

import { Text, TextInput } from './Text';
import { colors, space } from './theme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  if (!scroll) return <View style={styles.screen}>{children}</View>;
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Body({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

type ButtonKind = 'primary' | 'secondary' | 'danger';

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        kind === 'secondary' && styles.buttonSecondary,
        kind === 'danger' && styles.buttonDanger,
        (pressed || disabled) && styles.buttonDim,
      ]}
    >
      <Text style={[styles.buttonText, kind === 'secondary' && styles.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={colors.muted} {...input} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** A row of mutually exclusive choices, e.g. a language picker. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          accessibilityRole="radio"
          accessibilityState={{ selected: o.value === value }}
          onPress={() => onChange(o.value)}
          style={[styles.segment, o.value === value && styles.segmentSelected]}
        >
          <Text style={[styles.segmentText, o.value === value && styles.segmentTextSelected]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export type Tone = 'green' | 'amber' | 'red';

export function Badge({ label, tone }: { label: string; tone: Tone }) {
  const palette = {
    green: [colors.greenBg, colors.green],
    amber: [colors.amberBg, colors.amber],
    red: [colors.redBg, colors.red],
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette[0] }]}>
      <Text style={[styles.badgeText, { color: palette[1] }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  screen: { flexGrow: 1, backgroundColor: colors.background, padding: space.l, gap: space.l },
  title: { fontSize: 24, fontWeight: '700', color: colors.primary },
  body: { fontSize: 17, lineHeight: 26, color: colors.text },
  muted: { color: colors.muted },
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: space.l, gap: space.m },
  button: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.l,
  },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  buttonDanger: { backgroundColor: colors.red },
  buttonDim: { opacity: 0.6 },
  buttonText: { fontSize: 18, fontWeight: '600', color: colors.primaryText },
  buttonTextSecondary: { color: colors.primary },
  field: { gap: space.xs },
  label: { fontSize: 16, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: space.m,
    fontSize: 18,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  hint: { fontSize: 14, color: colors.muted },
  error: { fontSize: 14, color: colors.red },
  segmented: { flexDirection: 'row', gap: space.s, flexWrap: 'wrap' },
  segment: {
    minHeight: 44,
    paddingHorizontal: space.l,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.primary,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  segmentSelected: { backgroundColor: colors.primary },
  segmentText: { fontSize: 17, color: colors.primary },
  segmentTextSelected: { color: colors.primaryText },
  badge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: space.m, paddingVertical: space.xs },
  badgeText: { fontSize: 15, fontWeight: '700' },
});
