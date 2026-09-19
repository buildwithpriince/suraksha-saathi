import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { DEMO_KEYS } from '@/device/trust';

import { Text } from './Text';
import { colors, space } from './theme';

/** D-030: shown on every certificate and verify screen while the build trusts the TEST root. */
export function DemoKeysBanner() {
  const { t } = useTranslation();
  if (!DEMO_KEYS) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.text}>⚠ {t('demo_keys.banner')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.amberBg, borderColor: colors.amber, borderWidth: 2, borderRadius: 10, padding: space.m },
  text: { color: colors.amber, fontSize: 16, fontWeight: '700', lineHeight: 23 },
});
