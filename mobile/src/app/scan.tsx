import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { parseScannedCard } from '@/core/workers/idCard';
import { getWorker } from '@/db/workers';
import { speakKey, stopSpeaking } from '@/i18n/speech';
import { Body, Button, Card, Screen } from '@/ui/components';

/** Kiosk login (docs/01, D-034): scan a worker ID card to open that worker, in their language. */
export default function ScanWorkerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [problemKey, setProblemKey] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => stopSpeaking, []);

  const onScan = (scan: BarcodeScanningResult) => {
    if (busy.current) return;
    busy.current = true;
    const card = parseScannedCard(scan.data);
    const worker = card.kind === 'worker' ? getWorker(card.workerId) : null;
    if (worker !== null) {
      router.replace({ pathname: '/worker/[id]', params: { id: worker.id } });
      return;
    }
    const key = card.kind === 'worker' ? 'scan.not_found' : card.kind === 'certificate' ? 'scan.certificate' : 'scan.not_card';
    setProblemKey(key);
    speakKey(key);
  };

  const again = () => {
    setProblemKey(null);
    busy.current = false;
  };

  if (permission === null) return null;
  const side = Math.round(width * 0.8);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('scan.title') }} />
      {!permission.granted ? (
        <Card>
          <Body>{t('scan.camera.body')}</Body>
          {permission.canAskAgain ? <Button label={t('verify.camera.allow.button')} onPress={() => void requestPermission()} /> : null}
        </Card>
      ) : problemKey === null ? (
        <Card>
          <View style={[styles.scanner, { width: side, height: side }]}>
            <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScan} />
          </View>
          <Body muted>{t('scan.hint')}</Body>
        </Card>
      ) : (
        <Card>
          <Body>{t(problemKey)}</Body>
          <Button label={t('scan.again.button')} onPress={again} />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scanner: { alignSelf: 'center', borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },
});
