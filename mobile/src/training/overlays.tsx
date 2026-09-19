import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { angleDiff, screenOffset, type Direction } from '@/core/orientation';
import { LABEL_BOX_PX, clampToBand, type Band } from '@/core/player/layout';
import type { Offset } from '@/core/player/prefabs';
import { Text } from '@/ui/Text';
import { colors } from '@/ui/theme';

export interface ScreenGeometry {
  cx: number;
  cy: number;
  pxPerDeg: number;
}

/**
 * A view drawn at a direction anchored in the world, moving as the phone turns (3DoF). With a
 * `band`, its centre stays inside it (D-033): pinned to the nearest edge, slightly faded, when the
 * real direction is off screen or under the card, so something the worker must tap always can be.
 */
export function Anchored({
  anchor,
  offset,
  direction,
  geometry,
  width,
  height,
  band,
  children,
}: {
  anchor: SharedValue<Direction | null>;
  offset: Offset;
  direction: SharedValue<Direction>;
  geometry: ScreenGeometry;
  width: number;
  height: number;
  band?: Band;
  children: ReactNode;
}) {
  const { dh, de } = offset;
  const { cx, cy, pxPerDeg } = geometry;
  const style = useAnimatedStyle(() => {
    const a = anchor.value;
    if (a === null) return { opacity: 0, transform: [{ translateX: -10000 }, { translateY: 0 }] };
    const target = { headingDeg: a.headingDeg + dh, elevationDeg: a.elevationDeg + de };
    const { dx, dy } = screenOffset(target, direction.value, pxPerDeg);
    const at = band === undefined ? { x: cx + dx, y: cy + dy, pinned: false } : clampToBand(cx + dx, cy + dy, band);
    return { opacity: at.pinned ? 0.85 : 1, transform: [{ translateX: at.x - width / 2 }, { translateY: at.y - height / 2 }] };
  });
  return (
    <Animated.View pointerEvents="box-none" style={[styles.anchored, { width, height }, style]}>
      {children}
    </Animated.View>
  );
}

/** Flickering fire; `level` grows it when the scenario escalates. */
export function Fire({ size, level }: { size: number; level: SharedValue<number> }) {
  const flicker = useSharedValue(1);
  useEffect(() => {
    flicker.value = withRepeat(
      withSequence(withTiming(1.08, { duration: 180, easing: Easing.inOut(Easing.quad) }), withTiming(0.96, { duration: 220 })),
      -1,
      true,
    );
  }, [flicker]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: (size * (1 - level.value)) / 2 }, { scale: flicker.value * level.value }],
  }));
  return (
    <Animated.View style={[styles.center, { width: size, height: size }, style]} pointerEvents="none">
      <Text style={{ fontSize: size * 0.8, lineHeight: size }}>🔥</Text>
    </Animated.View>
  );
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
