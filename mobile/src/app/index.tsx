import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import type { WorkerRecord } from '@/core/sync/payloads';
import { outboxCount } from '@/db/database';
import { getDevice } from '@/db/device';
import { listWorkers } from '@/db/workers';
import { LanguageSwitcher } from '@/ui/LanguageSwitcher';
import { Body, Button, Card, Screen, Title } from '@/ui/components';
import { Text } from '@/ui/Text';
import { colors, space } from '@/ui/theme';

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [device, setDevice] = useState(getDevice);
  const [workers, setWorkers] = useState<WorkerRecord[]>([]);
  const [pending, setPending] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setDevice(getDevice());
      setWorkers(listWorkers());
      setPending(outboxCount());
    }, []),
  );

  if (device === null) return <Redirect href="/setup" />;

  return (
    <Screen>
      <Body muted>
        {t('home.site.label', { site: device.siteCode })} · {t('home.pending_sync.label', { count: pending })}
      </Body>
      <Card>
        <Title>{t('home.workers.title')}</Title>
        {/* Kiosk login: scan the worker's ID card, or pick them below (docs/01, D-034) */}
        {workers.length > 0 ? <Button label={t('home.scan_card.button')} onPress={() => router.push('/scan')} /> : null}
        {workers.length === 0 ? <Body muted>{t('home.workers.empty')}</Body> : null}
        {workers.map((w) => (
          <Pressable
            key={w.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/worker/[id]', params: { id: w.id } })}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Text style={styles.rowTitle}>{w.displayName}</Text>
            <Text style={styles.rowMeta}>{t(`lang.${w.preferredLang}`)}</Text>
          </Pressable>
        ))}
        <Button kind={workers.length > 0 ? 'secondary' : 'primary'} label={t('home.enrol.button')} onPress={() => router.push('/enrol')} />
      </Card>
      <Button kind="secondary" label={t('home.verify.button')} onPress={() => router.push('/verify')} />
      <Card>
        <LanguageSwitcher label={t('home.language.label')} />
      </Card>
      <Button kind="secondary" label={t('home.settings.button')} onPress={() => router.push('/settings')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: space.s,
  },
  rowPressed: { backgroundColor: colors.background },
  rowTitle: { fontSize: 18, color: colors.text, fontWeight: '600' },
  rowMeta: { fontSize: 16, color: colors.muted },
});
