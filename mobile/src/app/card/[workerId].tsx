import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { workerCardText } from '@/core/workers/idCard';
import { getWorker } from '@/db/workers';
import { Body, Button, Card, Screen, Title } from '@/ui/components';
import { space } from '@/ui/theme';
import { cardLines, printIdCards } from '@/workers/printCard';

/** A worker's ID card (D-034): the QR to scan at the kiosk, and a button to print it. */
export default function IdCardScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { workerId } = useLocalSearchParams<{ workerId: string }>();
  const [worker] = useState(() => getWorker(workerId));
  const [printing, setPrinting] = useState(false);
  const [failed, setFailed] = useState(false);

  if (worker === null) return null;

  const print = () => {
    setPrinting(true);
    setFailed(false);
    printIdCards([worker])
      .catch(() => setFailed(true))
      .finally(() => setPrinting(false));
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('card.title') }} />
      <Card>
        <View style={styles.qr}>
          <QRCode value={workerCardText(worker.id)} size={Math.round(width * 0.6)} ecl="Q" quietZone={16} backgroundColor="#FFFFFF" />
        </View>
        <Title>{worker.displayName}</Title>
        {cardLines(worker).map((line) => (
          <Body key={line}>{line}</Body>
        ))}
        <Body muted>{t('card.hint')}</Body>
      </Card>
      {failed ? <Body>{t('card.print.failed')}</Body> : null}
      <Button label={t('card.print.button')} onPress={print} disabled={printing} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  qr: { alignItems: 'center', paddingVertical: space.s },
});
