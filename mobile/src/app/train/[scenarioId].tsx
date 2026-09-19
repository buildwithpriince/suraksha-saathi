import { useCameraPermissions } from 'expo-camera';
import { Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getScenario } from '@/content/scenarios';
import type { AttemptMode } from '@/core/assessment/types';
import { TrainingRun } from '@/training/TrainingRun';
import { Body, Button, Card, Screen, Title } from '@/ui/components';

/** Camera permission gate, then one attempt. Without the camera the same drill runs in `tabletop`. */
export default function TrainScreen() {
  const { t } = useTranslation();
  const { scenarioId, workerId } = useLocalSearchParams<{ scenarioId: string; workerId: string }>();
  const scenario = getScenario(scenarioId);
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
      <TrainingRun scenario={scenario} workerId={workerId} mode={chosen} />
    </>
  );
}
