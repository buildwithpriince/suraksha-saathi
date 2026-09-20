import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { getScenario, playableScenarios } from '@/content/scenarios';
import { listAttempts, type AttemptRecord } from '@/db/attempts';
import { getWorker, setPreferredLang } from '@/db/workers';
import { isLocale, setLocale } from '@/i18n';
import { LanguageSwitcher } from '@/ui/LanguageSwitcher';
import { Badge, Body, Button, Card, Screen, Title } from '@/ui/components';
import { Text } from '@/ui/Text';
import { colors, space } from '@/ui/theme';

export default function WorkerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [worker, setWorker] = useState(() => getWorker(id));
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);

  // docs/07: the kiosk switches to the worker's preferred language when they are picked
  useEffect(() => {
    if (worker !== null && isLocale(worker.preferredLang)) setLocale(worker.preferredLang);
  }, [worker]);

  useFocusEffect(
    useCallback(() => {
      // Reload on return, so an edit shows (D-035)
      setWorker(getWorker(id));
      setAttempts(listAttempts(id));
    }, [id]),
  );

  if (worker === null) return null;

  return (
    <Screen>
      <Stack.Screen options={{ title: worker.displayName }} />
      <Card>
        <Title>{t('worker.modules.title')}</Title>
        {playableScenarios().map((s) => (
          <Button
            key={s.id}
            label={t('worker.train.button', { module: t(s.titleKey) })}
            onPress={() => router.push({ pathname: '/train/[scenarioId]', params: { scenarioId: s.id, workerId: worker.id } })}
          />
        ))}
        <LanguageSwitcher label={t('worker.language.label')} onChange={(l) => setPreferredLang(worker.id, l)} />
        <Button
          kind="secondary"
          label={t('worker.certificate.button')}
          onPress={() => router.push({ pathname: '/certificate/[workerId]', params: { workerId: worker.id } })}
        />
        <Button
          kind="secondary"
          label={t('worker.edit.button')}
          onPress={() => router.push({ pathname: '/worker-edit/[id]', params: { id: worker.id } })}
        />
        <Button
          kind="secondary"
          label={t('worker.card.button')}
          onPress={() => router.push({ pathname: '/card/[workerId]', params: { workerId: worker.id } })}
        />
      </Card>
      <Card>
        <Title>{t('worker.attempts.title')}</Title>
        {attempts.length === 0 ? <Body muted>{t('worker.attempts.empty')}</Body> : null}
        {attempts.map((a) => (
          <Pressable
            key={a.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/result/[attemptId]', params: { attemptId: a.id } })}
            style={styles.row}
          >
            <Text style={styles.rowTitle}>{t(getScenario(a.result.scenarioId)?.titleKey ?? a.result.scenarioId)}</Text>
            <Text style={styles.rowMeta}>{t('attempt.score.label', { score: a.result.scorePercent })}</Text>
            <Badge
              label={t(a.result.passed ? 'attempt.pass.label' : 'attempt.not_yet.label')}
              tone={a.result.passed ? 'green' : 'red'}
            />
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowTitle: { flex: 1, fontSize: 17, color: colors.text, fontWeight: '600' },
  rowMeta: { fontSize: 17, color: colors.muted },
});
