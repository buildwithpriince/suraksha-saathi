import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';

import { Text } from '@/ui/Text';
import { colors, space } from '@/ui/theme';

/**
 * The header lockup: the brand shield beside the app name. The shield alone, never the wordmark —
 * same rule as the launcher icon (scripts/icons.mjs). Use it as the `headerTitle` of any screen
 * that shows `app.title`, so the mark appears everywhere the app names itself.
 *
 * The name is the localized `app.title` (Devanagari in hi, Ol Chiki in sat), so no second line is added
 * here; on the dashboard the English and Devanagari names sit together because it has no locale
 * switch. The mark keeps its 32 dp and the name shrinks and ellipsizes instead, so the lockup
 * still fits a 320 dp header: 32 + 8 leaves about 240 dp for a name that needs roughly 160.
 */
export function AppTitle() {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      {/* Decorative: the name beside it is what a screen reader should announce */}
      <Image source={require('@/assets/logo-mark.png')} style={styles.mark} resizeMode="contain" accessible={false} />
      <Text numberOfLines={1} ellipsizeMode="tail" style={styles.title}>
        {t('app.title')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  mark: { width: 32, height: 32, flexShrink: 0, marginRight: space.s },
  title: { flexShrink: 1, fontSize: 20, fontWeight: '700', color: colors.primary },
});
