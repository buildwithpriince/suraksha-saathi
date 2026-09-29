import '@/i18n';

// One import per weight: the package root would bundle all nine weights (about 2 MB)
import { NotoSansDevanagari_400Regular } from '@expo-google-fonts/noto-sans-devanagari/400Regular';
import { NotoSansDevanagari_600SemiBold } from '@expo-google-fonts/noto-sans-devanagari/600SemiBold';
import { NotoSansDevanagari_700Bold } from '@expo-google-fonts/noto-sans-devanagari/700Bold';
import { NotoSansDevanagari_800ExtraBold } from '@expo-google-fonts/noto-sans-devanagari/800ExtraBold';
import { NotoSansOlChiki_400Regular } from '@expo-google-fonts/noto-sans-ol-chiki/400Regular';
import { NotoSansOlChiki_600SemiBold } from '@expo-google-fonts/noto-sans-ol-chiki/600SemiBold';
import { NotoSansOlChiki_700Bold } from '@expo-google-fonts/noto-sans-ol-chiki/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { colors, fonts, olChikiFonts } from '@/ui/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { t, i18n } = useTranslation();
  // docs/07: Noto Sans Devanagari and, for Santali, Noto Sans Ol Chiki (D-047) are bundled, so no
  // network is needed. The family names are the keys below and must match `fonts` / `olChikiFonts` in ui/theme.
  const [loaded, error] = useFonts({
    NotoSansDevanagari_400Regular,
    NotoSansDevanagari_600SemiBold,
    NotoSansDevanagari_700Bold,
    NotoSansDevanagari_800ExtraBold,
    NotoSansOlChiki_400Regular,
    NotoSansOlChiki_600SemiBold,
    NotoSansOlChiki_700Bold,
  });
  const ready = loaded || error !== null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // If loading fails the app still starts with the system font rather than never leaving the splash
  if (!ready) return null;

  // Gesture handler gestures (the extinguisher pin) only receive touches inside this root view
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.primary,
          // Screen titles are plain strings, so they don't pass through ui/Text: pick the face here
          headerTitleStyle: { fontFamily: (i18n.language === 'sat' ? olChikiFonts : fonts).bold },
          contentStyle: { backgroundColor: colors.background },
          title: t('app.title'),
        }}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
