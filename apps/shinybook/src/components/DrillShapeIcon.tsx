import Svg, { Circle, Line, Rect } from "react-native-svg";

import { palette } from "@/src/theme/colors";
import type { DrillShape } from "@/src/types/painting";

export function DrillShapeIcon({
  shape,
  size = 14,
}: {
  shape: DrillShape | undefined;
  size?: number;
}) {
  if (shape === "round") {
    return <RoundDrill size={size} color={palette.drill.round} />;
  }
  if (shape === "square") {
    return <SquareDrill size={size} color={palette.drill.square} />;
  }
  return null;
}

// Both glyphs share the same anatomy: an outer outline, a smaller concentric
// outline, and four diagonal facet strokes from outer to inner — modeled on
// Diamond Art Club's product-detail drill icons.
const STROKE = 1.4;

function SquareDrill({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Rect x={0.75} y={0.75} width={18.5} height={18.5} stroke={color} strokeWidth={STROKE} fill="none" />
      <Rect x={5.75} y={5.75} width={8.5} height={8.5} stroke={color} strokeWidth={STROKE} fill="none" />
      <Line x1={0.75} y1={0.75} x2={5.75} y2={5.75} stroke={color} strokeWidth={STROKE} strokeLinecap="square" />
      <Line x1={19.25} y1={0.75} x2={14.25} y2={5.75} stroke={color} strokeWidth={STROKE} strokeLinecap="square" />
      <Line x1={0.75} y1={19.25} x2={5.75} y2={14.25} stroke={color} strokeWidth={STROKE} strokeLinecap="square" />
      <Line x1={19.25} y1={19.25} x2={14.25} y2={14.25} stroke={color} strokeWidth={STROKE} strokeLinecap="square" />
    </Svg>
  );
}

// Two concentric circles + four 45° facet strokes connecting them — visual
// twin of the square version. The diagonal endpoints are r·cos(45°) from
// center, i.e. r * 0.7071, for both the outer (r=9.25) and inner (r=4.25)
// rings.
function RoundDrill({ size, color }: { size: number; color: string }) {
  const cx = 10;
  const outer = 9.25 * 0.7071;
  const inner = 4.25 * 0.7071;
  const facet = (sx: number, sy: number) => (
    <Line
      x1={cx + sx * outer}
      y1={cx + sy * outer}
      x2={cx + sx * inner}
      y2={cx + sy * inner}
      stroke={color}
      strokeWidth={STROKE}
      strokeLinecap="round"
    />
  );
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Circle cx={cx} cy={cx} r={9.25} stroke={color} strokeWidth={STROKE} fill="none" />
      <Circle cx={cx} cy={cx} r={4.25} stroke={color} strokeWidth={STROKE} fill="none" />
      {facet(-1, -1)}
      {facet(1, -1)}
      {facet(-1, 1)}
      {facet(1, 1)}
    </Svg>
  );
}
