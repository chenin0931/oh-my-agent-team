"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "@ohmyagentteam/core/auth";
import {
  PRODUCT_TOUR_VERSION,
  useProductTourStore,
} from "@ohmyagentteam/core/workspace/product-tour-store";
import { ProductTour } from "./product-tour";

const PRODUCT_TOUR_STORAGE_PREFIX = "ohmyagentteam.product_tour.completed";

interface TourPreference {
  userId: string;
  needsTour: boolean;
}

export function productTourStorageKey(userId: string): string {
  return `${PRODUCT_TOUR_STORAGE_PREFIX}.${userId}.v${PRODUCT_TOUR_VERSION}`;
}

function needsFirstRunTour(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(productTourStorageKey(userId)) !== "1";
  } catch {
    return true;
  }
}

function persistTourCompletion(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(productTourStorageKey(userId), "1");
  } catch {
    // Storage can be unavailable in private browser contexts. Closing the
    // current tour still takes effect; it may reappear on a later session.
  }
}

/**
 * Shows the versioned first-run product tour without creating workspace data.
 */
export function WorkspaceFirstRunExperience() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const manuallyOpen = useProductTourStore((state) => state.manuallyOpen);
  const closeManualTour = useProductTourStore((state) => state.close);
  const [preference, setPreference] = useState<TourPreference | null>(null);

  useEffect(() => {
    if (!userId) {
      setPreference(null);
      return;
    }
    setPreference({ userId, needsTour: needsFirstRunTour(userId) });
  }, [userId]);

  const completeTour = useCallback(() => {
    if (!userId) return;
    persistTourCompletion(userId);
    setPreference({ userId, needsTour: false });
    closeManualTour();
  }, [closeManualTour, userId]);

  if (!userId || preference?.userId !== userId) return null;

  const tourOpen = preference.needsTour || manuallyOpen;

  return <ProductTour open={tourOpen} onComplete={completeTour} />;
}
