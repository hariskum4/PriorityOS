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
  /**
   * Missions whose moment has been kept in this session.
   *
   * The Today banner went on saying "Save it" after the moment was saved, so
   * the obvious second tap wrote the archive a second copy of the same
   * evening. The server refuses the duplicate now, but a button that offers
   * a thing already done is still the app asking for work it does not want:
   * this is what lets it say so instead.
   *
   * Session-scoped on purpose. The banner it answers is session state too —
   * `justCompleted` does not survive a reload — so a set that outlived it
   * would be answering a question nobody is asking.
   */
  kept: string[];
  setDraft: (d: MemoryDraft) => void;
  markKept: (missionId: string) => void;
  clear: () => void;
}

export const useMemoryDraft = create<MemoryDraftState>((set) => ({
  draft: null,
  kept: [],
  setDraft: (draft) => set({ draft }),
  markKept: (missionId) => set((st) => (
    st.kept.includes(missionId) ? st : { kept: [...st.kept, missionId] }
  )),
  clear: () => set({ draft: null }),
}));
