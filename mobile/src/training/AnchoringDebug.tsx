import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { visibleFovDeg } from '@/core/player/layout';
import { Text } from '@/ui/Text';

import type { AnchoringMode, CameraFov } from './anchoringSetting';
import type { CameraDirection } from './useCameraDirection';

/** Which anchoring is live right now (D-039), shown during every camera drill. */
export type LiveAnchoring = 'marker' | 'sensor' | 'legacy';

export function liveAnchoring(mode: AnchoringMode, markerLocked: boolean): LiveAnchoring {
  if (mode === 'legacy') return 'legacy';
  return markerLocked ? 'marker' : 'sensor';
}

/** One short line: MARKER LOCK / SENSOR / LEGACY, and whether a gyroscope was found. */
export function AnchoringStatus({ live, gyro }: { live: LiveAnchoring; gyro: boolean }) {
  const { t } = useTranslation();
  return (
    <Text style={[styles.status, live === 'marker' ? styles.marker : live === 'legacy' ? styles.legacy : styles.sensor]}>
      {live === 'marker' ? '📍 ' : ''}
      {t(`training.anchor.status.${live}`)} · {t(gyro ? 'training.anchor.gyro.yes' : 'training.anchor.gyro.no')}
    </Text>
  );
}

/**
 * Settings → "Show anchoring debug overlay" (D-039): the numbers behind the anchoring, refreshed
 * 4 times a second on the JS thread (debug only).
 * - FOV in use and its source, with the view size it was computed for
 * - filter vs raw: how far the gyro filter and the compass-fused rotation vector disagree; small
 *   while turning if the gyroscope is read correctly
 * - marker residual: at the last HAZARD_A sighting, how far sensor anchoring had drifted from the
 *   marker, i.e. the real drift the marker just removed
 */
export function AnchoringDebug({
  camera,
  mode,
  fov,
  view,
  focalPx,
  markerResidual,
}: {
  camera: CameraDirection;
  mode: AnchoringMode;
  fov: CameraFov;
  view: { width: number; height: number };
  focalPx: number;
  markerResidual: () => number | null;
}) {
  const { t } = useTranslation();
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, []);
  const visible = visibleFovDeg(view.width, view.height, focalPx);
  const residual = markerResidual();
  const dir = camera.read();
  const rows = [
    t('training.debug.mode', { mode, gyro: camera.gyroAvailable ? t('training.anchor.gyro.yes') : t('training.anchor.gyro.no') }),
    t('training.debug.fov', {
      across: visible.across.toFixed(1),
      down: visible.down.toFixed(1),
      source: t(`training.debug.fov_source.${fov.source}`),
      lens: fov.longSideFovDeg.toFixed(1),
    }),
    t('training.debug.view', { w: Math.round(view.width), h: Math.round(view.height), f: Math.round(focalPx) }),
    t('training.debug.filter', { deg: mode === 'legacy' ? '—' : camera.readDisagreement().toFixed(1) }),
    t('training.debug.residual', { deg: residual === null ? '—' : residual.toFixed(1) }),
    t('training.debug.pose', { h: dir.headingDeg.toFixed(1), e: dir.elevationDeg.toFixed(1), speed: camera.readSpeed().toFixed(0) }),
  ];
  return (
    <View pointerEvents="none" style={styles.box}>
      {rows.map((row) => (
        <Text key={row} style={styles.row}>
          {row}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  status: { fontSize: 14, fontWeight: '800' },
  marker: { color: '#8CE99A' },
  sensor: { color: '#E4E7EB' },
  legacy: { color: '#FFD43B' },
  box: { backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: 8, padding: 8, gap: 2 },
  row: { color: '#FFFFFF', fontSize: 12, lineHeight: 17, fontFamily: 'monospace' },
});
