import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View, type TextStyle } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { getScenario } from '@/content/scenarios';
import { CARD_WIDTH_MM, cardHeightPx, cardWorkerId, pxPerMm } from '@/core/cards/walletCard';
import type { CertificateBody } from '@/core/certificates/bodies';
import type { WorkerRecord } from '@/core/sync/payloads';
import { workerCardText } from '@/core/workers/idCard';
import { formatDate } from '@/ui/CertificateDetails';
import { Text } from '@/ui/Text';
import { colors } from '@/ui/theme';

/** Height of the brand band across the top of every card, mm. */
const BAND_MM = 11;
/** Accent stripe along the bottom edge, mm. */
const STRIPE_MM = 1.4;
const MARGIN_MM = 3;
const STRIPE_COLOR = '#F2A516';

type Mm = (mm: number) => number;

/**
 * One line of card text, sized in millimetres so the card looks the same at any width and in the
 * shared image. The phone's font scale is ignored here (the card has a fixed layout); a line that
 * is still too long shrinks to fit instead of wrapping out of its box.
 */
function CardText({
  mm,
  size,
  weight = '400',
  color = colors.text,
  lines = 1,
  align,
  children,
}: {
  mm: Mm;
  size: number;
  weight?: TextStyle['fontWeight'];
  color?: string;
  lines?: number;
  align?: TextStyle['textAlign'];
  children: ReactNode;
}) {
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={lines}
      adjustsFontSizeToFit
      // Devanagari needs about 1.5 × the font size between lines for its marks
      style={{ fontSize: mm(size), lineHeight: mm(size * 1.5), fontWeight: weight, color, textAlign: align, includeFontPadding: false }}
    >
      {children}
    </Text>
  );
}

/** A small muted label above a bold value. `grow` shares a row equally with its neighbours. */
function Field({ mm, label, value, grow = false }: { mm: Mm; label: string; value: string; grow?: boolean }) {
  return (
    <View style={grow ? styles.grow : styles.shrink}>
      <CardText mm={mm} size={1.9} color={colors.muted}>
        {label}
      </CardText>
      <CardText mm={mm} size={2.7} weight="700">
        {value}
      </CardText>
    </View>
  );
}

/**
 * The shared wallet-card face (D-046): 85.6 × 54 mm drawn `width` px wide, with the brand band
 * (logo, "Suraksha Saathi" and its Devanagari name) and an accent stripe. The body is laid out by
 * the caller in millimetres. `cardRef` is the view `shareCard` captures. `bandRightMm` keeps the
 * brand text clear of something the body draws over the right of the band (the certificate QR).
 */
export function WalletCard({
  width,
  cardRef,
  accessibilityLabel,
  bandRightMm = MARGIN_MM,
  children,
}: {
  width: number;
  cardRef: RefObject<View | null>;
  accessibilityLabel: string;
  bandRightMm?: number;
  children: (mm: Mm) => ReactNode;
}) {
  const { t } = useTranslation();
  const scale = pxPerMm(width);
  const mm: Mm = (v) => v * scale;
  return (
    <View
      ref={cardRef}
      collapsable={false}
      accessible
      accessibilityLabel={accessibilityLabel}
      style={[styles.card, { width, height: cardHeightPx(width), borderRadius: mm(3.2) }]}
    >
      <View style={[styles.band, { height: mm(BAND_MM), paddingLeft: mm(MARGIN_MM), paddingRight: mm(bandRightMm), gap: mm(2) }]}>
        <View style={[styles.logoBox, { width: mm(8.4), height: mm(8.4), borderRadius: mm(1.6) }]}>
          <Image source={require('@/assets/logo-mark.png')} style={{ width: mm(7.4), height: mm(7.4) }} resizeMode="contain" />
        </View>
        <View style={styles.shrink}>
          <CardText mm={mm} size={3.3} weight="800" color="#FFFFFF">
            {t('card.brand.name')}
          </CardText>
          <CardText mm={mm} size={2.4} weight="600" color="#CFE0F0">
            {t('card.brand.subtitle')}
          </CardText>
        </View>
      </View>
      {children(mm)}
      <View style={[styles.stripe, { height: mm(STRIPE_MM) }]} />
    </View>
  );
}

