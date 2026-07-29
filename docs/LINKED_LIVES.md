# Linked Lives

**Status:** design proposal, nothing built
**Date:** 2026-07-29

---

## What this is

Two people who both use Priority can link their accounts, and the relationship
they share stops being two separate half-records of the same life.

## What this is not

It is not a social network with a life-management theme. The distinction is not
a matter of tone or restraint in the UI — it is structural, and it comes down to
one sentence:

> **A social network connects profiles. This connects presence.**

A profile is a performed self: something you curate, publish, and are ranked on.
Presence is the plain fact of whether you showed up for someone. There is no way
to perform presence, which is precisely why it is worth connecting and a feed is
not.

Everything below follows from that. Where a rule seems severe, it is severe
because the alternative turns presence back into profile.

---

## The problem it solves

Today, when you call your mother, two things happen in the system:

- You open Priority and log a call.
- She opens Priority and logs a call.

The database now holds **two records of one event**, each half-true, each
drifting. Neither of you can see the other. Both of you are being measured
against a cadence the other cannot see and did not agree to.

That is the whole gap. Everything valuable in this feature is a consequence of
closing it.

---

## Principles

**1. Links are mutual, or they do not exist.**
No follow, no one-way subscribe, no asymmetry. Asymmetry is what creates an
audience, an audience is what creates performance, and performance is the thing
this product cannot survive.

**2. No discovery. Ever.**
You can only invite someone already in your People list, by an address you
already have. No search by name, no suggestions, no "people you may know", no
public identifiers. The first time a stranger can reach a user is the day this
becomes a different product.

**3. Small by construction.**
The product is about the ~15 people who matter. Four hundred links is not a
power-user configuration, it is a misuse. Cap it low enough that the cap is
never reached honestly (**suggested: 25**), and do not display a count anywhere.

**4. Guilt flows inward only.**
The system may tell *you* that you are falling short of what someone wants. It
must **never** tell them that you are. This is the single most important rule in
the document and the easiest one to erode. See *Cadence honesty* below.

**5. No number crosses the link. Not one.**
Not alignment, not XP, not level, not streak, not completion rate, not domain
balance, not neglect risk. The instant one person can see another's score it is
a league table, and every other rule here becomes decoration.

**6. Full value at zero links.**
Ninety percent of the people you love will never install this. Every screen must
be complete and undiminished with no links at all. Linking adds; its absence
never subtracts, and nothing may nag the user to invite anyone.

---

## What crosses the link

### 1. Contact truth — *the reason this exists*

A logged contact becomes **one shared fact**, written once and true for both
sides. She logs a call; your `lastContactAt` for her updates too.

This alone justifies the feature. It removes the most common data corruption in
the app — a relationship kept honestly by two people and recorded wrongly by
both.

- The contact log records **who recorded it** so it stays inspectable.
- Either party can delete a contact from their own view; deleting it from the
  shared record requires both, or it stays as "recorded by them".

### 2. Cadence honesty — *the most valuable and most dangerous signal*

You say you want to talk weekly. She says she wants to hear from you daily.
Today, each of you measures privately against your own wish and neither knows
the other's.

Linked, the app may tell **you**:

> *Amma would like to hear from you more often than you have been planning for.*

That is possibly the most useful sentence this product could ever produce. It is
also one API call away from being coercive, so:

- The signal is **strictly one-directional**. She sees nothing about your
  compliance — not a streak, not a gap, not a "last seen", not a nudge she could
  have triggered.
- She is telling the system her own preference, not sending you a message. The
  UI on her side must never read as "tell him to call me". It is the same
  cadence field she already fills in for herself.
- It is opt-in per link, and defaults **off**.
- It is expressed as *her preference*, never as *your failure*.

### 3. Shared moments — *the part that outlives everyone*

You keep a memory of an afternoon. You may **offer** it to her archive. She
accepts or declines. If she accepts, she holds her own copy and may write her own
reflection on it.

Two accounts of the same day, in two people's words, kept for decades.

- Offering is explicit and per-memory. Nothing syncs automatically.
- Accepting **copies**, it does not share a row. Her copy is hers: she can edit
  her reflection, and deleting yours does not touch hers.
- The `Memory.personName` snapshot already added for deletion safety does the
  same work here.

---

## What never crosses

| | |
|---|---|
| Any score or metric | alignment, XP, level, streak, completion, neglect risk, domain balance |
| Journal entries | in any form, ever, including sentiment or word counts |
| Goals, missions, decisions | including their existence |
| Other people | your link to A tells B nothing about A, not even that A exists |
| Location, activity, "last seen" | there is no presence indicator; the app is not a chat |

