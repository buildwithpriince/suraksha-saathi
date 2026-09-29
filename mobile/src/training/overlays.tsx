import LottieView from 'lottie-react-native';
import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import fireAnimation from '@/assets/fire.json';
import { angleDiff, type Direction, type Quaternion } from '@/core/orientation';
import { FIRE_MAX } from '@/core/player/extinguisher';
import { LABEL_BOX_PX, type Band } from '@/core/player/layout';
import { overlayPlacement } from '@/core/player/overlay';
import type { Offset } from '@/core/player/prefabs';
import { Text } from '@/ui/Text';
import { colors } from '@/ui/theme';

export interface ScreenGeometry {
  cx: number;
  cy: number;
  /** Pixels per degree at the screen centre (overlay sizes; the whole mapping in legacy mode). */
  pxPerDeg: number;
  /** Focal length in px of the preview (pinhole projection, D-036). */
  focalPx: number;
  /** true: full-quaternion pinhole projection (stabilised); false: the legacy linear mapping. */
  pinhole: boolean;
}

/** The placed overlay's anchor: a world direction plus the marker scale (1 without a marker, D-036). */
export interface AnchorValues {
  anchor: SharedValue<Direction | null>;
  scale: SharedValue<number>;
}

/** Where the phone points: the direction (legacy mapping) and the orientation (pinhole). */
export interface CameraValues {
  direction: SharedValue<Direction>;
  orientation: SharedValue<Quaternion>;
}

/**
 * A view drawn at a direction anchored in the world, moving as the phone turns (3DoF). With a
 * `band`, its centre stays inside it (D-033): pinned to the nearest edge, slightly faded, when the
 * real direction is off screen or under the card, so something the worker must tap always can be.
 * It is a billboard: always upright on screen, whatever the phone's roll (D-039). Offsets grow
 * with the marker scale; `scaled` content (the fire, the gas cloud) grows with it too.
 */
export function Anchored({
  anchor: { anchor, scale },
  offset,
  camera: { direction, orientation },
  geometry,
  width,
  height,
  band,
  scaled = false,
  children,
}: {
  anchor: AnchorValues;
  offset: Offset;
  camera: CameraValues;
  geometry: ScreenGeometry;
  width: number;
  height: number;
  band?: Band;
  scaled?: boolean;
  children: ReactNode;
}) {
  const { cx, cy, pxPerDeg, focalPx, pinhole } = geometry;
  const style = useAnimatedStyle(() => {
    const a = anchor.value;
    if (a === null) return { opacity: 0, transform: [{ translateX: -10000 }, { translateY: 0 }, { scale: 1 }] };
    const s = scale.value;
    // Billboard (D-039): position only, never a rotation, so the sprite stays upright on screen
    const at = overlayPlacement(a, offset, s, { orientation: orientation.value, direction: direction.value }, { cx, cy, pxPerDeg, focalPx, pinhole }, band);
    return {
      opacity: at.pinned ? 0.85 : 1,
      transform: [{ translateX: at.x - width / 2 }, { translateY: at.y - height / 2 }, { scale: scaled ? s : 1 }],
    };
  });
  return (
    <Animated.View pointerEvents="box-none" style={[styles.anchored, { width, height }, style]}>
      {children}
    </Animated.View>
  );
}

/**
 * The fire (D-040): a looping Lottie flame (`assets/fire.json`, drawn by `scripts/fire-lottie.mjs`)
 * scaled by `level`, with its base kept on the ground, so the escalation and the extinguisher
 * simulation still visibly grow and shrink it. Smoke rises above it and thickens as it grows.
 */
export function Fire({ size, level }: { size: number; level: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: (size * (1 - level.value)) / 2 }, { scale: level.value }],
  }));
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        <LottieView source={fireAnimation} autoPlay loop style={{ width: size, height: size }} />
      </Animated.View>
      {SMOKE_PUFFS.map((k) => (
        <SmokePuff key={k} index={k} size={size} level={level} />
      ))}
    </View>
  );
}

const SMOKE_PUFFS = [0, 1, 2, 3];
/** Seconds for one puff to rise and fade. */
const SMOKE_RISE_SEC = 2.8;
/** The flame's tip, as a fraction of `size` above its base, at level 1 (see scripts/fire-lottie.mjs). */
const FLAME_TOP = 0.86;

/**
 * One translucent smoke puff above the fire. Puffs are spread evenly through the rise so there is
 * always smoke; how dark and big they are follows the fire level (none at 0, thickest at FIRE_MAX).
 */
