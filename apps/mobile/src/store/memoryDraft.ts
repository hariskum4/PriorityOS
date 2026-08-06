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
  /**
   * A first line waiting for the Today composer.
   *
   * The two halves of this tab had never met: keeping a moment wrote an
   * archive row and the written journal stayed empty, so the app could know
   * somebody called their mother and hold not one word about it. This is the
   * handoff — the archive form asks the server to draft a sentence, leaves it
   * here, and the composer picks it up.
   *
   * Session-scoped like `kept`, and cleared the moment it is read: a draft
   * that outlived the screen it was written for would reappear over whatever
   * somebody was typing days later.
   */
  pendingEntry: string | null;
  /** The question that goes under it — the half the research says matters. */
  pendingPrompt: string | null;
  setDraft: (d: MemoryDraft) => void;
  markKept: (missionId: string) => void;
  offerEntry: (line: string, prompt?: string | null) => void;
  takeEntry: () => { line: string; prompt: string | null } | null;
  clear: () => void;
}

export const useMemoryDraft = create<MemoryDraftState>((set, get) => ({
  draft: null,
  kept: [],
  pendingEntry: null,
  pendingPrompt: null,
  setDraft: (draft) => set({ draft }),
  markKept: (missionId) => set((st) => (
    st.kept.includes(missionId) ? st : { kept: [...st.kept, missionId] }
  )),
  offerEntry: (pendingEntry, pendingPrompt = null) => set({ pendingEntry, pendingPrompt }),
  /* Read once. Returning it and clearing in the same call is what stops a
     re-render from re-filling a field somebody has just emptied. */
  takeEntry: () => {
    const { pendingEntry, pendingPrompt } = get();
    /* A question with no line is still worth handing over: a title that
       could not be conjugated leaves an empty box, and the box is exactly
       where a question earns its keep. */
    if (!pendingEntry && !pendingPrompt) return null;
    set({ pendingEntry: null, pendingPrompt: null });
    return { line: pendingEntry ?? '', prompt: pendingPrompt };
  },
  clear: () => set({ draft: null }),
}));
