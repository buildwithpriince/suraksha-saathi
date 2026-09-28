import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { SensorType, useAnimatedSensor, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { directionErrorDeg, integrateGyro, isPlausibleLongSideFov, predictedDxPx, solveFocalFromTurn } from '@/core/calibration';
import { IDENTITY, cameraDirection, quatConjugate, quatMultiply, type Direction, type Quaternion } from '@/core/orientation';
import { CAMERA_LONG_SIDE_FOV_DEG, focalLengthPx, longSideFovFromFocal, visibleFovDeg } from '@/core/player/layout';
import { clearCameraFov, getAnchoringMode, getCameraFov, saveCameraFov } from '@/training/anchoringSetting';
import { useCameraDirection } from '@/training/useCameraDirection';
import { Button, Card, Screen, Segmented, Title } from '@/ui/components';
import { Text } from '@/ui/Text';
import { space } from '@/ui/theme';

/** The FOV guide line, as a fraction of the view width from the left edge. */
const GUIDE_X = 0.12;

type Tool = 'fov' | 'selftest';
type FovPhase = 'aim' | 'turn' | 'result';
type TestPhase = 'aim' | 'away' | 'back' | 'result';

/**
 * Hidden camera calibration (D-039; long-press Settings on Home).
 * - Field of view: aim the centre ring at a real object, turn right until the same object is on
 *   the guide line; the gyroscope's measured turn and the known pixel offset fix the preview's
 *   focal length exactly (core/calibration.ts). Averaged over several turns and saved; training
 *   then uses it instead of the assumed lens FOV.
 * - Rotation self-test: aim at an object, turn ≥ 90° away, come back and aim at it again. The
 *   error is how far the orientation estimate moved in between, for the anchoring in use and for
 *   the raw rotation sensor side by side.
 */
export default function CalibrateScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [tool, setTool] = useState<Tool>('fov');
  const [view, setView] = useState<{ width: number; height: number } | null>(null);
  const mode = useMemo(getAnchoringMode, []);
  const camera = useCameraDirection(mode);
  const [saved, setSaved] = useState(() => getCameraFov(CAMERA_LONG_SIDE_FOV_DEG));

  // Pure gyroscope integration between the two FOV marks
  const gyro = useAnimatedSensor(SensorType.GYROSCOPE, { interval: 16 });
  const turn = useSharedValue<Quaternion>(IDENTITY);
  const armed = useSharedValue(false);
  useFrameCallback((frame) => {
    'worklet';
    if (!armed.value) return;
    const g = gyro.sensor.value;
    turn.value = integrateGyro(turn.value, { x: g.x, y: g.y, z: g.z }, (frame.timeSincePreviousFrame ?? 16) / 1000);
  });
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 200);
    return () => clearInterval(id);
  }, []);

  // --- Field of view ---
  const [fovPhase, setFovPhase] = useState<FovPhase>('aim');
  const [startQ, setStartQ] = useState<Quaternion>(IDENTITY);
  const [samples, setSamples] = useState<number[]>([]);
  const [last, setLast] = useState<{ lens: number; across: number; offDeg: number } | null | 'bad'>(null);

  /** The turn since the first mark: pure gyro if the phone has one, else the orientation estimate. */
  const currentTurn = (): Quaternion => (gyro.isAvailable ? turn.get() : quatMultiply(quatConjugate(startQ), camera.readOrientation()));
  const turnedDeg = (q: Quaternion) => {
    const w = Math.min(1, Math.abs(q.qw));
    return (2 * Math.acos(w) * 180) / Math.PI;
  };

  const markFov = () => {
    if (view === null) return;
    if (fovPhase !== 'turn') {
      turn.set(IDENTITY);
      armed.set(true);
      setStartQ(camera.readOrientation());
      setFovPhase('turn');
      return;
    }
    armed.set(false);
    const q = currentTurn();
    const dxLine = view.width * GUIDE_X - view.width / 2;
    const f = solveFocalFromTurn(q, dxLine);
    const lens = f === null ? NaN : longSideFovFromFocal(view.width, view.height, f);
    if (f === null || !isPlausibleLongSideFov(lens)) {
      setLast('bad');
    } else {
      // How far the overlay was off at the guide line with the FOV training uses now
      const inUse = focalLengthPx(view.width, view.height, saved.longSideFovDeg);
      const offDeg = Math.abs(Math.atan(predictedDxPx(q, inUse) / f) - Math.atan(dxLine / f)) * (180 / Math.PI);
      setSamples((s) => [...s, lens]);
      setLast({ lens, across: visibleFovDeg(view.width, view.height, f).across, offDeg });
    }
    setFovPhase('result');
  };
  const meanLens = samples.length === 0 ? null : samples.reduce((a, b) => a + b, 0) / samples.length;

  // --- Rotation self-test ---
  const [testPhase, setTestPhase] = useState<TestPhase>('aim');
  const [start, setStart] = useState<{ filtered: Direction; raw: Direction } | null>(null);
  const [furthest, setFurthest] = useState(0);
  const [testResult, setTestResult] = useState<{ filtered: number; raw: number } | null>(null);
  const awayDeg = start === null ? 0 : directionErrorDeg(start.filtered, camera.read());
  useEffect(() => {
    if (testPhase !== 'away') return;
    setFurthest((m) => Math.max(m, awayDeg));
    if (awayDeg >= 90) setTestPhase('back');
  }, [testPhase, awayDeg]);

  const markTest = () => {
    const now = { filtered: camera.read(), raw: cameraDirection(camera.readReference()) };
    if (testPhase === 'aim' || testPhase === 'result') {
      setStart(now);
      setFurthest(0);
      setTestResult(null);
      setTestPhase('away');
    } else if (testPhase === 'back' && start !== null) {
      setTestResult({ filtered: directionErrorDeg(start.filtered, now.filtered), raw: directionErrorDeg(start.raw, now.raw) });
      setTestPhase('result');
    }
  };

  if (permission === null) return null;
  if (!permission.granted) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('calibrate.title') }} />
        <Card>
          <Title>{t('training.camera.title')}</Title>
          <Button label={t('training.camera.allow.button')} onPress={() => void requestPermission()} />
        </Card>
      </Screen>
    );
  }

  const lines: string[] = [t('calibrate.current', { lens: saved.longSideFovDeg.toFixed(1), source: t(`training.debug.fov_source.${saved.source}`) })];
  if (!gyro.isAvailable) lines.push(t('calibrate.no_gyro'));
  if (tool === 'fov') {
    if (fovPhase === 'aim') lines.push(t('calibrate.fov.aim'));
    if (fovPhase === 'turn') lines.push(t('calibrate.fov.turn'), t('calibrate.fov.turned', { deg: turnedDeg(currentTurn()).toFixed(1) }));
    if (fovPhase === 'result') {
      if (last === 'bad') lines.push(t('calibrate.fov.bad'));
      else if (last !== null) {
        lines.push(t('calibrate.fov.result', { across: last.across.toFixed(1), lens: last.lens.toFixed(1) }));
        lines.push(t('calibrate.fov.error_before', { deg: last.offDeg.toFixed(1), source: t(`training.debug.fov_source.${saved.source}`) }));
      }
      if (meanLens !== null) lines.push(t('calibrate.fov.samples', { count: samples.length, lens: meanLens.toFixed(1) }));
    }
  } else {
    if (testPhase === 'aim') lines.push(t('calibrate.selftest.aim'));
    if (testPhase === 'away') lines.push(t('calibrate.selftest.away', { deg: awayDeg.toFixed(0), max: furthest.toFixed(0) }));
    if (testPhase === 'back') lines.push(t('calibrate.selftest.back'));
    if (testResult !== null) {
      lines.push(t('calibrate.selftest.result', { filtered: testResult.filtered.toFixed(1), raw: testResult.raw.toFixed(1), mode: t(`settings.anchoring.${mode}`) }));
    }
  }

  return (
    <View style={styles.root} onLayout={(e) => setView({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <CameraView style={StyleSheet.absoluteFill} facing="back" />
      {/* Centre ring, and the FOV guide line */}
      {view !== null ? (
        <>
          <View pointerEvents="none" style={[styles.ring, { left: view.width / 2 - 20, top: view.height / 2 - 20 }]} />
          {tool === 'fov' && fovPhase === 'turn' ? <View pointerEvents="none" style={[styles.guide, { left: view.width * GUIDE_X - 2 }]} /> : null}
        </>
      ) : null}
      <SafeAreaView style={styles.chrome} pointerEvents="box-none">
        <View style={styles.card}>
          <Segmented
            options={[
              { value: 'fov', label: t('calibrate.tab.fov') },
              { value: 'selftest', label: t('calibrate.tab.selftest') },
            ]}
            value={tool}
            onChange={setTool}
          />
          {lines.map((line) => (
            <Text key={line} style={styles.line}>
              {line}
            </Text>
          ))}
        </View>
        <View style={styles.bottom}>
          {tool === 'fov' ? (
            <>
              {fovPhase === 'result' && meanLens !== null ? (
                <Pressable
                  accessibilityRole="button"
                  style={styles.primary}
                  onPress={() => {
                    saveCameraFov(meanLens, samples.length);
                    setSaved(getCameraFov(CAMERA_LONG_SIDE_FOV_DEG));
                  }}
                >
                  <Text style={styles.primaryText}>{t('calibrate.save.button', { lens: meanLens.toFixed(1) })}</Text>
                </Pressable>
              ) : null}
              <Pressable accessibilityRole="button" style={styles.primary} onPress={markFov}>
                <Text style={styles.primaryText}>{t(fovPhase === 'result' ? 'calibrate.again.button' : 'calibrate.mark.button')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.secondary}
                onPress={() => {
                  clearCameraFov();
                  setSamples([]);
                  setSaved({ longSideFovDeg: CAMERA_LONG_SIDE_FOV_DEG, source: 'default', samples: 0 });
                }}
              >
                <Text style={styles.secondaryText}>{t('calibrate.reset.button')}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable accessibilityRole="button" style={[styles.primary, testPhase === 'away' && styles.disabled]} disabled={testPhase === 'away'} onPress={markTest}>
              <Text style={styles.primaryText}>{t(testPhase === 'back' ? 'training.done.button' : 'calibrate.start.button')}</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => router.back()}>
            <Text style={styles.secondaryText}>{t('calibrate.close.button')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  ring: { position: 'absolute', width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: '#FFFFFF' },
  guide: { position: 'absolute', top: 0, bottom: 0, width: 4, backgroundColor: '#FFD43B' },
  chrome: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'space-between', padding: space.m },
  card: { backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: 14, padding: space.m, gap: space.s },
  line: { color: '#FFFFFF', fontSize: 16, lineHeight: 24 },
  bottom: { gap: space.s },
  primary: { minHeight: 56, borderRadius: 12, backgroundColor: '#0B3D63', alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.m },
  primaryText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  secondary: { minHeight: 48, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.45 },
});