**Note on the existing `PartnerLink`:** it shares exactly the wrong half. Its own
docstring commits to sharing "weekly completion, streak, domain balance" and
withholding all content. That is inverted relative to this design — it shares the
comparable numbers and hides the shared life. Linked Lives should either replace
it or be a distinct link type, and `PartnerLink`'s stat-sharing should be
reconsidered on its own terms.

---

## Data model sketch

```prisma
model LifeLink {
  id            String   @id @default(uuid())
  // Both directions are one row. Ordered by id so (a,b) and (b,a) cannot both exist.
  aUserId       String
  bUserId       String
  // How each side names the other, kept per-side: she is "Amma" to him and
  // "Harish" to her. Points at the Relationship row each already had.
  aRelationshipId String?
  bRelationshipId String?
  status        String   @default("pending")  // pending | active | ended
  invitedBy     String
  // Opt-ins, per side, default false.
  aSharesCadence  Boolean @default(false)
  bSharesCadence  Boolean @default(false)
  createdAt     DateTime @default(now())
  endedAt       DateTime?

  @@unique([aUserId, bUserId])
}
```

`ContactLog` gains `recordedByUserId` and an optional `lifeLinkId`. A contact
with a `lifeLinkId` is visible to both sides and counts for both.

`Memory` gains `offeredFromMemoryId` on the receiving copy, so provenance is
inspectable without coupling the rows.

---

## Flows

**Inviting.** From a person's page in People → *"Is Amma on Priority?"* → sends
to the address on her record. If she has an account, it appears as a pending link
in her People tab against the row she already has for you. If she does not, it is
a plain invitation with no data attached and no reminders.

**Accepting.** She sees: *"Harish would like to keep your shared record
together."* — with a plain list of exactly what that means and what it does not.
Accepting links the two `Relationship` rows.

**Living with it.** A contact logged by either side shows on both, marked with
who recorded it. Nothing else changes on either screen.

**Ending it.** Either side, unilaterally, no notification beyond the link
becoming inactive. Shared contacts already recorded stay in both records — they
happened. Memories already accepted stay with their recipient — they were given.
Nothing new crosses after the link ends.

---

## Failure modes to design against

**Surveillance.** The one-directional rule is load-bearing. Any feature that lets
A infer B's behaviour — even indirectly, even by absence — breaks it. Test every
new signal by asking: *can this make someone feel watched by a person who loves
them?*

**Coercion by proxy.** A parent who sets their cadence to "daily" is, in effect,
authoring a daily reminder in their child's app. Cap the influence: the cadence
signal should inform the child's own planning, not generate a daily card.

**Asymmetric adoption.** Most links will never be made. Never show an empty
"linked people" section, never badge a person as unlinked, never prompt twice.

**Death.** The app claims to hold an entire life; lives end. What happens to
shared memories and the surviving side's record needs an explicit answer before
launch, not after. The current instinct: accepted memories are unconditionally
the recipient's, which is the whole point of copy-on-accept.

**Abuse.** Invite-only through an existing contact address is the entire defence.
It holds as long as principle 2 holds.

---

## The reason to build it

Everything above is justified by the contact-truth problem alone. But the actual
ambition is longer.

This app is meant to hold a life. Lives end, and what survives them is the
record other people kept. A linked Priority is the only structure here where the
account of a relationship — her words and yours, about the same afternoons, over
thirty years — **outlives the people in it** and reaches whoever comes next.

That is not a social network. It is closer to a family bible with a database
underneath, and it is the one thing in this product that genuinely could not be
built by anyone optimising for engagement.

---

## Phasing

1. **Contact truth only.** Link, shared contact log, nothing else. Complete and
   worth shipping on its own.
2. **Shared moments.** Offer / accept / own copy.
3. **Cadence honesty.** Last, opt-in, off by default — it needs the most care and
   the most user trust already banked.

## Open questions

- Does a link belong to the two accounts, or to the two `Relationship` rows? (The
  sketch says accounts, joined *through* the relationships — but a person with two
  accounts breaks it.)
- Should a shared contact be reversible by one side, or does "it happened" win?
- What does the Record document say about a linked person, given the export is a
  full data dump and now contains facts another person recorded?
- Does the organism / constellation ever reflect a link? (Current instinct: **no**.
  The sky is one life. Two lives in one sky is a different product.)
