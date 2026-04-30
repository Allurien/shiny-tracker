// Decorative SVG flourish for the gradient hero bar at the top of each tab.
// Three nested wave paths plus a few "sparkle" dots, all in tinted brand
// colors at low opacity so the heading text reads cleanly on top.

import { StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { palette } from "@/src/theme/colors";

const VB_W = 360;
const VB_H = 110;

export function HeroWave() {
  return (
    <View style={styles.container} pointerEvents="none">
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMaxYMid slice"
      >
        {/* Soft wash on the right side so the right half of the bar feels lit. */}
        <Path
          d="M180 0 Q260 30 360 10 L360 110 L210 110 Q190 60 180 0 Z"
          fill={palette.tealSoft}
          opacity={0.08}
        />
        {/* Three stacked wave strokes — staggered phase + decreasing opacity. */}
        <Path
          d="M150 70 Q200 40 250 70 T360 70"
          stroke={palette.tealSoft}
          strokeWidth={1.5}
          fill="none"
          opacity={0.45}
        />
        <Path
          d="M140 85 Q200 60 260 85 T360 85"
          stroke={palette.text}
          strokeWidth={1}
          fill="none"
          opacity={0.25}
        />
        <Path
          d="M170 55 Q220 30 270 55 T360 55"
          stroke={palette.tealSoft}
          strokeWidth={1}
          fill="none"
          opacity={0.3}
        />
        {/* Sparkles — diamond-painting nod. Sized small so they read as accents. */}
        <Circle cx={300} cy={28} r={1.8} fill={palette.text} opacity={0.7} />
        <Circle cx={335} cy={48} r={1.2} fill={palette.text} opacity={0.55} />
        <Circle cx={275} cy={92} r={1.4} fill={palette.tealSoft} opacity={0.6} />
        <Circle cx={250} cy={20} r={1} fill={palette.text} opacity={0.4} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // Absolute fill so the wave sits behind whatever content the hero renders.
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
