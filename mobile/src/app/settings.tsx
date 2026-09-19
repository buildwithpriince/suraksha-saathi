import manifest from '@content/manifest.json';
import Constants from 'expo-constants';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usableAttestation } from '@/core/certificates/issue';
import { lastSyncAt, nowSeconds, outboxCount } from '@/db/database';
import { getDevice } from '@/db/device';
import { TRUST } from '@/device/trust';
import { formatDate } from '@/ui/CertificateDetails';
import { DemoKeysBanner } from '@/ui/DemoKeysBanner';
import { LanguageSwitcher } from '@/ui/LanguageSwitcher';
import { Body, Button, Card, Screen, Title } from '@/ui/components';

/** docs/01 Settings: language, this device's status, sync, and versions (T-41). */
export default function SettingsScreen() {
  const { t } = useTranslation();
  const [device, setDevice] = useState(getDevice);
  const [pending, setPending] = useState(0);
  const [lastSync, setLastSync] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      setDevice(getDevice());
      setPending(outboxCount());
      setLastSync(lastSyncAt());
    }, []),
  );

  if (device === null) return null;

  const attestation =
    TRUST.mode === 'unconfigured'
      ? null
      : usableAttestation(device.attestationToken, {
          rootPublicKey: TRUST.rootPublicKey,
          devicePublicKey: device.publicKey,
          site: device.siteCode,
          now: nowSeconds(),
        });

  return (
    <Screen>
      <Stack.Screen options={{ title: t('settings.title') }} />
      <DemoKeysBanner />

      <Card>
        <LanguageSwitcher label={t('home.language.label')} />
      </Card>

      <Card>
        <Title>{t('settings.device.title')}</Title>
        <Body>{t('settings.site.value', { site: device.siteCode })}</Body>
        <Body>{t(`settings.status.${device.status}`)}</Body>
        <Body>{attestation === null ? t('settings.attestation.none') : t('settings.attestation.until', { date: formatDate(attestation.exp) })}</Body>
        <Body muted>{t('settings.device_id.value', { id: device.id })}</Body>
      </Card>

      <Card>
        <Title>{t('settings.sync.title')}</Title>
        <Body>{t('home.pending_sync.label', { count: pending })}</Body>
        <Body>{lastSync === null ? t('settings.last_sync.never') : t('settings.last_sync.value', { date: formatDate(lastSync) })}</Body>
        {/* The sync client is T-57; until then the button stays visible but off, with the reason */}
        <Button label={t('settings.sync_now.button')} onPress={() => {}} disabled />
        <Body muted>{t('settings.sync.unavailable')}</Body>
      </Card>

      <Card>
        <Title>{t('settings.about.title')}</Title>
        <Body>{t('settings.app_version.value', { version: Constants.expoConfig?.version ?? '?' })}</Body>
        <Body>{t('settings.content_version.value', { version: manifest.contentVersion })}</Body>
      </Card>
    </Screen>
  );
}
