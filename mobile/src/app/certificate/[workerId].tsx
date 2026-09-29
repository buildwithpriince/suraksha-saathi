import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { shareCard } from '@/cards/shareCard';
import { issueCertificate, missingModules, type IssueResult } from '@/certificates/issuance';
import { getScenario } from '@/content/scenarios';
import { cardWidthPx } from '@/core/cards/walletCard';
import { verifyCertificate } from '@/core/certificates/verify';
import { latestCertificate, type CertificateRecord } from '@/db/certificates';
import { nowSeconds } from '@/db/database';
import { getRevocationList } from '@/db/revocations';
import { TRUST } from '@/device/trust';
import { StatusBadge } from '@/ui/CertificateDetails';
import { DemoKeysBanner } from '@/ui/DemoKeysBanner';
import { Body, Button, Card, Screen } from '@/ui/components';
import { space } from '@/ui/theme';
import { CertificateCard } from '@/ui/WalletCard';

/** Widest the card is drawn on a tablet or in landscape, dp. */
const MAX_CARD_DP = 480;

/**
 * docs/04 "Issuance (on device, offline)": issue when eligible, then show the certificate as a
 * wallet card to share (D-046) and the full-width QR for an inspector to scan.
 */
export default function CertificateScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { workerId } = useLocalSearchParams<{ workerId: string }>();
  const [certificate, setCertificate] = useState<CertificateRecord | null>(() => latestCertificate(workerId));
  const [outcome, setOutcome] = useState<IssueResult | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const card = useRef<View>(null);
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
  const share = () => {
    setSharing(true);
    setShareFailed(false);
    shareCard(card, t('card.share.button'))
      .then((ok) => setShareFailed(!ok))
      .catch(() => setShareFailed(true))
      .finally(() => setSharing(false));
  };
  const moduleNames = missing.map((id) => {
    const key = getScenario(id)?.titleKey;
    return key ? t(key) : id;
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: t('cert.title') }} />
      <DemoKeysBanner />

      {certificate !== null && check !== null ? (
        <>
          <StatusBadge status={check.status} />
          {check.certificate !== undefined ? (
            <>
              <CertificateCard
                body={check.certificate}
                token={certificate.token}
                width={cardWidthPx(width - 2 * space.l, MAX_CARD_DP)}
                cardRef={card}
              />
              {shareFailed ? <Body>{t('card.share.failed')}</Body> : null}
              <Button label={t('card.share.button')} onPress={share} disabled={sharing} />
            </>
          ) : null}
          <Card>
            <View style={styles.qr} accessibilityLabel={t('cert.show.hint')}>
              {/* docs/04: error correction M, at least 60% of the screen width, with a quiet zone */}
              <QRCode value={certificate.token} size={Math.round(width * 0.8)} ecl="M" quietZone={16} backgroundColor="#FFFFFF" />
            </View>
            <Body muted>{t('cert.show.hint')}</Body>
          </Card>
        </>
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
