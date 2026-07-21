"use client";

import type { ReactNode } from "react";
import { ArrowUp, Loader2, Square } from "lucide-react";
import { Button } from "@ohmyagentteam/ui/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ohmyagentteam/ui/components/ui/tooltip";

interface SubmitButtonProps {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  running?: boolean;
  onStop?: () => void;
  /** Accessible name for the send button. Falls back to a string tooltip. */
  ariaLabel?: string;
  /** Accessible name for the stop button. Falls back to a string tooltip. */
  stopAriaLabel?: string;
  /**
   * Tooltip shown over the send button when idle. Pass a string or a node
   * (e.g. `Send · ⌘↵`). Omit to render no tooltip.
   * Callers compose the shortcut hint themselves to keep this component
   * free of `@ohmyagentteam/core` (platform-detection) and i18n imports.
   */
  tooltip?: ReactNode;
  /** Tooltip shown over the stop button while a run is in progress. */
  stopTooltip?: ReactNode;
}

function SubmitButton({
  onClick,
  disabled,
  loading,
  running,
  onStop,
  ariaLabel,
  stopAriaLabel,
  tooltip,
  stopTooltip,
}: SubmitButtonProps) {
  if (running) {
    const accessibleStopLabel =
      stopAriaLabel ?? (typeof stopTooltip === "string" ? stopTooltip : undefined);
    const stopButton = (
      <Button size="icon-sm" onClick={onStop} aria-label={accessibleStopLabel}>
        <Square className="fill-current" />
      </Button>
    );
    if (!stopTooltip) return stopButton;
    return (
      <Tooltip>
        <TooltipTrigger render={stopButton} />
        <TooltipContent side="top">{stopTooltip}</TooltipContent>
      </Tooltip>
    );
  }

  const accessibleSubmitLabel =
    ariaLabel ?? (typeof tooltip === "string" ? tooltip : undefined);
  const submitButton = (
    <Button
      size="icon-sm"
      disabled={disabled || loading}
      onClick={onClick}
      aria-label={accessibleSubmitLabel}
    >
      {loading ? <Loader2 className="animate-spin" /> : <ArrowUp />}
    </Button>
  );
  if (!tooltip) return submitButton;
  return (
    <Tooltip>
      <TooltipTrigger render={submitButton} />
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export { SubmitButton, type SubmitButtonProps };
