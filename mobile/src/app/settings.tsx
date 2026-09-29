import manifest from '@content/manifest.json';
import Constants from 'expo-constants';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usableAttestation } from '@/core/certificates/issue';
import { lastSyncAt, nowSeconds, outboxCount } from '@/db/database';
import { getDevice } from '@/db/device';
import { TRUST } from '@/device/trust';
import { isAutoSpeechMuted, setAutoSpeechMuted } from '@/i18n/speech';
import { formatDate } from '@/ui/CertificateDetails';
import { DemoKeysBanner } from '@/ui/DemoKeysBanner';
import { getAnchoringMode, getDebugOverlay, setAnchoringMode, setDebugOverlay, type AnchoringMode } from '@/training/anchoringSetting';
import { LanguageSwitcher } from '@/ui/LanguageSwitcher';
import { Body, Button, Card, Screen, Segmented, Title } from '@/ui/components';

/** docs/01 Settings: language, this device's status, sync, and versions (T-41). */
export default function SettingsScreen() {
  const { t } = useTranslation();
  const [device, setDevice] = useState(getDevice);
  const [pending, setPending] = useState(0);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [anchoring, setAnchoring] = useState<AnchoringMode>(getAnchoringMode);
  const [debugOverlay, setDebugOverlayState] = useState(getDebugOverlay);
  const [muted, setMuted] = useState(isAutoSpeechMuted);

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

      {/* D-041: steps read themselves aloud; this mutes that, Replay still speaks */}
      <Card>
        <Title>{t('settings.narration.title')}</Title>
        <Body>{t('settings.narration.body')}</Body>
        <Segmented
          options={[
            { value: 'on', label: t('settings.narration.on') },
            { value: 'off', label: t('settings.narration.off') },
          ]}
          value={muted ? 'off' : 'on'}
          onChange={(v) => {
            setAutoSpeechMuted(v === 'off');
            setMuted(v === 'off');
          }}
        />
      </Card>

      {/* D-036: the old anchoring maths stays one tap away in case the new one misbehaves on a phone */}
      <Card>
        <Title>{t('settings.anchoring.title')}</Title>
        <Body>{t('settings.anchoring.body')}</Body>
        <Segmented
          options={[
            { value: 'stabilised', label: t('settings.anchoring.stabilised') },
            { value: 'legacy', label: t('settings.anchoring.legacy') },
          ]}
          value={anchoring}
          onChange={(mode) => {
            setAnchoringMode(mode);
            setAnchoring(mode);
          }}
        />
        <Body>{t('settings.anchoring.debug.label')}</Body>
        <Segmented
          options={[
            { value: 'off', label: t('settings.anchoring.debug.off') },
            { value: 'on', label: t('settings.anchoring.debug.on') },
          ]}
          value={debugOverlay ? 'on' : 'off'}
          onChange={(v) => {
            setDebugOverlay(v === 'on');
            setDebugOverlayState(v === 'on');
          }}
        />
        <Body muted>{t('settings.anchoring.note')}</Body>
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
