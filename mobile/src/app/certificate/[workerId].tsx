import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { issueCertificate, missingModules, type IssueResult } from '@/certificates/issuance';
import { getScenario } from '@/content/scenarios';
import { verifyCertificate } from '@/core/certificates/verify';
import { latestCertificate, type CertificateRecord } from '@/db/certificates';
import { nowSeconds } from '@/db/database';
import { getRevocationList } from '@/db/revocations';
import { TRUST } from '@/device/trust';
import { CertificateDetails, StatusBadge } from '@/ui/CertificateDetails';
import { DemoKeysBanner } from '@/ui/DemoKeysBanner';
import { Body, Button, Card, Screen } from '@/ui/components';
import { space } from '@/ui/theme';

/** docs/04 "Issuance (on device, offline)": issue when eligible, then show the QR. */
export default function CertificateScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { workerId } = useLocalSearchParams<{ workerId: string }>();
  const [certificate, setCertificate] = useState<CertificateRecord | null>(() => latestCertificate(workerId));
  const [outcome, setOutcome] = useState<IssueResult | null>(null);
  const missing = missingModules(workerId);

  const issue = () => {
    const result = issueCertificate(workerId);
    setOutcome(result);
    if (result.kind === 'issued') setCertificate(result.certificate);
  };

  const check =
    certificate === null || TRUST.mode === 'unconfigured'
      ? null
      : verifyCertificate(certificate.token, {
          rootPublicKey: TRUST.rootPublicKey,
          now: nowSeconds(),
          revocationList: getRevocationList()?.token ?? null,
        });
  const moduleNames = missing.map((id) => {
    const key = getScenario(id)?.titleKey;
    return key ? t(key) : id;
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: t('cert.title') }} />
      <DemoKeysBanner />

      {certificate !== null && check !== null ? (
        <Card>
          <StatusBadge status={check.status} />
          <View style={styles.qr} accessibilityLabel={t('cert.show.hint')}>
            {/* docs/04: error correction M, at least 60% of the screen width, with a quiet zone */}
            <QRCode value={certificate.token} size={Math.round(width * 0.8)} ecl="M" quietZone={16} backgroundColor="#FFFFFF" />
          </View>
          <Body muted>{t('cert.show.hint')}</Body>
          {check.certificate !== undefined ? <CertificateDetails body={check.certificate} /> : null}
        </Card>
      ) : null}

      <Card>
        {TRUST.mode === 'unconfigured' ? <Body>{t('cert.untrusted.label')}</Body> : null}
        {missing.length > 0 ? <Body>{t('cert.missing.label', { modules: moduleNames.join(', ') })}</Body> : null}
        {outcome?.kind === 'not_approved' ? <Body>{t('cert.not_approved.label')}</Body> : null}
        <Button
          kind={certificate === null ? 'primary' : 'secondary'}
          label={t(certificate === null ? 'cert.issue.button' : 'cert.reissue.button')}
          disabled={missing.length > 0 || TRUST.mode === 'unconfigured'}
          onPress={issue}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  qr: { alignItems: 'center', paddingVertical: space.s },
});
