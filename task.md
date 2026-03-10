# Task: Remove `getMatrixState()`, eliminate all re-exports, leave only real Boundary API

## Communication rule

The user communicates in **Russian**.
All user-facing summaries and explanations must be in **Russian**.

---

## Goal

Finish the final API and boundary cleanup:

- remove `getMatrixState()` completely
- remove all broad re-exports from `boundary.ts`
- leave only the real Boundary public API
- preserve the new canonical Boundary store architecture
- preserve CPU/GPU behavior
- keep comments/TSDoc in Russian

This is a cleanup/polish task.
Do not revert the canonical store refactor.

---

## Architectural rule to preserve

- **Boundary** owns the canonical global store
- **Fields** prepares/deduplicates before writing to Boundary store
- **Matrix** consumes Boundary store
- **CPU** reads canonical store directly
- **GPU** derives local packed/buffer forms from canonical store

The public API must reflect this architecture instead of mixing layers back together.

---

## Required changes

### 1. Delete `getMatrixState()`
Remove `getMatrixState()` entirely.

Reason:
- it is not part of the canonical architecture
- it rebuilds derived packed forms from canonical store
- it pulled GPU-local string packing up into `boundary.ts`
- it acts like a compatibility/debug/export tail rather than real Boundary API

If anything still depends on it:
- update the call site
- or move truly necessary debug/export logic into a dedicated lower-level debug/export module
- but do not keep `getMatrixState()` in `boundary.ts`

The expected end state is:
- `getMatrixState()` no longer exists

---

### 2. Remove all re-exports from `boundary.ts`
`boundary.ts` must stop acting as a convenience hub for re-exporting functions/types from:
- `fields`
- lower-level helpers
- matrix-derived internals
- packing/bytecode/heap helpers

This file must expose only the true Boundary public API.

#### Keep only real Boundary API exports
Only leave exports that belong to Boundary as the top-level public interface, for example:
- `write`
- `update`
- `unlock`
- `flattenBoundaryData` only if it is intentionally public
- `prepareData` only if it is intentionally public
- `reset` only if it is intentionally public/test-facing by design
- Boundary-level types that are genuinely part of the public API

#### Remove re-export noise
Do not re-export from `boundary.ts` things like:
- fields internals
- encoding helpers
- heap helpers
- bytecode helpers
- string packing helpers
- low-level matrix helpers
- anything that belongs to another layer/module

If some external code needs those modules, it must import them directly from their own location.

---

### 3. Keep module boundaries clean
After removing re-exports, verify:

- Boundary API remains Boundary-only
- Fields modules are imported directly where needed
- Matrix modules are imported directly where needed
- no accidental new dependency leak is introduced

This task is specifically about making the module graph honest.

---

### 4. Update TSDoc/comments in Russian
After removing `getMatrixState()` and re-exports:

- clean `boundary.ts` TSDoc
- remove outdated descriptions of compatibility/export/debug behavior
- keep comments in Russian
- describe only the actual public Boundary API that remains

Do not leave stale comments referring to removed exports or removed debug helpers.

---

### 5. Check for broken imports after re-export removal
Because some code may have relied on `boundary.ts` as an aggregator, audit and fix imports across the repo.

Expected rule after cleanup:
- modules import from the actual owner module
- not from a convenience re-export barrel

---

## Files to inspect

At minimum:

- `boundary/boundary.ts`
- any files importing from `@boundary/boundary` / `boundary.ts`
- tests relying on re-exported helpers
- any code that referenced `getMatrixState()`

---

## Validation requirements

After completion verify all of the following:

1. `getMatrixState()` is fully removed.
2. `boundary.ts` no longer re-exports lower-level helpers.
3. `boundary.ts` exposes only true Boundary API.
4. No imports remain broken after re-export removal.
5. Canonical Boundary store architecture is unchanged.
6. CPU still executes correctly from canonical store.
7. GPU still derives packed forms locally.
8. No accidental semantic regression was introduced.
9. TSDoc/comments in touched files are in Russian and reflect the final API honestly.

---

## Deliverables

1. Code cleanup
2. `getMatrixState()` removed
3. Re-exports removed
4. Imports fixed across the repo
5. Updated Russian TSDoc/comments
6. Final Russian summary including:
   - what was removed
   - what remains as the real Boundary API
   - whether any callers had to be updated
   - confirmation that canonical store architecture was preserved

---

## Acceptance criteria

The task is complete only if all of the following are true:

- `getMatrixState()` does not exist anymore
- `boundary.ts` is no longer a barrel for lower-level modules
- only real Boundary API remains exported there
- layer boundaries are cleaner than before
- canonical store / CPU / GPU architecture remains correct