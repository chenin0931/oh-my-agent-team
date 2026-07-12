import type { ComponentProps } from "react";
import { BrandMark } from "./brand-mark";

interface LegacyIconProps extends ComponentProps<typeof BrandMark> {
  animate?: boolean;
  noSpin?: boolean;
}

/** @deprecated Use BrandMark. Kept while internal package consumers migrate. */
export function OhMyAgentTeamIcon({ animate: _animate, noSpin: _noSpin, ...props }: LegacyIconProps) {
  return <BrandMark {...props} />;
}