/** Head-and-shoulders placeholder for a worker with no photo. */
function Silhouette({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 40 50" preserveAspectRatio="xMidYMid slice">
      <Rect x={0} y={0} width={40} height={50} fill="#E4E7EB" />
      <Circle cx={20} cy={19} r={9} fill="#9AA5B1" />
      <Path d="M3 50 C3 37 11 31 20 31 C29 31 37 37 37 50 Z" fill="#9AA5B1" />
    </Svg>
  );
}

/**
 * Worker ID card (D-034, D-046): photo (or a placeholder), name, worker ID, site, language and
 * issue date, and the kiosk login QR (`SW1:<uuid>`, error correction Q).
 */
export function WorkerIdCard({
  worker,
  photoUri,
  width,
  cardRef,
}: {
  worker: WorkerRecord;
  photoUri: string | null;
  width: number;
  cardRef: RefObject<View | null>;
}) {
  const { t } = useTranslation();
  const workerId = cardWorkerId(worker);
  const language = t(`lang.${worker.preferredLang}`, { defaultValue: worker.preferredLang });
  const issued = formatDate(worker.createdAt);
  const summary = [
    t('card.title'),
    worker.displayName,
    `${t('card.worker_id.label')}: ${workerId}`,
    `${t('cert.site.label')}: ${worker.siteCode}`,
    `${t('card.language.label')}: ${language}`,
    `${t('cert.issued.label')}: ${issued}`,
  ].join(', ');
  return (
    <WalletCard width={width} cardRef={cardRef} accessibilityLabel={summary}>
      {(mm) => {
        const top = BAND_MM + 2.5;
        // QR with its quiet zone (react-native-qrcode-svg draws the quiet zone outside `size`)
        const qr = 30.6;
        const quiet = 1.5;
        return (
          <>
            <View style={[styles.photo, { left: mm(MARGIN_MM), top: mm(top), width: mm(16), height: mm(20), borderRadius: mm(1.2) }]}>
              {photoUri !== null ? (
                <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" resizeMethod="resize" />
              ) : (
                <Silhouette width={mm(16)} height={mm(20)} />
              )}
            </View>
            <View style={[styles.column, { left: mm(21.5), top: mm(top - 0.6), width: mm(28), gap: mm(0.8) }]}>
              <CardText mm={mm} size={2.2} weight="700" color={colors.primary}>
                {t('card.title')}
              </CardText>
              <CardText mm={mm} size={3.4} weight="800" lines={2}>
                {worker.displayName}
              </CardText>
              <Field mm={mm} label={t('card.worker_id.label')} value={workerId} />
              <View style={[styles.row, { gap: mm(1.5) }]}>
                <Field grow mm={mm} label={t('cert.site.label')} value={worker.siteCode} />
                <Field grow mm={mm} label={t('card.language.label')} value={language} />
              </View>
              <Field mm={mm} label={t('cert.issued.label')} value={issued} />
            </View>
            <View style={[styles.column, { left: mm(CARD_WIDTH_MM - MARGIN_MM - qr), top: mm(top - 0.5), width: mm(qr), gap: mm(0.6) }]}>
              <QRCode value={workerCardText(worker.id)} size={mm(qr - 2 * quiet)} ecl="Q" quietZone={mm(quiet)} backgroundColor="#FFFFFF" />
              <CardText mm={mm} size={2} weight="600" color={colors.muted} align="center">
                {t('card.scan_login.label')}
              </CardText>
            </View>
          </>
        );
      }}
    </WalletCard>
  );
}

