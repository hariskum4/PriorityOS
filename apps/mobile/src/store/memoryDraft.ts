import { create } from 'zustand';

/** Hand-off from a completed mission ("Save the moment") to the
 * Memory Archive form — the loop that makes completions permanent. */
interface MemoryDraft {
  title: string;
  missionId?: string;
  relationshipId?: string;
  domainType?: string;
  personName?: string;
}

interface MemoryDraftState {
  draft: MemoryDraft | null;
  setDraft: (d: MemoryDraft) => void;
  clear: () => void;
}

export const useMemoryDraft = create<MemoryDraftState>((set) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
  clear: () => set({ draft: null }),
}));
