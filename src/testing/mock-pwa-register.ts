import { vi } from "vitest";

export function useRegisterSW() {
  return {
    offlineReady: [false, vi.fn()],
    needRefresh: [false, vi.fn()],
    updateServiceWorker: vi.fn()
  };
}
