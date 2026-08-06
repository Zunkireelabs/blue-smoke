# Session log

A working journal. **One file per developer**, append-only, newest entry at the top.

| File | Developer |
|---|---|
| [`sadin.md`](sadin.md) | Sadin |
| [`anish.md`](anish.md) | Anish |
| [`hardik.md`](hardik.md) | Hardik |

Read them all with `cat docs/session-log/*.md`. Nothing here is private — that's the point.

---

## Why this exists

Three people work apart on feature branches and see each other mainly through merged PRs. A PR
tells you *what* landed. It doesn't tell you what was tried and abandoned, which assumption turned
out to be wrong, or what someone is quietly blocked on.

That knowledge has been living in chat logs, where it dies. Concretely, in the first six days this
project lost track of: the client-supplied hardware findings, the fact that the build machine's
constraints changed completely, and the reason a spec section could not be trusted. None of it was
secret. It just was never written anywhere the other two could find it.

**The cost of not having this is measured in duplicated work and repeated mistakes.** Both are
expensive on a 30-day timeline.

## Why one file per developer, and not one shared log

A journal appends at a fixed anchor — everyone writes a new entry in the same place. Git cannot
auto-merge two inserts at the same position, so with three people on separate branches, *every* PR
adding an entry would conflict with *every* other PR adding one. Daily.

We already know how that goes: `docs/execution-briefs/README.md` was created independently on two
branches and needed hand-resolution. `CLAUDE.md` carries a whole "announce before editing" section
because contested files hurt.

The real damage isn't the conflict, it's what the conflict does to the habit. **People stop writing
entries when writing one costs a merge resolution.** So: you touch only your own file, and there is
nothing to conflict with. Attribution is structural rather than a header convention that decays.

If you want the merged chronology, git already has it:

```bash
git log --all --format='%ad %an %s' --date=short
```

## What goes in, and what doesn't

> **The journal records what happened and why. `docs/**` records what is true.**

If an entry still matters a week later, it has outgrown the journal — **promote it to a real
document and link to it from the entry.** A fact that only exists in a session log is one step
better than a fact that only exists in a chat log, and one step worse than a fact that exists where
someone would think to look for it.

**Worth writing:**

- A decision and the reasoning behind it, especially one you'd otherwise have to re-derive
- Something you tried that didn't work, so nobody repeats it
- A blocker, particularly one that needs someone else to move
- An environment or tooling gotcha that cost you more than ten minutes
- An assumption you're proceeding on that might be wrong

**Not worth writing:**

- What the diff already says. Commit messages carry that.
- A task list. That's what `docs/project-roadmap-todos/` is for.
- Anything covered by the 🔴 rules — no ID images, no biometric data, no keys, no secrets. The
  journal is a normal file in a normal repo.

## Entry format

Newest at the top. ISO dates. Append-only — **don't edit past entries to make them look better**;
a journal that gets tidied retroactively is worth nothing. If you were wrong, write a new entry
saying so.

Drop any line that doesn't apply. Don't pad it.

```markdown
## YYYY-MM-DD — one-line summary

**Branches:** feature/P1-4.0-bonding-flow
**Landed:** PR #12 into stage, CI green
**Decided, and why:** ...
**Tried and abandoned:** ...
**Blocked / needs someone else:** ...
**Gotcha worth stealing:** ...
```

## When to write

End of a working session, or when something happens that the other two would want to know.
Two minutes. It goes in the same PR as the work it describes, so it's never a separate chore —
except when there's nothing to land, in which case push it on its own.
