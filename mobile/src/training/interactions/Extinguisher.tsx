import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Polygon, Rect } from 'react-native-svg';

import { Text } from '@/ui/Text';

/** How far the pin must be dragged to the right to come out, px. */
const PULL_DISTANCE_PX = 36;
/** Pin touch target: at least 64 dp (accessibility minimum for a gloved hand). */
const PIN_BOX = 72;
/** Space above the extinguisher body for the valve, lever and pin. */
const HEAD_ROOM = 60;

export type PinMethod = 'swipe' | 'tap';

export interface Point {
  x: number;
  y: number;
}

/**
 * First-person extinguisher for `operate_extinguisher` (D-038), laid out in the bottom panel so it
 * is always centred and inside the safe area on any phone; sizes come from the panel's width.
 * The worker swipes the pin (highlighted, with an arrow) to the right to pull it (PASS "Pull").
 * The nozzle points at the aiming ring; `onNozzle` reports the nozzle tip in window coordinates so
 * the spray can be drawn from it (`SprayCone`).
 */
export function Extinguisher({
  target,
  pinOut,
  discharging,
  pinLabel,
  onPinPulled,
  onNozzle,
}: {
  /** The aiming ring, window coordinates. */
  target: Point;
  pinOut: boolean;
  discharging: boolean;
  pinLabel: string;
  onPinPulled: (method: PinMethod) => void;
  onNozzle: (tip: Point) => void;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const container = useRef<View>(null);
  const [width, setWidth] = useState(0);
  const [origin, setOrigin] = useState<Point | null>(null);

  // Sizes from the panel width, kept short on small phones so the camera view stays usable
  const bodyH = Math.round(Math.min(100, Math.max(56, Math.min(width * 0.25, windowHeight * 0.1))));
  const bodyW = Math.round(Math.min(72, Math.max(44, width * 0.17)));
  const height = HEAD_ROOM + bodyH + 4;
  const cx = width / 2;
  const bodyX = cx - bodyW / 2;
  const bodyTop = HEAD_ROOM;
  const valveY = bodyTop - 16;
  // Pin just right of the valve; the arrow to its right shows the swipe direction
  const pinCentre = { x: Math.min(cx + bodyW / 2 + PIN_BOX / 2 + 4, width - PIN_BOX / 2 - 40), y: valveY };

  // Nozzle: left of the body, pointing at the aiming ring
  const base = { x: Math.max(24, cx - bodyW / 2 - Math.max(40, width * 0.16)), y: bodyTop + 6 };
  const local = origin === null ? { x: cx, y: -400 } : { x: target.x - origin.x, y: target.y - origin.y };
  const len = Math.max(1, Math.hypot(local.x - base.x, local.y - base.y));
  const tip = { x: base.x + ((local.x - base.x) / len) * 30, y: base.y + ((local.y - base.y) / len) * 30 };

  useEffect(() => {
    if (origin !== null) onNozzle({ x: origin.x + tip.x, y: origin.y + tip.y });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.x, origin?.y, tip.x, tip.y]);

  // The pin: pulses until pulled, follows the finger to the right, flies off when pulled
  const pinX = useSharedValue(0);
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = pinOut ? withTiming(0) : withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true);
    pinX.value = pinOut ? withTiming(140, { duration: 250 }) : withSpring(0);
  }, [pinOut, pinX, glow]);
  const pinStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pinX.value }], opacity: 1 - Math.min(1, pinX.value / 140) }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.35 + 0.45 * glow.value, transform: [{ scale: 0.9 + 0.2 * glow.value }] }));
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !pinOut,
        onMoveShouldSetPanResponder: () => !pinOut,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) => {
          pinX.value = Math.max(0, g.dx);
        },
        onPanResponderRelease: (_, g) => {
          if (g.dx >= PULL_DISTANCE_PX) onPinPulled('swipe');
          else pinX.value = withSpring(0);
        },
        onPanResponderTerminate: () => {
          pinX.value = withSpring(0);
        },
      }),
    [pinOut, pinX, onPinPulled],
  );

  return (
    <View
      ref={container}
      style={[styles.box, { height }]}
      onLayout={(e) => {
        setWidth(e.nativeEvent.layout.width);
        container.current?.measureInWindow((x, y) => setOrigin({ x, y }));
      }}
    >
      {width > 0 ? (
        <>
          <Svg pointerEvents="none" width={width} height={height} style={StyleSheet.absoluteFill}>
            <Path
              d={`M ${cx - 10} ${valveY + 8} C ${cx - 30} ${bodyTop + bodyH * 0.8}, ${base.x} ${bodyTop + bodyH * 0.7}, ${base.x} ${base.y}`}
              stroke="#1F1F1F"
              strokeWidth={8}
              fill="none"
              strokeLinecap="round"
            />
            <Line x1={base.x} y1={base.y} x2={tip.x} y2={tip.y} stroke="#2B2B2B" strokeWidth={12} strokeLinecap="round" />
            <Rect x={bodyX} y={bodyTop} width={bodyW} height={bodyH} rx={16} fill="#C62828" />
            <Rect x={bodyX + 7} y={bodyTop + bodyH * 0.3} width={bodyW - 14} height={bodyH * 0.3} rx={5} fill="#F5F5F5" />
            <Rect x={cx - 11} y={valveY - 2} width={22} height={20} rx={4} fill="#3A3A3A" />
            {/* Lever: pressed down while discharging */}
            <Line x1={cx - 30} y1={valveY - 8} x2={cx + 18} y2={valveY - (discharging ? 6 : 16)} stroke="#2B2B2B" strokeWidth={7} strokeLinecap="round" />
            <Line x1={cx - 26} y1={valveY + 12} x2={cx + 14} y2={valveY + 14} stroke="#2B2B2B" strokeWidth={7} strokeLinecap="round" />
          </Svg>
          {!pinOut ? (
            <View pointerEvents="none" style={[styles.arrow, { left: pinCentre.x + PIN_BOX / 2 - 4, top: pinCentre.y - 16 }]}>
              <Text style={styles.arrowText}>➜</Text>
            </View>
          ) : null}
          <Animated.View
            {...responder.panHandlers}
            accessible
            accessibilityRole="button"
            accessibilityLabel={pinLabel}
            accessibilityActions={[{ name: 'activate' }]}
            onAccessibilityAction={() => onPinPulled('tap')}
            hitSlop={12}
            style={[styles.pin, { left: pinCentre.x - PIN_BOX / 2, top: pinCentre.y - PIN_BOX / 2 }, pinStyle]}
          >
            <Animated.View pointerEvents="none" style={[styles.glow, glowStyle]} />
            <Svg pointerEvents="none" width={PIN_BOX} height={PIN_BOX}>
              <Line x1={0} y1={PIN_BOX / 2} x2={PIN_BOX / 2 - 10} y2={PIN_BOX / 2} stroke="#E0E0E0" strokeWidth={4} strokeLinecap="round" />
              <Circle cx={PIN_BOX / 2 + 4} cy={PIN_BOX / 2} r={13} stroke="#FFD43B" strokeWidth={6} fill="none" />
            </Svg>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

/** The spray from the nozzle tip to the aiming ring, drawn over the camera view while discharging. */
export function SprayCone({ from, to, discharging }: { from: Point; to: Point; discharging: boolean }) {
  const flicker = useSharedValue(0);
  useEffect(() => {
    flicker.value = discharging ? withRepeat(withTiming(1, { duration: 140, easing: Easing.inOut(Easing.quad) }), -1, true) : withTiming(0, { duration: 120 });
  }, [discharging, flicker]);
  const style = useAnimatedStyle(() => ({ opacity: discharging ? 0.45 + 0.35 * flicker.value : 0 }));
  const len = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
  const perp = { x: -(to.y - from.y) / len, y: (to.x - from.x) / len };
  const points = [
    [from.x + perp.x * 5, from.y + perp.y * 5],
    [to.x + perp.x * 34, to.y + perp.y * 34],
    [to.x - perp.x * 34, to.y - perp.y * 34],
    [from.x - perp.x * 5, from.y - perp.y * 5],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(' ');
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%">
        <Polygon points={points} fill="rgba(236,241,246,0.9)" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%' },
  pin: { position: 'absolute', width: PIN_BOX, height: PIN_BOX, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: PIN_BOX, height: PIN_BOX, borderRadius: PIN_BOX / 2, backgroundColor: 'rgba(255,212,59,0.35)', borderWidth: 2, borderColor: '#FFD43B' },
  arrow: { position: 'absolute', width: 36, height: 32, alignItems: 'center', justifyContent: 'center' },
  arrowText: { color: '#FFD43B', fontSize: 26, lineHeight: 32, fontWeight: '800' },
});
