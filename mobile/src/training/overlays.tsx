import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
import type { Offset } from '@/core/player/prefabs';
import { colors } from '@/ui/theme';

export interface ScreenGeometry {
  cx: number;
  cy: number;
  pxPerDeg: number;
}

/** A view drawn at a direction anchored in the world, moving as the phone turns (3DoF). */
export function Anchored({
  anchor,
  offset,
  direction,
  geometry,
  width,
  height,
  children,
}: {
  anchor: SharedValue<Direction | null>;
  offset: Offset;
  direction: SharedValue<Direction>;
  geometry: ScreenGeometry;
  width: number;
  height: number;
  children: ReactNode;
}) {
  const { dh, de } = offset;
  const { cx, cy, pxPerDeg } = geometry;
  const style = useAnimatedStyle(() => {
    const a = anchor.value;
    if (a === null) return { opacity: 0, transform: [{ translateX: -10000 }, { translateY: 0 }] };
    const target = { headingDeg: a.headingDeg + dh, elevationDeg: a.elevationDeg + de };
    const { dx, dy } = screenOffset(target, direction.value, pxPerDeg);
    return { opacity: 1, transform: [{ translateX: cx + dx - width / 2 }, { translateY: cy + dy - height / 2 }] };
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

export function TargetButton({ label, onPress, active, color }: { label: string; onPress: () => void; active: boolean; color: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!active}
      onPress={onPress}
      style={[styles.target, { backgroundColor: color }, active && styles.targetActive]}
    >
      <Text style={styles.targetText}>{label}</Text>
    </Pressable>
  );
}

export function Waypoint({ index, next, done, onPress }: { index: number; next: boolean; done: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={String(index + 1)}
      disabled={!next}
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

/** Arrow at the bottom of the screen pointing towards a heading (the exit), for `showRoute`. */
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
  target: {
    minWidth: 96,
    minHeight: 64,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  targetActive: { borderColor: '#FFFFFF' },
  targetText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
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
