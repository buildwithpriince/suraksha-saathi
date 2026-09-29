import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { getScenario, playableScenarios } from '@/content/scenarios';
import type { AttemptResult } from '@/core/assessment/types';
import { listAttempts, type AttemptRecord } from '@/db/attempts';
import { getWorker, setPreferredLang } from '@/db/workers';
import { isLocale, setLocale } from '@/i18n';
import { workerRefreshers, type ModuleRefresher } from '@/refresher/refreshers';
import { formatDate } from '@/ui/CertificateDetails';
import { LanguageSwitcher } from '@/ui/LanguageSwitcher';
import { Badge, Body, Button, Card, Screen, Title } from '@/ui/components';
import { Text } from '@/ui/Text';
import { colors, space } from '@/ui/theme';
import { workerPhotoUri } from '@/workers/photos';

export default function WorkerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [worker, setWorker] = useState(() => getWorker(id));
  const [attempts, setAttempts] = useState<AttemptRecord<AttemptResult>[]>([]);
  const [refreshers, setRefreshers] = useState<ModuleRefresher[]>([]);
  const [hasPhoto, setHasPhoto] = useState(false);

  // docs/07: the kiosk switches to the worker's preferred language when they are picked
  useEffect(() => {
    if (worker !== null && isLocale(worker.preferredLang)) setLocale(worker.preferredLang);
  }, [worker]);

  useFocusEffect(
    useCallback(() => {
      // Reload on return, so an edit shows (D-035) and a finished refresher clears its badge (D-044)
      setWorker(getWorker(id));
      setAttempts(listAttempts<AttemptResult>(id));
      setRefreshers(workerRefreshers(id));
      setHasPhoto(workerPhotoUri(id) !== null);
    }, [id]),
  );

  if (worker === null) return null;

  return (
    <Screen>
      <Stack.Screen options={{ title: worker.displayName }} />
      <Card>
        <Title>{t('worker.modules.title')}</Title>
        {playableScenarios().map((s) => {
          const r = refreshers.find((m) => m.scenarioId === s.id);
          return (
            <View key={s.id} style={styles.module}>
              <Button
                label={t('worker.train.button', { module: t(s.titleKey) })}
                onPress={() => router.push({ pathname: '/train/[scenarioId]', params: { scenarioId: s.id, workerId: worker.id } })}
              />
              {r?.due ? (
                <>
                  <Badge label={t('refresher.due.badge', { day: r.due.dueDay })} tone="amber" />
                  <Button
                    kind="secondary"
                    label={t('refresher.start.button', { module: t(s.titleKey), day: r.due.dueDay })}
                    onPress={() =>
                      router.push({
                        pathname: '/train/[scenarioId]',
                        params: { scenarioId: s.id, workerId: worker.id, refresher: String(r.due!.dueDay) },
                      })
                    }
                  />
                </>
              ) : r?.next ? (
                <Body muted>{t('refresher.next.label', { day: r.next.dueDay, date: formatDate(r.next.dueAt) })}</Body>
              ) : null}
            </View>
          );
        })}
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
        {/* D-046: the ID card photo, kept on this phone only */}
        <Button
          kind="secondary"
          label={t(hasPhoto ? 'worker.photo.change.button' : 'worker.photo.add.button')}
          onPress={() => router.push({ pathname: '/worker-photo/[id]', params: { id: worker.id } })}
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
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{t(getScenario(a.result.scenarioId)?.titleKey ?? a.result.scenarioId)}</Text>
              {a.result.refresher !== undefined ? (
                <Text style={styles.rowKind}>{t('refresher.stage.label', { day: a.result.refresher.dueDay })}</Text>
              ) : null}
            </View>
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
  rowMain: { flex: 1 },
  rowTitle: { fontSize: 17, color: colors.text, fontWeight: '600' },
  rowKind: { fontSize: 15, color: colors.amber, fontWeight: '600' },
  module: { gap: space.s },
  rowMeta: { fontSize: 17, color: colors.muted },
});
