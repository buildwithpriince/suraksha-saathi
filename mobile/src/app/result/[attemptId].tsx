import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { getScenario } from '@/content/scenarios';
import { sortRulesForDisplay } from '@/core/assessment/result';
import type { AttemptResult, RuleResult } from '@/core/assessment/types';
import { getAttempt, wasAborted } from '@/db/attempts';
import { speakKey, stopSpeaking } from '@/i18n/speech';
import { Badge, Body, Button, Card, Screen, Title } from '@/ui/components';
import { Text } from '@/ui/Text';
import { colors, space } from '@/ui/theme';

/** docs/03 "Result screen requirements". */
export default function ResultScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const [attempt] = useState(() => getAttempt<AttemptResult>(attemptId));
  const [aborted] = useState(() => wasAborted(attemptId));
  const result = attempt?.result;
  const scenario = result === undefined ? null : getScenario(result.scenarioId);

  useEffect(() => {
    if (result !== undefined) speakKey(result.passed ? 'result.passed.audio' : 'result.not_yet.audio');
    return stopSpeaking;
  }, [result]);

  if (attempt === null || result === undefined || scenario === null) return null;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('result.title'), headerBackVisible: false }} />
      <Card>
        <Title>{t(scenario.titleKey)}</Title>
        <View style={[styles.verdict, { backgroundColor: result.passed ? colors.greenBg : colors.redBg }]}>
          <Text style={[styles.verdictText, { color: result.passed ? colors.green : colors.red }]}>
            {t(result.passed ? 'attempt.pass.label' : 'attempt.not_yet.label')}
          </Text>
          <Text style={styles.score}>{t('result.score.label', { score: result.scorePercent })}</Text>
          <Text style={styles.threshold}>{t('result.threshold.label', { threshold: scenario.passThresholdPercent })}</Text>
        </View>
        {aborted ? <Body muted>{t('result.aborted.label')}</Body> : null}
      </Card>

      <Card>
        <Title>{t('result.rules.title')}</Title>
        <Body muted>{t('result.tap_to_hear.hint')}</Body>
        {sortRulesForDisplay(result.rules).map((rule) => (
          <RuleRow key={rule.ruleId} rule={rule} />
        ))}
      </Card>

      <Button
        label={t('result.try_again.button')}
        onPress={() =>
          router.replace({ pathname: '/train/[scenarioId]', params: { scenarioId: result.scenarioId, workerId: attempt.workerId } })
        }
      />
      <Button kind="secondary" label={t('result.done.button')} onPress={() => router.replace({ pathname: '/worker/[id]', params: { id: attempt.workerId } })} />
    </Screen>
  );
}

function RuleRow({ rule }: { rule: RuleResult }) {
  const { t } = useTranslation();
  const criticalFailed = rule.critical && !rule.passed;
  const lost = rule.earned < rule.max;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => speakKey(rule.feedbackKey)}
      style={({ pressed }) => [styles.row, (criticalFailed || lost) && styles.rowLost, pressed && styles.rowPressed]}
    >
      <View style={styles.rowMain}>
        <Text style={styles.rowText}>
          {lost || criticalFailed ? '✗' : '✓'} {t(rule.feedbackKey)}
        </Text>
        {criticalFailed ? <Badge label={t('result.critical.label')} tone="red" /> : null}
      </View>
      <Text style={styles.points}>{t('result.points.label', { earned: rule.earned, max: rule.max })}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  verdict: { borderRadius: 12, padding: space.l, alignItems: 'center', gap: space.xs },
  verdictText: { fontSize: 36, fontWeight: '800' },
  score: { fontSize: 22, fontWeight: '700', color: colors.text },
  threshold: { fontSize: 16, color: colors.muted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.m,
    borderRadius: 10,
    backgroundColor: colors.greenBg,
  },
  rowLost: { backgroundColor: colors.redBg },
  rowPressed: { opacity: 0.7 },
  rowMain: { flex: 1, gap: space.xs },
  rowText: { fontSize: 17, lineHeight: 25, color: colors.text },
  points: { fontSize: 17, fontWeight: '700', color: colors.text },
});