/**
 * Certificate card (D-046): name, site, each module with its score, issue and expiry dates, and
 * the signed `SS1` QR (error correction M, docs/04) as large as the card allows. Shared or printed;
 * inspectors scan the full-width QR on the certificate screen, which docs/04 sizes for a screen.
 */
export function CertificateCard({
  body,
  token,
  width,
  cardRef,
}: {
  body: CertificateBody;
  token: string;
  width: number;
  cardRef: RefObject<View | null>;
}) {
  const { t } = useTranslation();
  const modules = body.mods.map((m) => {
    const titleKey = getScenario(m.id)?.titleKey;
    return t('cert.module.label', { module: titleKey ? t(titleKey) : m.id, score: m.s });
  });
  // The QR panel: the code with its quiet zone, padded, overlapping the band on the right. The
  // token is about 800 bytes (109 modules): 42 mm with a 0.8 mm quiet zone gives 0.37 mm per module
  // on a printed card
  const qr = 42;
  const quiet = 0.8;
  const pad = 1.2;
  const panel = qr + 2 * pad;
  const summary = [
    t('cert.card.title'),
    body.wn,
    t('card.site.value', { site: body.site }),
    ...modules,
    `${t('cert.issued.label')}: ${formatDate(body.iat)}`,
    `${t('cert.expires.label')}: ${formatDate(body.exp)}`,
  ].join(', ');
  return (
    <WalletCard width={width} cardRef={cardRef} accessibilityLabel={summary} bandRightMm={MARGIN_MM + panel + 1.5}>
      {(mm) => (
        <>
          <View style={[styles.column, { left: mm(MARGIN_MM), top: mm(BAND_MM + 1.8), width: mm(CARD_WIDTH_MM - 2 * MARGIN_MM - panel - 1.5), gap: mm(0.7) }]}>
            <CardText mm={mm} size={2.2} weight="700" color={colors.primary}>
              {t('cert.card.title')}
            </CardText>
            <CardText mm={mm} size={3.4} weight="800">
              {body.wn}
            </CardText>
            <CardText mm={mm} size={2.4} color={colors.muted}>
              {t('card.site.value', { site: body.site })}
            </CardText>
            <View style={{ gap: mm(0.3), marginTop: mm(0.6) }}>
              {modules.map((line) => (
                <CardText key={line} mm={mm} size={2.5} weight="700" color={colors.green} lines={2}>
                  {`✓ ${line}`}
                </CardText>
              ))}
            </View>
            <View style={[styles.row, { gap: mm(1.5), marginTop: mm(0.6) }]}>
              <Field grow mm={mm} label={t('cert.issued.label')} value={formatDate(body.iat)} />
              <Field grow mm={mm} label={t('cert.expires.label')} value={formatDate(body.exp)} />
            </View>
          </View>
          {/* The QR panel overlaps the band so the code can use nearly the full card height */}
          <View
            style={[
              styles.qrPanel,
              { left: mm(CARD_WIDTH_MM - MARGIN_MM - panel), top: mm(2), width: mm(panel), padding: mm(pad), borderRadius: mm(1.6), gap: mm(0.3) },
            ]}
          >
            <QRCode value={token} size={mm(qr - 2 * quiet)} ecl="M" quietZone={mm(quiet)} backgroundColor="#FFFFFF" />
            <CardText mm={mm} size={2} weight="600" color={colors.muted} align="center">
              {t('cert.card.scan.label')}
            </CardText>
          </View>
        </>
      )}
    </WalletCard>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'center', backgroundColor: '#FFFFFF', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  band: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary },
  logoBox: { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  stripe: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: STRIPE_COLOR },
  photo: { position: 'absolute', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  column: { position: 'absolute' },
  row: { flexDirection: 'row' },
  shrink: { flexShrink: 1, minWidth: 0 },
  grow: { flex: 1, minWidth: 0 },
  qrPanel: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    elevation: 2,
  },
});
