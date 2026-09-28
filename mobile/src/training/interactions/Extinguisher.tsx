import { useEffect, useMemo } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Polygon, Rect } from 'react-native-svg';

/** How far the pin must be dragged out of the handle, px. */
const PULL_DISTANCE_PX = 44;
const BODY = { width: 64, height: 150, margin: 18 };

/**
 * First-person extinguisher for `operate_extinguisher` (D-038), drawn in screen space at the
 * bottom right, above the bottom panel. The worker swipes the pin off (PASS "Pull"); the hose runs
 * to a nozzle that points at the aiming ring in the centre of the screen, and while the lever is
 * held a spray cone runs from the nozzle to the ring. Aim itself comes from turning the phone.
 */
export function Extinguisher({
  width,
  bottom,
  target,
  pinOut,
  discharging,
  pinLabel,
  onPinPulled,
}: {
  /** Screen width, px. */
  width: number;
  /** Top of the bottom panel: the extinguisher stands on it. */
  bottom: number;
  /** Where the spray lands: the aiming ring. */
  target: { x: number; y: number };
  pinOut: boolean;
  discharging: boolean;
  pinLabel: string;
  onPinPulled: () => void;
}) {
  const bodyX = width - BODY.width - BODY.margin;
  const bodyTop = bottom - BODY.height - 12;
  const valveX = bodyX + BODY.width / 2;
  const valveY = bodyTop - 20;
  // Nozzle: low, left of the body, pointing at the aiming ring
  const base = { x: width * 0.56, y: bottom - 28 };
  const dx = target.x - base.x;
  const dy = target.y - base.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const dir = { x: dx / len, y: dy / len };
  const tip = { x: base.x + dir.x * 34, y: base.y + dir.y * 34 };
  const perp = { x: -dir.y, y: dir.x };
  const spray = [
    [tip.x + perp.x * 5, tip.y + perp.y * 5],
    [target.x + perp.x * 34, target.y + perp.y * 34],
    [target.x - perp.x * 34, target.y - perp.y * 34],
    [tip.x - perp.x * 5, tip.y - perp.y * 5],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(' ');

  // Spray flicker while discharging
  const flicker = useSharedValue(0);
  useEffect(() => {
    flicker.value = discharging ? withRepeat(withTiming(1, { duration: 140, easing: Easing.inOut(Easing.quad) }), -1, true) : withTiming(0, { duration: 120 });
  }, [discharging, flicker]);
  const sprayStyle = useAnimatedStyle(() => ({ opacity: discharging ? 0.45 + 0.35 * flicker.value : 0 }));

  // The pin: drag it out to the right
  const pinX = useSharedValue(0);
  useEffect(() => {
    pinX.value = pinOut ? withTiming(160, { duration: 250 }) : 0;
  }, [pinOut, pinX]);
  const pinStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pinX.value }], opacity: 1 - Math.min(1, pinX.value / 160) }));
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !pinOut,
        onMoveShouldSetPanResponder: () => !pinOut,
        onPanResponderMove: (_, g) => {
          pinX.value = Math.max(0, g.dx);
        },
        onPanResponderRelease: (_, g) => {
          if (g.dx >= PULL_DISTANCE_PX) onPinPulled();
          else pinX.value = withSpring(0);
        },
        onPanResponderTerminate: () => {
          pinX.value = withSpring(0);
        },
      }),
    [pinOut, pinX, onPinPulled],
  );

  const pin = { x: valveX + 26, y: valveY + 4 };
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, sprayStyle]}>
        <Svg width="100%" height="100%">
          <Polygon points={spray} fill="rgba(236,241,246,0.9)" />
        </Svg>
      </Animated.View>
      <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill}>
        {/* Hose from the valve to the nozzle */}
        <Path
          d={`M ${valveX - 10} ${valveY + 6} C ${valveX - 40} ${bottom - 6}, ${base.x + 50} ${bottom - 2}, ${base.x} ${base.y}`}
          stroke="#1F1F1F"
          strokeWidth={9}
          fill="none"
          strokeLinecap="round"
        />
        <Line x1={base.x} y1={base.y} x2={tip.x} y2={tip.y} stroke="#2B2B2B" strokeWidth={13} strokeLinecap="round" />
        {/* Cylinder, label band, valve and lever */}
        <Rect x={bodyX} y={bodyTop} width={BODY.width} height={BODY.height} rx={20} fill="#C62828" />
        <Rect x={bodyX + 8} y={bodyTop + 40} width={BODY.width - 16} height={46} rx={6} fill="#F5F5F5" />
        <Rect x={bodyX + 4} y={bodyTop + 10} width={10} height={BODY.height - 30} rx={5} fill="rgba(255,255,255,0.25)" />
        <Rect x={valveX - 12} y={valveY} width={24} height={24} rx={4} fill="#3A3A3A" />
        <Path
          d={`M ${valveX - 34} ${valveY - 4} L ${valveX + 20} ${valveY - (discharging ? 2 : 12)}`}
          stroke="#2B2B2B"
          strokeWidth={8}
          strokeLinecap="round"
        />
        <Line x1={valveX - 30} y1={valveY + 10} x2={valveX + 14} y2={valveY + 14} stroke="#2B2B2B" strokeWidth={8} strokeLinecap="round" />
      </Svg>
      {/* The pin sits in its own view so it can be dragged */}
      <Animated.View
        {...responder.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={pinLabel}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={() => onPinPulled()}
        style={[styles.pin, { left: pin.x - 30, top: pin.y - 30 }, pinStyle]}
      >
        <Svg width={60} height={60}>
          <Line x1={4} y1={30} x2={30} y2={30} stroke="#BDBDBD" strokeWidth={4} strokeLinecap="round" />
          <Circle cx={40} cy={30} r={11} stroke="#FFD43B" strokeWidth={5} fill="none" />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  pin: { position: 'absolute', width: 60, height: 60 },
});