function SmokePuff({ index, size, level }: { index: number; size: number; level: SharedValue<number> }) {
  const rise = useSharedValue(0);
  useEffect(() => {
    rise.value = withRepeat(withTiming(1, { duration: SMOKE_RISE_SEC * 1000, easing: Easing.linear }), -1, false);
  }, [rise]);
  const d = size * 0.5;
  const style = useAnimatedStyle(() => {
    const p = (rise.value + index / SMOKE_PUFFS.length) % 1;
    const l = Math.max(0, level.value);
    const thickness = Math.min(1, Math.max(0, (l - 0.1) / (FIRE_MAX - 0.1)));
    const spread = 0.6 + 0.4 * l;
    const baseY = size - FLAME_TOP * size * l * 0.85; // just inside the flame tip, so the smoke leaves it
    const x = size / 2 + Math.sin((p + index * 0.37) * 2 * Math.PI) * size * 0.08 * spread;
    const y = baseY - p * size * 1.1 * spread;
    return {
      opacity: (0.15 + 0.5 * thickness) * thickness * Math.sin(Math.PI * p),
      transform: [{ translateX: x - d / 2 }, { translateY: y - d / 2 }, { scale: (0.45 + 0.9 * p) * spread }],
    };
  });
  return <Animated.View style={[styles.smoke, { width: d, height: d, borderRadius: d / 2 }, style]} />;
}

/** Gas drifting around the leak; `level` fades it in when the leak develops (GAS_01 `detect`). */
export function GasCloud({ size, level }: { size: number; level: SharedValue<number> }) {
  const drift = useSharedValue(1);
  useEffect(() => {
    drift.value = withRepeat(withTiming(1.12, { duration: 1800, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [drift]);
  const style = useAnimatedStyle(() => ({
    opacity: level.value,
    transform: [{ scale: drift.value * (0.5 + 0.5 * level.value) }],
  }));
  return (
    <Animated.View style={[styles.center, { width: size, height: size }, style]} pointerEvents="none">
      <View style={[styles.gas, { width: size, height: size, borderRadius: size / 2 }]} />
      <View style={[styles.gas, styles.gasCore, { width: size * 0.55, height: size * 0.55, borderRadius: size * 0.275 }]} />
    </Animated.View>
  );
}

/** A `mark_zone` cone; tap it to remove it. `reading` is the detector reading where it stands. */
export function Cone({ reading, removeLabel, onPress }: { reading: string | null; removeLabel: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={removeLabel} hitSlop={8} onPress={onPress} style={styles.center}>
      <Text style={styles.coneIcon}>▲</Text>
      {reading !== null ? <Text style={styles.coneReading}>{reading}</Text> : null}
    </Pressable>
  );
}

export function TargetButton({ label, onPress, active, color }: { label: string; onPress: () => void; active: boolean; color: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!active}
      // Inactive labels let taps through, so cones can be placed around them (mark_zone)
      pointerEvents={active ? 'auto' : 'none'}
      onPress={onPress}
      style={[styles.target, { backgroundColor: color }, active && styles.targetActive]}
    >
      <Text style={styles.targetText}>{label}</Text>
    </Pressable>
  );
}

/** A `move_to` path mark. Any mark not yet reached takes a tap (waypoints.ts); `next` is highlighted. */
export function Waypoint({ index, next, done, onPress }: { index: number; next: boolean; done: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={String(index + 1)}
      disabled={done}
      hitSlop={12}
      onPress={onPress}
      style={[styles.waypoint, next && styles.waypointNext, done && styles.waypointDone]}
    >
      <Text style={styles.waypointText}>{index + 1}</Text>
    </Pressable>
  );
}

/** Screen-centre aiming ring for `aim_and_hold`. */
export function Reticle({ geometry }: { geometry: ScreenGeometry }) {
  return <View pointerEvents="none" style={[styles.reticle, { left: geometry.cx - 28, top: geometry.cy - 28 }]} />;
}

/** Arrow at the bottom of the screen pointing towards a heading (the exit or next waypoint), for `showRoute`. */
export function RouteArrow({ targetHeading, direction }: { targetHeading: number; direction: SharedValue<Direction> }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${angleDiff(targetHeading, direction.value.headingDeg)}deg` }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.arrow, style]}>
      <Text style={styles.arrowText}>⬆</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  anchored: { position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  gas: { position: 'absolute', backgroundColor: 'rgba(190,214,60,0.35)' },
  gasCore: { backgroundColor: 'rgba(214,226,70,0.45)' },
  smoke: { position: 'absolute', left: 0, top: 0, backgroundColor: 'rgb(62,62,66)' },
  coneIcon: { color: '#FF7A00', fontSize: 40, lineHeight: 44, textShadowColor: '#000', textShadowRadius: 3 },
  coneReading: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 6,
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  target: {
    minWidth: 96,
    minHeight: 64,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    maxWidth: LABEL_BOX_PX.width, // longer labels wrap inside the box the layout test assumes
  },
  targetActive: { borderColor: '#FFFFFF' },
  targetText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  waypoint: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(11,61,99,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waypointNext: { borderColor: '#FFD43B', backgroundColor: 'rgba(11,61,99,0.9)', transform: [{ scale: 1.15 }] },
  waypointDone: { opacity: 0.35 },
  waypointText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  reticle: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  arrow: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  arrowText: { color: '#FFD43B', fontSize: 48, lineHeight: 56 },
});
