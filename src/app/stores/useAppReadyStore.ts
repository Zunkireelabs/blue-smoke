import { create } from 'zustand';

interface AppReadyState {
  isReady: boolean;
  setReady: (ready: boolean) => void;
}

/**
 * Establishes the project's Zustand convention (CLAUDE.md): small, explicit
 * stores, one per concern, not a god store. This one tracks app bootstrap
 * readiness; feature stores follow the same shape.
 */
export const useAppReadyStore = create<AppReadyState>(set => ({
  isReady: true,
  setReady: ready => set({ isReady: ready }),
}));
