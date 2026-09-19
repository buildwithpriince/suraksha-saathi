import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { getScenario } from '@/content/scenarios';
import type { CertificateBody } from '@/core/certificates/bodies';
import { statusDisplay, type VerifyStatus } from '@/core/certificates/verify';

import { Badge } from './components';
import { colors, space } from './theme';

export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

export function StatusBadge({ status }: { status: VerifyStatus }) {
  const { t } = useTranslation();
  const { key, tone } = statusDisplay(status);
  return <Badge label={t(`verify.status.${key}`)} tone={tone} />;
}

/** Worker, site, modules and dates of a verified certificate body. */
export function CertificateDetails({ body }: { body: CertificateBody }) {
  const { t } = useTranslation();
  const rows: [string, string][] = [
    [t('cert.name.label'), body.wn],
    [t('cert.site.label'), body.site],
    [t('cert.issued.label'), formatDate(body.iat)],
    [t('cert.expires.label'), formatDate(body.exp)],
  ];
  return (
    <View style={styles.box}>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{value}</Text>
        </View>
      ))}
      {body.mods.map((m) => {
        const titleKey = getScenario(m.id)?.titleKey;
        return (
          <Text key={m.id} style={styles.module}>
            {t('cert.module.label', { module: titleKey ? t(titleKey) : m.id, score: m.s })}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.s },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.m },
  label: { fontSize: 16, color: colors.muted },
  value: { fontSize: 17, color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  module: { fontSize: 17, color: colors.text },
});
