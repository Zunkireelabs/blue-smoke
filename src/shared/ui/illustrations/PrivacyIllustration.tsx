import { View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { tokens } from '../tokens';

export interface PrivacyIllustrationProps {
  size: number;
}

// ON-3 geometry table (execution brief UI-BUILD-E part 3) — the shoulders arc fitted to the
// stated bounding box (x 15->44, y 71->96), sweeping its stated 200deg->340deg range.
const SHOULDER_ARC_PATH = 'M15.87 79.22 A14.5 12.5 0 0 1 43.13 79.22';
const VERDICT_TICK_PATH = 'M70 53 L74.5 58 L82 47';

/**
 * ON-3 · What we hold (execution brief UI-BUILD-E part 3) — static, no animation. The reading is
 * the architecture: the ID card and the selfie stay on their side of the dashed boundary; only
 * the verdict circle crosses it. No arrow, cloud, server, or vendor logo — the line is the point.
 */
export function PrivacyIllustration({ size }: PrivacyIllustrationProps) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {/* ID card */}
        <Rect x={13} y={27} width={34} height={24} rx={3.5} stroke={tokens.color.surface} strokeWidth={3} fill="none" />
        <Circle cx={22.5} cy={37.5} r={4.5} stroke={tokens.color.surface} strokeWidth={2.4} fill="none" />
        <Line x1={31} y1={35.5} x2={42} y2={35.5} stroke={tokens.color.surface} strokeWidth={2.4} />
        <Line x1={31} y1={41} x2={39} y2={41} stroke={tokens.color.surface} strokeWidth={2.4} />
        <Line x1={18} y1={46} x2={39} y2={46} stroke={tokens.color.surface} strokeWidth={2.4} />

        {/* Selfie */}
        <Circle cx={29.5} cy={65.5} r={7.5} stroke={tokens.color.surface} strokeWidth={3} fill="none" />
        <Path d={SHOULDER_ARC_PATH} stroke={tokens.color.surface} strokeWidth={3} fill="none" />

        {/* Boundary — the documents never cross this line */}
        <Line
          x1={57}
          y1={18}
          x2={57}
          y2={86}
          stroke={tokens.color.surface}
          strokeWidth={2.4}
          strokeOpacity={0.62}
          strokeDasharray="4.5 4"
        />

        {/* Verdict — the one thing that does cross */}
        <Circle cx={76} cy={53} r={12} stroke={tokens.color.surface} strokeWidth={3} fill="none" />
        <Path
          d={VERDICT_TICK_PATH}
          stroke={tokens.color.surface}
          strokeWidth={3.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}
