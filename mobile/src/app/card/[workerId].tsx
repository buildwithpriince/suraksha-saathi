import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, useWindowDimensions } from 'react-native';

import { shareCard } from '@/cards/shareCard';
import { cardWidthPx } from '@/core/cards/walletCard';
import { getWorker } from '@/db/workers';
import { Body, Button, Screen } from '@/ui/components';
import { space } from '@/ui/theme';
import { WorkerIdCard } from '@/ui/WalletCard';
import { printIdCards } from '@/workers/printCard';
import { workerPhotoUri } from '@/workers/photos';

/** Widest the card is drawn on a tablet or in landscape, dp. */
const MAX_CARD_DP = 480;

/** A worker's ID card (D-034, D-046): the wallet card with the kiosk QR, to share or print. */
export default function IdCardScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { workerId } = useLocalSearchParams<{ workerId: string }>();
  const [worker] = useState(() => getWorker(workerId));
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problemKey, setProblemKey] = useState<string | null>(null);
  const card = useRef<View>(null);

  // The photo may have been taken or removed on the worker page since this screen was opened
  useFocusEffect(useCallback(() => setPhoto(workerPhotoUri(workerId)), [workerId]));

  if (worker === null) return null;

  const run = (task: () => Promise<boolean>, failedKey: string) => {
    setBusy(true);
    setProblemKey(null);
    task()
      .then((ok) => {
        if (!ok) setProblemKey(failedKey);
      })
      .catch(() => setProblemKey(failedKey))
      .finally(() => setBusy(false));
  };

  const share = () => run(() => shareCard(card, t('card.share.button')), 'card.share.failed');
  const print = () => run(() => printIdCards([worker]).then(() => true), 'card.print.failed');

  return (
    <Screen>
      <Stack.Screen options={{ title: t('card.title') }} />
      <WorkerIdCard worker={worker} photoUri={photo} width={cardWidthPx(width - 2 * space.l, MAX_CARD_DP)} cardRef={card} />
      <Body muted>{t('card.hint')}</Body>
      {problemKey !== null ? <Body>{t(problemKey)}</Body> : null}
      <Button label={t('card.share.button')} onPress={share} disabled={busy} />
      <Button kind="secondary" label={t('card.print.button')} onPress={print} disabled={busy} />
    </Screen>
  );
}
