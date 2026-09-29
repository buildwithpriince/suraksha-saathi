import { useCameraPermissions } from 'expo-camera';
import { Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { REFRESHER_CONFIG } from '@/content/refresher';
import { getScenario } from '@/content/scenarios';
import type { AttemptMode, RefresherInfo } from '@/core/assessment/types';
import { refresherScenario } from '@/core/refresher/derive';
import { TrainingRun } from '@/training/TrainingRun';
import { Body, Button, Card, Screen, Title } from '@/ui/components';

/**
 * Camera permission gate, then one attempt. Without the camera the same drill runs in `tabletop`.
 * `refresher=<dueDay>` plays the shortened refresher of the module instead (D-044).
 */
export default function TrainScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ scenarioId: string; workerId: string; refresher?: string }>();
  const { scenarioId, workerId } = params;
  const refresher: RefresherInfo | undefined = useMemo(() => {
    const dueDay = Number(params.refresher);
    return REFRESHER_CONFIG.dueDays.includes(dueDay) ? { dueDay } : undefined;
  }, [params.refresher]);
  const scenario = useMemo(() => {
    const full = getScenario(scenarioId);
    return full !== null && refresher !== undefined ? refresherScenario(full) : full;
  }, [scenarioId, refresher]);
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<AttemptMode | null>(null);

  if (scenario === null || permission === null) return null;
  const chosen: AttemptMode | null = mode ?? (permission.granted ? 'ar' : null);

  if (chosen === null) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t(scenario.titleKey) }} />
        <Card>
          <Title>{t('training.camera.title')}</Title>
          <Body>{t('training.camera.body')}</Body>
          {permission.canAskAgain ? (
            <Button
              label={t('training.camera.allow.button')}
              onPress={() => {
                void requestPermission().then((r) => {
                  if (r.granted) setMode('ar');
                });
              }}
            />
          ) : null}
          <Button kind="secondary" label={t('training.camera.skip.button')} onPress={() => setMode('tabletop')} />
        </Card>
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <TrainingRun scenario={scenario} workerId={workerId} mode={chosen} refresher={refresher} />
    </>
  );
}
