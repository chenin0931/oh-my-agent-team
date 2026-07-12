// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  PRODUCT_TOUR_CONTROL_STORAGE_KEY,
  PRODUCT_TOUR_VERSION,
  useProductTourStore,
} from "./product-tour-store";

describe("product tour store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useProductTourStore.getState().reset();
  });

  it("exposes a positive version for completion keys", () => {
    expect(PRODUCT_TOUR_VERSION).toBeGreaterThan(0);
  });

  it("opens and closes the manually requested tour", () => {
    useProductTourStore.getState().open();
    expect(useProductTourStore.getState().manuallyOpen).toBe(true);
    expect(window.localStorage.getItem(PRODUCT_TOUR_CONTROL_STORAGE_KEY)).toContain(
      '"manuallyOpen":true',
    );

    useProductTourStore.getState().close();
    expect(useProductTourStore.getState().manuallyOpen).toBe(false);
    expect(window.localStorage.getItem(PRODUCT_TOUR_CONTROL_STORAGE_KEY)).toContain(
      '"manuallyOpen":false',
    );
  });
});
