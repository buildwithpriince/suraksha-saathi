import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Placeholder home for the first Expo Go milestone (T-02). Hard-coded text is temporary: the real
// Home screen (T-41) reads every string from i18next keys. The second line checks that Android
// shapes Devanagari conjuncts and vowel signs correctly (docs/07 acceptance words).
export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Suraksha Saathi</Text>
        <Text style={styles.subtitle}>सुरक्षा साथी</Text>
        <Text style={styles.check}>क्षमता · ज्ञान · प्रशिक्षण · सुरक्षित</Text>
        <Text style={styles.note}>Placeholder home screen</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F7FB',
    padding: 24,
  },
  card: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 32,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  title: { fontSize: 28, fontWeight: '700', color: '#0B3D63' },
  subtitle: { fontSize: 24, color: '#0B3D63' },
  check: { fontSize: 20, color: '#1F2933' },
  note: { fontSize: 14, color: '#52606D' },
});
