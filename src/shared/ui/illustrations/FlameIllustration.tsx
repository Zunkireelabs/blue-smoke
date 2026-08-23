import { BrandMark } from '../BrandMark';
import { tokens } from '../tokens';

export interface FlameIllustrationProps {
  size: number;
}

/**
 * ON-1 · Welcome (execution brief UI-BUILD-E part 3): no new geometry — the onboarding welcome
 * card reuses `BrandMark` itself, in `solid` tone (white, not the gradient) so it reads against
 * `BrandGround`'s flat brand-blue fill the way the gradient's `brandGlow` top stop would not.
 */
export function FlameIllustration({ size }: FlameIllustrationProps) {
  return <BrandMark size={size} tone="solid" groundColor={tokens.color.brand} />;
}
