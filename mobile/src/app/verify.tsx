import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { statusDisplay, verifyCertificate, type CertificateVerification } from '@/core/certificates/verify';
import { nowSeconds } from '@/db/database';
import { getRevocationList } from '@/db/revocations';
import { TRUST } from '@/device/trust';
import { speakKey, stopSpeaking } from '@/i18n/speech';
import { CertificateDetails } from '@/ui/CertificateDetails';
import { DemoKeysBanner } from '@/ui/DemoKeysBanner';
import { Body, Button, Card, Screen } from '@/ui/components';
import { colors, space } from '@/ui/theme';

const REASON: Partial<Record<CertificateVerification['status'], string>> = {
  INVALID_FORMAT: 'verify.reason.invalid_format',
  INVALID_ATTESTATION: 'verify.reason.invalid_attestation',
  INVALID_SIGNATURE: 'verify.reason.invalid_signature',
};

/** docs/04 verification on the device: scan, check offline, show the status in about 3 seconds. */
export default function VerifyScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [check, setCheck] = useState<CertificateVerification | null>(null);
  const [listIat, setListIat] = useState<number | null>(null);
  const busy = useRef(false);

  useEffect(() => stopSpeaking, []);

  const onScan = (scan: BarcodeScanningResult) => {
    if (busy.current || TRUST.mode === 'unconfigured') return;
    busy.current = true;
    const list = getRevocationList();
    const result = verifyCertificate(scan.data.trim(), {
      rootPublicKey: TRUST.rootPublicKey,
      now: nowSeconds(),
      revocationList: list?.token ?? null,
    });
    setListIat(result.revocation === 'CHECKED' ? (result.revocationsIat ?? null) : null);
    setCheck(result);
    speakKey(`verify.status.${statusDisplay(result.status).key}`);
  };

  const again = () => {
    setCheck(null);
    busy.current = false;
  };

  const relative = (iat: number) => {
    const minutes = Math.max(0, Math.floor((nowSeconds() - iat) / 60));
    if (minutes < 60) return t('time.minutes_ago', { count: minutes });
    if (minutes < 48 * 60) return t('time.hours_ago', { count: Math.floor(minutes / 60) });
    return t('time.days_ago', { count: Math.floor(minutes / 1440) });
  };

  if (permission === null) return null;
  const side = Math.round(width * 0.8);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('verify.title') }} />
      <DemoKeysBanner />
      {TRUST.mode === 'unconfigured' ? (
        <Card>
          <Body>{t('cert.untrusted.label')}</Body>
        </Card>
      ) : null}

      {!permission.granted ? (
        <Card>
          <Body>{t('verify.camera.body')}</Body>
          {permission.canAskAgain ? <Button label={t('verify.camera.allow.button')} onPress={() => void requestPermission()} /> : null}
        </Card>
      ) : check === null ? (
        <Card>
          <View style={[styles.scanner, { width: side, height: side }]}>
            <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScan} />
          </View>
          <Body muted>{t('verify.scan.hint')}</Body>
        </Card>
      ) : (
        <Card>
          <View style={styles.status}>
            <Text style={[styles.statusText, { color: toneColor(statusDisplay(check.status).tone) }]}>
              {t(`verify.status.${statusDisplay(check.status).key}`)}
            </Text>
          </View>
          {REASON[check.status] !== undefined ? <Body>{t(REASON[check.status]!)}</Body> : null}
          {check.certificate !== undefined ? <CertificateDetails body={check.certificate} /> : null}
          {/* docs/04: always say how fresh the revocation information is */}
          <Body muted>{listIat !== null ? t('verify.revocation.updated', { when: relative(listIat) }) : t('verify.revocation.unknown')}</Body>
          <Button label={t('verify.again.button')} onPress={again} />
        </Card>
      )}
    </Screen>
  );
}

function toneColor(tone: 'green' | 'amber' | 'red'): string {
  return tone === 'green' ? colors.green : tone === 'amber' ? colors.amber : colors.red;
}

const styles = StyleSheet.create({
  scanner: { alignSelf: 'center', borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },
  status: { alignItems: 'center', gap: space.s, paddingVertical: space.m },
  statusText: { fontSize: 40, fontWeight: '800' },
});
