import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { isSatNoteDismissed, setSatNoteDismissed } from '@/i18n';

import { Text } from './Text';
import { colors, space } from './theme';

const LINES = ['home.sat_draft.note', 'home.sat_draft.voice'] as const;

/**
 * Honest labelling for Santali (D-047): while sat is selected, Home says the text is an unreviewed
 * draft and that narration is spoken in Hindi, in Santali and in English (for the supervisor).
 * Closing it is remembered until Santali is chosen again.
 */
export function SantaliDraftNote() {
  const { t, i18n } = useTranslation();
  const [dismissed, setDismissed] = useState(isSatNoteDismissed);
  if (i18n.language !== 'sat' || dismissed) return null;
  const en = i18n.getFixedT('en');
  return (
    <View style={styles.note} accessibilityRole="alert">
      <View style={styles.text}>
        {LINES.map((key) => (
          <Text key={key} style={styles.santali}>
            {t(key)}
          </Text>
        ))}
        {LINES.map((key) => (
          <Text key={`en-${key}`} style={styles.english}>
            {en(key)}
          </Text>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('home.sat_draft.dismiss')} / ${en('home.sat_draft.dismiss')}`}
        hitSlop={12}
        onPress={() => {
          setSatNoteDismissed(true);
          setDismissed(true);
        }}
        style={styles.close}
      >
        <Text style={styles.closeText}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.s,
    backgroundColor: colors.amberBg,
    borderRadius: 12,
    padding: space.m,
  },
  text: { flex: 1, gap: space.xs },
  santali: { fontSize: 15, lineHeight: 22, color: colors.amber },
  english: { fontSize: 13, lineHeight: 18, color: colors.muted },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 18, color: colors.amber },
});
