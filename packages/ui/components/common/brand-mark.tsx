import type { SVGProps } from "react";
import { cn } from "../../lib/utils";

export interface BrandMarkProps extends SVGProps<SVGSVGElement> {
  bordered?: boolean;
  size?: "sm" | "md" | "lg";
  monochrome?: boolean;
}

const framedSizes = {
  sm: "size-7 p-1",
  md: "size-9 p-1.5",
  lg: "size-11 p-2",
};

/**
 * OhMyAgentTeam's collaboration loop. The mark is the vectorized production
 * form of the Imagen-generated master: one human node and three agent nodes
 * connected around a single editorial O.
 */
export function BrandMark({
  className,
  bordered = false,
  size = "sm",
  monochrome = false,
  ...props
}: BrandMarkProps) {
  const mark = (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label="OhMyAgentTeam"
      className={cn("block size-full", !bordered && className)}
      {...props}
    >
      <ellipse
        cx="50"
        cy="50"
        rx="35"
        ry="41"
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
      />
      <circle cx="20" cy="28" r="9" fill={monochrome ? "currentColor" : "#ef6a5b"} />
      <rect
        x="71"
        y="19"
        width="18"
        height="18"
        rx="4"
        fill={monochrome ? "currentColor" : "#35a66f"}
      />
      <rect
        x="15"
        y="67"
        width="16"
        height="16"
        rx="2"
        transform="rotate(45 23 75)"
        fill={monochrome ? "currentColor" : "#33a7c8"}
      />
      <circle cx="78" cy="76" r="8" fill={monochrome ? "currentColor" : "#e1b640"} />
    </svg>
  );

  if (!bordered) return mark;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-border bg-background",
        framedSizes[size],
        className,
      )}
      aria-hidden="true"
    >
      {mark}
    </span>
  );
}
