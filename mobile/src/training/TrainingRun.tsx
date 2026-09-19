import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { buildAttemptResult } from '@/core/assessment/result';
import type { AttemptMode } from '@/core/assessment/types';
import { isBehind, type Direction } from '@/core/orientation';
import { FIRE_SIZE_DEG, LABEL_BOX_PX, PREVIEW_HFOV_DEG, type Band } from '@/core/player/layout';
import { PREFABS, VIRTUAL_MARKER_OFFSET, offsetFrom, zoneAt, type Offset, type Prefab } from '@/core/player/prefabs';
import { HOLD_SAMPLE_SEC, SKIP_OFFER_AFTER_SEC, ScenarioSession, type CurrentStep } from '@/core/player/session';
import { tapWaypoint } from '@/core/player/waypoints';
import { distanceM, hazardDetector, markedRadiusM, readingAt } from '@/core/player/zone';
import { MULTI_SELECT, type Scenario } from '@/core/scenarios/types';
import { pickVariant, stepOptions } from '@/core/scenarios/variants';
import { saveAttempt } from '@/db/attempts';
import { newId, nowSeconds } from '@/db/database';
import { speakKey, stopSpeaking } from '@/i18n/speech';
import { randomBytes } from '@/platform/random';
import { Text } from '@/ui/Text';
import { colors, space } from '@/ui/theme';

import { Anchored, Cone, Fire, GasCloud, Reticle, RouteArrow, TargetButton, Waypoint, type ScreenGeometry } from './overlays';
import { useCameraDirection } from './useCameraDirection';

const EMPTY_PREFAB: Prefab = { objects: {}, labels: {}, zones: {}, paths: {} };
const WAYPOINT_PX = 64;
/** Space kept between a pinned overlay and the screen edge, card or bottom panel (D-033). */
const PIN_GAP_PX = 8;

