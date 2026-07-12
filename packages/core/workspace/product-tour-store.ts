import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { defaultStorage } from "../platform/storage";

export const PRODUCT_TOUR_VERSION = 1;
export const PRODUCT_TOUR_CONTROL_STORAGE_KEY =
  "ohmyagentteam_product_tour_control";

interface ProductTourStoreState {
  manuallyOpen: boolean;
  open: () => void;
  close: () => void;
  reset: () => void;
}

/**
 * Ephemeral control for reopening the workspace product tour from Help.
 * First-run completion is persisted separately and keyed by user and version.
 */
export const useProductTourStore = create<ProductTourStoreState>()(
  persist(
    (set) => ({
      manuallyOpen: false,
      open: () => set({ manuallyOpen: true }),
      close: () => set({ manuallyOpen: false }),
      reset: () => set({ manuallyOpen: false }),
    }),
    {
      name: PRODUCT_TOUR_CONTROL_STORAGE_KEY,
      storage: createJSONStorage(() => defaultStorage),
      partialize: ({ manuallyOpen }) => ({ manuallyOpen }),
    },
  ),
);
