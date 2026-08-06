import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';

/**
 * Agreeing to a stolen hour — from wherever the offer is being read.
 *
 * The Time tab has had this since stacks existed: press it and the action
 * becomes a mission, which is what feeds the timeline, which is what the year
 * grid draws. The Today screen showed the very same stack — the best thing
 * this app does, promoted onto the first screen precisely so it would be seen
 * — and its whole press handler was `router.push('/time')`. Somebody who read
 * "Take your walk while calling Amma", agreed with it, and tapped, was moved
 * to another screen and left to find the card again. A suggestion you cannot
 * accept where you meet it is a suggestion the app does not really mean.
 *
 * One implementation, two callers, because the interesting part is not the
 * POST. It is the four pieces of state around it:
 *
 *   `planned` is what has been agreed to but not yet reflected by the server,
 *   so the offer can leave on the tap. It has to: planning something changes
 *   which slots the engine picks, which changes the wording cache key, which
 *   makes the very next fetch a cache miss that goes to the model — and that
 *   call is allowed a full minute. Every report of this said "Plan it does
 *   nothing". It did. It logged the mission and said so a lifetime later.
 *
 *   `justPlanned` is the confirmation line, and `planFailed` is the one case
 *   where silence would be a lie: an agreement that did not land must never
 *   look like one that did, because this is a record.
 *
 * Additive only. A failure puts the action back and names it.
 */
export function usePlanStack() {
  const qc = useQueryClient();
  const [justPlanned, setJustPlanned] = useState<string | null>(null);
  const [planned, setPlanned] = useState<string[]>([]);
  const [planFailed, setPlanFailed] = useState<string | null>(null);

  const plan = useMutation({
    mutationFn: (st: any) =>
      api('/missions', {
        method: 'POST',
        body: {
          title: st.action,
          description: st.framing,
          // A mission belongs to one domain, so it belongs to the one the
          // suggestion argued from — the hungriest thing it feeds.
          domainType: st.reasonDomain ?? st.covers?.[0] ?? st.domains?.[0],
          missionType: st.personId ? 'relationship' : 'one_time',
          relationshipId: st.personId ?? null,
          // Stacking is the whole thesis of this card, so an action that
          // genuinely serves three parts of a life is worth more than one that
          // serves two. Nothing here is worth more for being harder.
          xpReward: 20 * (st.domains?.length ?? 1),
          sourceType: 'system',
        },
      }),
    // The row goes the instant it is pressed, not when the model gets back.
    onMutate: (st: any) => {
      setPlanFailed(null);
      setJustPlanned(st.action);
      setPlanned((p) => (p.includes(st.action) ? p : [...p, st.action]));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      // The set has to re-plan around what was just agreed to.
      qc.invalidateQueries({ queryKey: ['life-stacks'] });
    },
    onError: (_err, st: any) => {
      // Put it back. An agreement that did not land must not look like one
      // that did — this is a record, and a phantom entry is worse than none.
      setPlanned((p) => p.filter((a) => a !== st.action));
      setJustPlanned(null);
      setPlanFailed(st.action);
    },
  });

  return { plan, planned, justPlanned, planFailed };
}
