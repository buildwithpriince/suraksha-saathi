import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { listAttempts, type AttemptRecord } from '@/db/attempts';
import { getWorker } from '@/db/workers';
import { Badge, Body, Card, Screen, Title } from '@/ui/components';
import { colors, space } from '@/ui/theme';

export default function WorkerScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [worker] = useState(() => getWorker(id));
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);

  useFocusEffect(
    useCallback(() => {
      setAttempts(listAttempts(id));
    }, [id]),
  );

  if (worker === null) return null;

  return (
    <Screen>
      <Stack.Screen options={{ title: worker.displayName }} />
      <Card>
        <Title>{t('worker.attempts.title')}</Title>
        {attempts.length === 0 ? <Body muted>{t('worker.attempts.empty')}</Body> : null}
        {attempts.map((a) => (
          <View key={a.id} style={styles.row}>
            <Text style={styles.rowTitle}>{a.result.scenarioId}</Text>
            <Text style={styles.rowMeta}>{t('attempt.score.label', { score: a.result.scorePercent })}</Text>
            <Badge
              label={t(a.result.passed ? 'attempt.pass.label' : 'attempt.not_yet.label')}
              tone={a.result.passed ? 'green' : 'red'}
            />
          </View>
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