function randomSeed(): number {
  const b = randomBytes(4);
  return ((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!) >>> 1; // non-negative 31-bit
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

interface Attempt {
  session: ScenarioSession;
  attemptId: string;
  seed: number;
  startedAt: number;
}

function startAttempt(scenario: Scenario): Attempt {
  const seed = randomSeed();
  const t0 = performance.now();
  const session = new ScenarioSession(scenario, pickVariant(scenario, seed).id, () => (performance.now() - t0) / 1000);
  session.start();
  return { session, attemptId: newId(), seed, startedAt: nowSeconds() };
}

/** Plays one attempt of any scenario over the camera feed (`ar`) or a plain virtual room (`tabletop`). */
export function TrainingRun({ scenario, workerId, mode }: { scenario: Scenario; workerId: string; mode: AttemptMode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const geometry: ScreenGeometry = useMemo(() => ({ cx: width / 2, cy: height / 2, pxPerDeg: width / PREVIEW_HFOV_DEG }), [width, height]);
  const camera = useCameraDirection();
  const anchor = useSharedValue<Direction | null>(null);
  // The same anchor for the JS thread: render and handlers read this, worklets read `anchor`
  // (Reanimated warns when a shared value is read during render)
  const placedAnchor = useRef<Direction | null>(null);
  const fireLevel = useSharedValue(1);
  const gasLevel = useSharedValue(0);

  const attempt = useRef<Attempt | null>(null);
  if (attempt.current === null) attempt.current = startAttempt(scenario);
  const { session } = attempt.current;

  const [, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const cur = session.current();
  const stepIndex = cur?.index ?? -1;

  const prefab = useMemo(() => {
    const place = scenario.steps.find((s) => s.interaction === 'place_on_plane');
    return PREFABS[String(place?.params.prefab)] ?? EMPTY_PREFAB;
  }, [scenario]);
  const markers = scenario.setup.markers;
  const exitHeading = useRef<number | null>(null);
  const handledScan = useRef(-1);
  const [waypoint, setWaypoint] = useState(0);
  const [held, setHeld] = useState(0);
  const [holding, setHolding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [cones, setCones] = useState<{ id: number; at: Offset }[]>([]);
  const nextConeId = useRef(0);
  const [, setTick] = useState(0);
  // Free screen space between the instruction card and the bottom panel, in screen px
  const [cardBottom, setCardBottom] = useState(0);
  const [panelTop, setPanelTop] = useState(height);
  // "Skip step" (D-033): session time and event count at the last sign of progress in this step
  const lastProgress = useRef({ at: 0, events: 0 });
  const [canSkip, setCanSkip] = useState(false);

  const progressed = () => {
    lastProgress.current = { at: session.now(), events: session.events.length };
    setCanSkip(false);
  };

  // Each new step: reset per-step state, apply prefab effects, speak the instruction
  useEffect(() => {
    if (cur === null) return;
    setWaypoint(0);
    setHeld(0);
    setHolding(false);
    setPicked([]);
    setCones([]);
    progressed();
    const effect = prefab.stepEffects?.[cur.step.id];
    if (effect?.fireLevel !== undefined) fireLevel.value = withTiming(effect.fireLevel, { duration: 1500 });
    if (effect?.gasLevel !== undefined) gasLevel.value = withTiming(effect.gasLevel, { duration: 2500 });
    speakKey(cur.step.audioKey, () => {
      // narration auto-advances when its audio ends (docs/02)
      const now = session.current();
      if (cur.step.interaction === 'narration' && now?.index === cur.index) {
        session.complete();
        refresh();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  // No new event and no UI progress for SKIP_OFFER_AFTER_SEC: offer "Skip step"
  useEffect(() => {
    if (stepIndex < 0) return;
    const id = setInterval(() => {
      if (session.events.length !== lastProgress.current.events) progressed();
      else if (session.now() - lastProgress.current.at >= SKIP_OFFER_AFTER_SEC) setCanSkip(true);
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, session]);

  // Countdown for steps with a UI time limit
  useEffect(() => {
    if (cur?.step.timeLimitSec === undefined) return;
    const id = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(id);
  }, [stepIndex, cur?.step.timeLimitSec]);

  // aim_and_hold: one sample per 0.25 s while the spray button is held
  useEffect(() => {
    if (!holding || cur?.step.interaction !== 'aim_and_hold') return;
    const index = cur.index;
    const id = setInterval(() => {
      const a = placedAnchor.current;
      const zone = a === null ? 'none' : zoneAt(prefab, offsetFrom(a, camera.read()));
      setHeld(session.holdSample(zone));
      if (session.current()?.index !== index) {
        setHolding(false);
        refresh();
      }
    }, HOLD_SAMPLE_SEC * 1000);
    return () => clearInterval(id);
  }, [holding, cur?.index, cur?.step.interaction, camera, prefab, session, refresh]);

  // Finished (all steps done or stopped): score, store with its outbox row, show the result
  const saved = useRef(false);
  useEffect(() => {
    if (!session.finished || saved.current || attempt.current === null) return;
    saved.current = true;
    stopSpeaking();
    const { attemptId, seed, startedAt } = attempt.current;
    const { result, eventsJson } = buildAttemptResult({
      attemptId,
      scenario,
      variant: session.variantId,
      seed,
      mode,
      startedAt,
      durationSec: session.now(),
      events: session.events,
    });
    saveAttempt(workerId, result, session.events, eventsJson);
    router.replace({ pathname: '/result/[attemptId]', params: { attemptId } });
  });

  const exitHeadingNow = (): number | null => {
    if (exitHeading.current !== null) return exitHeading.current;
    const a = placedAnchor.current;
    // Tabletop: the stand-in exit sign's direction
    return mode === 'tabletop' && a !== null ? (a.headingDeg + VIRTUAL_MARKER_OFFSET.dh) % 360 : null;
  };

  const markerReached = (c: CurrentStep, marker: string) => {
    if (c.step.interaction === 'find_marker') {
      exitHeading.current = mode === 'ar' ? camera.read().headingDeg : exitHeadingNow();
      session.record('marker_found', { marker });
      session.complete();
    } else {
      // No position tracking (D-027): reaching a marker means scanning it, so no distance is known
      session.arrive(marker, null);
    }
    refresh();
  };

  const wantedMarker = (c: CurrentStep | null): string | null => {
    if (c === null) return null;
    if (c.step.interaction === 'find_marker') return String(c.params.marker);
    if (c.step.interaction === 'move_to' && markers.includes(String(c.params.anchor))) return String(c.params.anchor);
    return null;
  };

  const onScan = (scan: BarcodeScanningResult) => {
    const c = session.current();
    const marker = wantedMarker(c);
    if (c === null || marker === null || scan.data !== marker || handledScan.current === c.index) return;
    handledScan.current = c.index;
    markerReached(c, marker);
  };

  /** The world direction under a screen tap. */
  const tapDirection = (e: GestureResponderEvent): Direction => {
    const cam = camera.read();
    return {
      headingDeg: (cam.headingDeg + (e.nativeEvent.locationX - geometry.cx) / geometry.pxPerDeg + 360) % 360,
      elevationDeg: cam.elevationDeg - (e.nativeEvent.locationY - geometry.cy) / geometry.pxPerDeg,
    };
  };

  const onPlace = (e: GestureResponderEvent) => {
    const c = session.current();
    if (c?.step.interaction !== 'place_on_plane') return;
    const placed = tapDirection(e);
    anchor.set(placed);
    placedAnchor.current = placed;
    session.complete({ headingDeg: round1(placed.headingDeg), elevationDeg: round1(placed.elevationDeg) });
    refresh();
  };

  const onCone = (e: GestureResponderEvent) => {
    const a = placedAnchor.current;
    if (session.current()?.step.interaction !== 'mark_zone' || a === null) return;
    const at = offsetFrom(a, tapDirection(e));
    nextConeId.current += 1;
    setCones((placed) => [...placed, { id: nextConeId.current, at }]);
    progressed();
  };

  /** mark_zone Done: the mean cone distance becomes `zone_marked.radiusM` (D-031). */
  const finishZone = () => {
    const c = session.current();
    if (c?.step.interaction !== 'mark_zone' || cones.length < Number(c.params.minCones ?? 1)) return;
    const radiusM = markedRadiusM(prefab, String(c.params.hazard), cones.map((cone) => cone.at));
    session.record('zone_marked', { radiusM });
    session.complete();
    refresh();
  };

  /**
   * choose_many / checklist Done: the picked options, in the step's option order. `index` is the
   * step the button was drawn for, so a double tap can't answer the next step with this selection.
   */
  const finishChoice = (index: number) => {
    const c = session.current();
    if (c?.index !== index || !MULTI_SELECT.includes(c.step.interaction)) return;
    session.chooseMany(stepOptions(c.step).map((o) => o.id).filter((id) => picked.includes(id)));
    refresh();
  };

  /** A path mark tapped: any mark not yet reached counts (waypoints.ts); the last one is arrival. */
  const onWaypoint = (i: number, pathLength: number, index: number) => {
    const c = session.current();
    const tap = c?.index === index && c.step.interaction === 'move_to' ? tapWaypoint(waypoint, i, pathLength) : null;
    if (__DEV__) console.log(`[training] waypoint ${i + 1}/${pathLength} tapped in ${c?.step.id}: ${tap === null ? 'ignored' : `reached ${tap.reached}`}`);
    if (c === null || tap === null) return;
    progressed();
    if (!tap.arrived) {
      setWaypoint(tap.reached);
      return;
    }
    const behind = c.params.exitBehind as { minAngleDeg: number } | undefined;
    const exit = behind === undefined ? null : exitHeadingNow();
    session.arrive(
      String(c.params.anchor),
      0,
      behind === undefined ? undefined : { exitBehind: exit !== null && isBehind(exit, camera.read().headingDeg, behind.minAngleDeg) },
    );
    refresh();
  };

  /**
   * "Skip step" after SKIP_OFFER_AFTER_SEC without progress (D-033): the step is recorded as
   * `step_skipped` and the engine scores it as failed. `index` guards against a double tap.
   */
  const onSkip = (index: number) => {
    const c = session.current();
    if (c?.index !== index) return;
    if (c.step.interaction === 'place_on_plane' && placedAnchor.current === null) {
      // Placement isn't scored, but later steps need the overlay: put it where the camera points
      const placed = camera.read();
      anchor.set(placed);
      placedAnchor.current = placed;
    }
    if (__DEV__) console.log(`[training] step ${c.step.id} skipped after no progress: scored as failed`);
    session.skip();
    refresh();
  };

  const interaction = cur?.step.interaction;
  const scanning = mode === 'ar' && wantedMarker(cur) !== null;
  const path = interaction === 'move_to' && cur !== null ? prefab.paths[String(cur.params.anchor)] : undefined;
  const tapTarget = interaction === 'tap_target' ? String(cur?.params.target) : null;
  const fireSize = FIRE_SIZE_DEG * geometry.pxPerDeg;
  const stepStart = cur === null ? 0 : ([...session.events].reverse().find((e) => e.type === 'step_started')?.t ?? 0);
  const remaining = cur?.step.timeLimitSec === undefined ? null : Math.max(0, Math.ceil(cur.step.timeLimitSec - (session.now() - stepStart)));
  const detector = interaction === 'move_to' ? (cur?.params.detector as { peakReading: number } | undefined) : undefined;
  const multiSelect = cur !== null && MULTI_SELECT.includes(cur.step.interaction);
  const zoneHazard = interaction === 'mark_zone' && cur !== null ? String(cur.params.hazard) : null;
  const minCones = interaction === 'mark_zone' && cur !== null ? Number(cur.params.minCones ?? 1) : 0;
  const zoneDetector = useMemo(
    () => (zoneHazard === null ? null : hazardDetector(scenario, session.variantId, zoneHazard)),
    [zoneHazard, scenario, session],
  );
  const coneReading = (at: Offset): string | null => {
    if (zoneHazard === null || zoneDetector === null || cur === null) return null;
    const reading = readingAt(distanceM(prefab, zoneHazard, at), zoneDetector, Number(cur.params.trueRadiusM));
    return t('training.detector.label', { reading });
  };
  // Where the centre of an overlay the worker must tap may go (D-033): clear of the card, the
  // bottom panel and the screen edges
  const bandFor = useCallback(
    (w: number, h: number): Band => ({
      left: w / 2 + PIN_GAP_PX,
      right: width - w / 2 - PIN_GAP_PX,
      top: cardBottom + h / 2 + PIN_GAP_PX,
      bottom: panelTop - h / 2 - PIN_GAP_PX,
    }),
    [width, cardBottom, panelTop],
  );
  const waypointBand = useMemo(() => bandFor(WAYPOINT_PX, WAYPOINT_PX), [bandFor]);
  const labelBand = useMemo(() => bandFor(LABEL_BOX_PX.width, LABEL_BOX_PX.height), [bandFor]);
  const cloudAt = prefab.cloud === undefined ? undefined : prefab.objects[prefab.cloud.at];
  const cloudSize = (prefab.cloud?.sizeDeg ?? 0) * geometry.pxPerDeg;

  // showRoute: towards the exit marker, or towards the next waypoint of a scene-anchor path
  const routeHeading = (): number | null => {
    if (cur === null || interaction !== 'move_to' || cur.params.showRoute !== true) return null;
    if (wantedMarker(cur) !== null) return exitHeadingNow();
    const a = placedAnchor.current;
    const next = path?.[waypoint];
    return a === null || next === undefined ? null : (a.headingDeg + next.dh + 360) % 360;
  };
  const route = routeHeading();

  const hint = (() => {
    if (cur === null) return null;
    if (wantedMarker(cur) !== null) return t(mode === 'ar' ? 'training.hint.scan_marker' : 'training.hint.tap_marker');
    if (path !== undefined) return t('training.hint.waypoints');
    if (interaction === 'aim_and_hold') return t('training.hint.hold');
    if (interaction === 'tap_target') return t('training.hint.target');
    if (interaction === 'choose_many') return t('training.hint.choose_many');
    if (interaction === 'checklist') return t('training.hint.checklist');
    if (interaction === 'mark_zone') return t('training.hint.mark_zone');
    return null;
  })();

  return (
    <View style={styles.root}>
      {mode === 'ar' ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanning ? onScan : undefined}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.tabletop]} />
      )}

      {interaction === 'place_on_plane' ? <Pressable style={StyleSheet.absoluteFill} onPress={onPlace} /> : null}
      {interaction === 'mark_zone' ? (
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel={t('training.hint.mark_zone')} onPress={onCone} />
      ) : null}

      {prefab.objects.Fire !== undefined ? (
        <Anchored anchor={anchor} offset={prefab.objects.Fire} direction={camera.direction} geometry={geometry} width={fireSize} height={fireSize}>
          <Fire size={fireSize} level={fireLevel} />
        </Anchored>
      ) : null}

      {cloudAt !== undefined ? (
        <Anchored anchor={anchor} offset={cloudAt} direction={camera.direction} geometry={geometry} width={cloudSize} height={cloudSize}>
          <GasCloud size={cloudSize} level={gasLevel} />
        </Anchored>
      ) : null}

      {Object.entries(prefab.labels)
        .filter(([name]) => prefab.objects[name] !== undefined)
        .map(([name, labelKey]) => (
          <Anchored
            key={name}
            anchor={anchor}
            offset={prefab.objects[name]!}
            direction={camera.direction}
            geometry={geometry}
            width={LABEL_BOX_PX.width}
            height={LABEL_BOX_PX.height}
            band={tapTarget === name ? labelBand : undefined}
          >
            <TargetButton
              label={t(labelKey)}
              color={name === 'AlarmCallPoint' ? colors.red : colors.primary}
              active={tapTarget === name}
              onPress={() => {
                const c = session.current();
                if (c?.step.interaction !== 'tap_target' || c.params.target !== name) return;
                session.record('target_hit', { target: name });
                session.complete();
                refresh();
              }}
            />
          </Anchored>
        ))}

      {mode === 'tabletop' && wantedMarker(cur) !== null ? (
        <Anchored
          anchor={anchor}
          offset={VIRTUAL_MARKER_OFFSET}
          direction={camera.direction}
          geometry={geometry}
          width={LABEL_BOX_PX.width}
          height={LABEL_BOX_PX.height}
          band={labelBand}
        >
          <TargetButton
            label={t('training.object.exit_sign')}
            color={colors.green}
            active
            onPress={() => {
              const c = session.current();
              const marker = wantedMarker(c);
              if (c !== null && marker !== null) markerReached(c, marker);
            }}
          />
        </Anchored>
      ) : null}

      {path?.map((offset, i) => (
        <Anchored
          key={`${stepIndex}-${i}`}
          anchor={anchor}
          offset={offset}
          direction={camera.direction}
          geometry={geometry}
          width={WAYPOINT_PX}
          height={WAYPOINT_PX}
          // The next mark is always on screen and clear of the card (pinned to an edge if needed)
          band={i === waypoint ? waypointBand : undefined}
        >
          <Waypoint index={i} next={i === waypoint} done={i < waypoint} onPress={() => onWaypoint(i, path.length, stepIndex)} />
        </Anchored>
      ))}

      {cones.map((cone) => (
        <Anchored key={cone.id} anchor={anchor} offset={cone.at} direction={camera.direction} geometry={geometry} width={72} height={72}>
          <Cone
            reading={coneReading(cone.at)}
            removeLabel={t('training.cone.remove')}
            onPress={() => {
              setCones((placed) => placed.filter((c) => c.id !== cone.id));
              progressed();
            }}
          />
        </Anchored>
      ))}

      {interaction === 'aim_and_hold' ? <Reticle geometry={geometry} /> : null}

      <SafeAreaView style={styles.chrome} pointerEvents="box-none">
        {cur !== null ? (
          <View style={styles.card} onLayout={(e) => setCardBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
            {mode === 'tabletop' ? <Text style={styles.mode}>{t('training.tabletop.label')}</Text> : null}
            <Text style={styles.instruction}>{t(cur.step.instructionKey)}</Text>
            {hint !== null ? <Text style={styles.hint}>{hint}</Text> : null}
            {detector !== undefined && path !== undefined ? (
              <Text style={styles.hint}>{t('training.detector.label', { reading: Math.round((detector.peakReading * waypoint) / path.length) })}</Text>
            ) : null}
            <View style={styles.cardRow}>
              <Pressable accessibilityRole="button" style={styles.chip} onPress={() => speakKey(cur.step.audioKey)}>
                <Text style={styles.chipText}>🔊 {t('training.replay.button')}</Text>
              </Pressable>
              {remaining !== null ? <Text style={styles.timer}>{t('training.time_left.label', { seconds: remaining })}</Text> : null}
              <Pressable
                accessibilityRole="button"
                style={[styles.chip, styles.stop]}
                onPress={() => {
                  session.abort();
                  refresh();
                }}
              >
                <Text style={styles.chipText}>{t('training.stop.button')}</Text>
              </Pressable>
            </View>
            {canSkip ? (
              <Pressable accessibilityRole="button" style={styles.skip} onPress={() => onSkip(cur.index)}>
                <Text style={styles.skipText}>{t('training.skip.button')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.instruction}>{t('training.saving.label')}</Text>
          </View>
        )}

        <View style={styles.bottom} pointerEvents="box-none" onLayout={(e) => setPanelTop(e.nativeEvent.layout.y)}>
          {route !== null ? <RouteArrow targetHeading={route} direction={camera.direction} /> : null}

          {cur !== null && (interaction === 'choose_one' || interaction === 'decision') ? (
            <ScrollView style={styles.options} contentContainerStyle={styles.optionsContent}>
              {stepOptions(cur.step).map((o) => (
                <Pressable
                  key={o.id}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                  onPress={() => {
                    // GAS_01 has decisions back to back: a double tap must not answer the next one
                    if (session.current()?.index !== cur.index) return;
                    session.choose(o.id);
                    refresh();
                  }}
                >
                  <Text style={styles.optionText}>{t(o.labelKey)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {cur !== null && multiSelect ? (
            <>
              <ScrollView style={styles.options} contentContainerStyle={styles.optionsContent}>
                {stepOptions(cur.step).map((o) => {
                  const on = picked.includes(o.id);
                  return (
                    <Pressable
                      key={o.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      style={({ pressed }) => [styles.option, styles.optionRow, on && styles.optionOn, pressed && styles.optionPressed]}
                      onPress={() => {
                        setPicked((p) => (p.includes(o.id) ? p.filter((id) => id !== o.id) : [...p, o.id]));
                        progressed();
                      }}
                    >
                      <View style={[styles.box, on && styles.boxOn]}>{on ? <Text style={styles.boxTick}>✓</Text> : null}</View>
                      <Text style={[styles.optionText, styles.optionLabel]}>{t(o.labelKey)}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Pressable accessibilityRole="button" style={styles.done} onPress={() => finishChoice(cur.index)}>
                <Text style={styles.doneText}>{t('training.done.button')}</Text>
              </Pressable>
            </>
          ) : null}

          {interaction === 'mark_zone' ? (
            <View style={styles.holdBox}>
              <Text style={styles.hint}>{t('training.cones.label', { count: cones.length, min: minCones })}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: cones.length < minCones }}
                disabled={cones.length < minCones}
                style={[styles.done, cones.length < minCones && styles.doneDisabled]}
                onPress={finishZone}
              >
                <Text style={styles.doneText}>{t('training.done.button')}</Text>
              </Pressable>
            </View>
          ) : null}

          {interaction === 'aim_and_hold' && cur !== null ? (
            <View style={styles.holdBox}>
              <Text style={styles.hint}>{t('training.held.label', { held: held.toFixed(1), total: cur.params.durationSec })}</Text>
              <Pressable
                accessibilityRole="button"
                onPressIn={() => setHolding(true)}
                onPressOut={() => setHolding(false)}
                style={[styles.holdButton, holding && styles.holdButtonActive]}
              >
                <Text style={styles.holdText}>{t('training.hold.button')}</Text>
              </Pressable>
            </View>
          ) : null}

          {interaction === 'narration' ? (
            <Pressable
              accessibilityRole="button"
              style={styles.option}
              onPress={() => {
                session.complete();
                refresh();
              }}
            >
              <Text style={styles.optionText}>{t('training.continue.button')}</Text>
            </Pressable>
          ) : null}

        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  tabletop: { backgroundColor: '#2B3A42' },
  chrome: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'space-between', padding: space.m },
  card: { backgroundColor: colors.overlay, borderRadius: 14, padding: space.m, gap: space.s },
  mode: { color: '#FFD43B', fontSize: 14, fontWeight: '700' },
  instruction: { color: '#FFFFFF', fontSize: 20, lineHeight: 30, fontWeight: '700' },
  hint: { color: '#E4E7EB', fontSize: 16, lineHeight: 24 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  chip: { minHeight: 44, paddingHorizontal: space.m, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center' },
  stop: { marginLeft: 'auto', backgroundColor: 'rgba(180,35,24,0.85)' },
  chipText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  timer: { color: '#FFD43B', fontSize: 18, fontWeight: '800' },
  skip: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFD43B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.m,
  },
  skipText: { color: '#FFD43B', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  bottom: { gap: space.s },
  options: { maxHeight: 320 },
  optionsContent: { gap: space.s },
  option: { minHeight: 60, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.95)', justifyContent: 'center', paddingHorizontal: space.l },
  optionPressed: { backgroundColor: '#D9E2EC' },
  optionText: { color: colors.text, fontSize: 18, fontWeight: '600' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  optionOn: { backgroundColor: '#E3F0FB' },
  optionLabel: { flex: 1 },
  box: { width: 30, height: 30, borderRadius: 6, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.primary },
  boxTick: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', lineHeight: 24 },
  done: { minHeight: 60, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  doneDisabled: { opacity: 0.45 },
  doneText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  holdBox: { gap: space.s, backgroundColor: colors.overlay, borderRadius: 14, padding: space.m },
  holdButton: { minHeight: 72, borderRadius: 36, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
  holdButtonActive: { backgroundColor: '#7A1A12' },
  holdText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
});
