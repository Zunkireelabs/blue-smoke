# VERIFICATION_COPY.md — every user-facing string in the age check

**Purpose:** The copy deck for [F6](../system-design-ux/USER_FLOWS.md#f6). Closes the P0-7.0 box
*"Coaching-oriented copy for verification failures (spec §6.4) — never diagnostic"*.
**Date:** 2026-08-08 (Day 9). **Status:** draft — copy is cheap to change, so change it.

---

## The rule

> **Coach, never diagnose.** Tell the user what to *do differently*. Never tell them what the system
> *measured*, *decided*, or *suspected*.

This is not politeness. Three reasons, in order of how much they matter:

1. **A diagnostic message is an attack manual.** "The face didn't match closely enough" tells someone
   trying to pass with a borrowed ID exactly which variable to change. Every specific failure reason
   is a hint for the next attempt.
2. **We do not have the information.** Persona's SDK runs in its own process. We receive an
   `inquiry_id` and a status string. We could not display a similarity score if we wanted to — and
   the fact that we cannot is a feature (inviolable rule 1).
3. **A legitimate user does not care why.** They care what to do next. "Try again somewhere
   brighter" is more useful than any explanation.

Spec §6.4 adds: **Persona's own decline reasons must not be surfaced verbatim** if they reveal
matching internals.

### Banned, permanently

Scores or percentages · confidence values · thresholds · the words *match*, *mismatch*,
*similarity*, *liveness*, *spoof*, *fraud* · which specific check failed · how many checks there are
· anything naming a document field we supposedly read · Persona's raw reason strings · *"our system
detected…"*.

### Also avoid

**"Failed"** — it describes the person, not the attempt. Use *"didn't work"* or *"couldn't
complete"*. And never say **"rejected"**; a legitimate user who gets rejected by an app assumes the
app is broken, and they are usually right.

---

## F6.1 — Before we start

The screen that makes the ID request reasonable rather than invasive. It is doing real work: this is
where consent is actually informed.

> ### Let's check you're 18 or over
>
> It's a legal requirement before you can use a Blue Smoke device.
>
> **Our verification partner handles this.** You'll take a photo of your ID and a selfie inside
> their secure flow.
>
> **We never see either one.** They check your documents and tell us one thing: yes or no.
>
> `[ Continue ]`  ·  `[ Not now ]`

⚠️ **"Not now" must work.** It returns to a screen the user can leave. See F6.Z below.

---

## F6.2 — Camera priming

Shown **before** the OS dialog, never instead of it.

> ### Camera access
>
> Our verification partner needs your camera to photograph your ID and take a selfie.
>
> The photos go straight to them. Blue Smoke never receives them.
>
> `[ Allow camera ]`  ·  `[ Not now ]`

**Denied once:**
> ### We need the camera for this
> Without it we can't check your age, and a device can't be unlocked.
> `[ Try again ]`  ·  `[ Get help instead ]`

**Permanently denied** — a different screen, because "Try again" would do nothing:
> ### Camera access is turned off
> Turn it on in Settings, then come back — we'll pick up where you left off.
> `[ Open Settings ]`  ·  `[ Get help instead ]`

---

## F6.5 / F6.P — Waiting

**First ~2 minutes:**
> ### Checking your ID
> This usually takes under a minute. You can leave this screen — we'll let you know.

**After ~2 minutes** — stop implying imminence:
> ### Still checking
> This is taking longer than usual. Nothing's wrong, and you don't need to do anything.
> We'll notify you as soon as it's done.
> `[ Sign out ]`

⚠️ **Do not say "almost done".** We have no idea. The webhook has not arrived and we cannot see
inside the vendor's queue.

---

## F6.D — The decline ladder (spec §6.4)

Coaching must be **progressive**. Repeating one message three times reads as a broken app; a
different, more specific hint each time reads as help.

### Attempts 1–3 — retry freely

**Attempt 1** — assume the commonest problem, which is lighting:
> ### That didn't quite work
> Let's try once more. Somewhere bright, with your ID flat on a dark surface, usually does it.
> `[ Try again ]`

**Attempt 2** — assume glare, the second commonest:
> ### Let's try a different angle
> Glare from a light or window can hide part of the card. Tilt it slightly, or move away from direct
> light.
> `[ Try again ]`

**Attempt 3** — assume the wrong document:
> ### Let's check the document
> Use a current, government-issued photo ID — a driving licence or passport works best. Make sure
> it's not expired, and that the whole card is inside the frame.
> `[ Try again ]`

### Attempts 4–5 — add a way out

> ### Still no luck
> Sometimes it's the lighting, sometimes the card itself. It's worth one more try — but you don't
> have to keep going on your own.
> `[ Try again ]`  ·  `[ Get help ]`

### Attempt 6+ — pause the flow

> ### Let's pause here
> We'll give it a rest for 30 minutes. Trying repeatedly won't help, and there's a better route.
>
> **You can finish this with a person instead.** No more photos needed.
>
> `[ Get help ]`  ·  `[ Sign out ]`  ·  *Try again in 29:47*

⚠️ **The countdown must be honest, and the lock must survive a reinstall.** A counter in local state
is defeated by force-quitting the app, which means the ladder does nothing. Count server-side, keyed
on `user_id`.

⚠️ **No message on this ladder says why.** Every one says what to try next. That is the whole design.

---

## F6.C — Cancelled

Today this screen says *"You can try again whenever you're ready"* — and provides no way to
(**DE-7**). The copy is fine; the screen breaks its promise.

> ### Verification paused
> You can pick this up whenever you're ready. Nothing was saved.
> `[ Resume ]`  ·  `[ Do this later ]`  ·  `[ Sign out ]`

"Nothing was saved" is true and worth saying — a user who backed out of an ID scan wants to know
their half-taken photo is not sitting somewhere.

---

## F6.E — Something went wrong

Our error, not theirs. Say so.

> ### We couldn't start the check
> That's on us, not you. Give it a moment and try again.
> `[ Try again ]`  ·  `[ Get help ]`  ·  `[ Sign out ]`

---

## F6.X — We couldn't check (transport error)

⚠️ **This screen does not exist today, and its absence is a real bug.** A dropped network read
returns `'none'`, which the navigator treats as "never verified" and answers with an ID scan.

> ### We couldn't check your verification
> This looks like a connection problem, not a problem with your ID.
> `[ Retry ]`  ·  `[ Sign out ]`

⚠️ **Never render this as a decline.** A verified user on a flaky network must not be told to scan
their ID again. The distinction between "we don't know" and "no" is the entire point of this screen.

---

## F6.F — Manual fallback

> 🔴 **BLOCKED — OQ-2.** No owner, no channel, no SLA. The copy below uses a placeholder address and
> response window. **Replace both when the policy lands** — the layout should not need to change.

> ### Let's sort this out with a person
> Some IDs just don't photograph well. It's not a problem with you or your ID.
>
> Email **{{SUPPORT_EMAIL}}** and we'll take it from there. We usually reply within
> **{{SLA_WINDOW}}**.
>
> Include this reference so we can find your account: **{{REFERENCE}}**
>
> `[ Copy reference ]`  ·  `[ Open email ]`  ·  `[ Sign out ]`

⚠️ `{{REFERENCE}}` is a support reference, **not the `inquiry_id`**. Rule 1 prohibits displaying or
logging an `inquiry_id` next to anything that re-identifies the person, and a support email is
exactly that. Mint a separate opaque reference.

---

## F6.Z — Sign out, on every screen

Not copy so much as a placement rule, but it belongs here because it changes every screen above.

**Every screen in this document carries a sign-out.** Today a declined user is on the `verify` stack,
which has one screen, no sign-out and no support — while `sessionStatus` is `signedIn`, so the auth
stack is not mounted. **There is no exit.** Force-quit and relaunch restores the same state from the
Keychain.

Their only recourse is deleting the app. Every `[ Sign out ]` above is there for that reason.

---

## F6.8 — Verified

Do not overdo this. It is a legal checkbox, not an achievement.

> ### You're verified
> That's the age check done — you won't need to do it again.
> `[ Pair a device ]`

⚠️ **"You won't need to do it again" is unconfirmed.** Re-verification cadence is **OQ-5**. If the
client wants periodic re-checks, this line is a lie. Hold it until OQ-5 is answered, or soften to
*"That's the age check done."*

---

## Review checklist

Before any string here ships, check each one:

- [ ] Says what to **do**, not what the system **found**
- [ ] Contains no score, threshold, or named check
- [ ] Contains none of the banned words above
- [ ] Does not use *failed* or *rejected* about the person
- [ ] Would not help someone trying to pass with a borrowed ID
- [ ] Has a **visible exit** — retry, help, or sign out
- [ ] Is honest about what we don't know (no fake "almost done")
- [ ] Does not promise something the code does not do (see F6.C and F6.8 above)
