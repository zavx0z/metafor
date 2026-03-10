# Task: Perform full module-boundary audit, relocate misplaced logic, and normalize Russian TSDoc

## Communication rule

The user communicates in **Russian**.
All user-facing summaries, explanations, and reports must be in **Russian**.

---

## Goal

Perform a full audit of module/function placement across Boundary / Fields / Matrix / GPU and finish the architectural cleanup.

At the same time:

- move every function/module to the level where it actually belongs
- remove remaining cross-layer leaks
- normalize TSDoc into **Russian**
- preserve the new canonical Boundary store architecture
- keep all critical performance notes explicit
- do not introduce semantic regressions

This task is polishing and boundary cleanup, not a return to the old packed-store model.

---

## Architecture that must remain intact

- **Boundary** owns the canonical global store
- **Fields** performs deduplication / preparation before writing to Boundary store
- **Matrix** consumes canonical Boundary store
- **CPU** executes directly from canonical store
- **GPU** derives local packed/buffer forms from canonical store

Do not regress from this architecture.

---

## Main issues to fix

### 1. Full module/function placement audit

You must audit all touched modules and determine whether each function is located in the correct layer.

Rule:
- logic must live at the level where it is actually needed
- no package should act as a convenience dump for helpers used elsewhere
- no architectural layer should import implementation details from a lower/execution-specific layer unless that dependency is explicitly correct

Classify each significant function/module as one of:
- Boundary canonical-store logic
- Fields deduplication / normalization logic
- Matrix canonical execution logic
- Matrix derived packing logic
- GPU-local execution/buffer logic
- neutral low-level shared helper

Move functions/modules accordingly.

---

### 2. Remove remaining layer leaks

#### Known current leak
`boundary.ts` still imports `createStringAtlasExport` from `matrix/gpu/string-pack`.

This is a wrong dependency direction:
- Boundary must not depend on GPU-local implementation helpers

#### Required action
Eliminate this leak.

Choose one correct option:
- move the export/debug helper to a lower layer where GPU-local packing is already valid
- or move the needed functionality to a neutral export/debug helper layer
- but do not keep `boundary -> matrix/gpu` dependency

The result must have clean dependency direction.

---

### 3. Re-check whether `atlas` package is still needed at all

`fields/string-table.ts` no longer owns atlas/UTF-32 packing and GPU-local packing is now in `matrix/gpu/string-pack.ts`. 

#### Required action
Audit the old `boundary/atlas/*` package.

If it is no longer used meaningfully:
- remove it completely

If some compatibility path still requires it:
- isolate and deprecate it explicitly
- ensure it is no longer part of the actual architecture

Do not leave dead or misleading architectural packages in place.

---

### 4. Re-check `deriveMatrixData()` and matrix-local helper boundaries

`matrix/derived.ts` is now in a much better place and split into steps.  [oai_citation:6‡derived.ts](https://github.com/zavx0z/metafor/blob/arch/boundary/matrix/derived.ts)  
But it still needs module-boundary review:

- does every helper inside `matrix/derived.ts` truly belong there?
- should some helpers move into:
  - `matrix/pack`
  - `matrix/bytecode`
  - `matrix/heap`
  - GPU-local modules
  - neutral low-level helpers

#### Required action
Review and relocate helpers if needed so that:
- derived packing stays modular
- boundaries stay clear
- future maintenance is easier

Do not move things unnecessarily, but do not keep wrongly placed helpers either.

---

### 5. Re-check Boundary store schema ownership

`BoundaryFieldRecord` now stores `enum`, which is correct.  [oai_citation:7‡store.t.ts](https://github.com/zavx0z/metafor/blob/arch/boundary/store.t.ts)

#### Required action
Verify that all schema information required by:
- update normalization
- CPU interpretation
- GPU derived packing
- debug/export helpers

is now truly available from canonical Boundary store.

If anything important still lives outside the store, move it into the store or make the dependency explicit and correct.

---

### 6. Russian TSDoc normalization

All touched modules must use **Russian TSDoc** consistently.

That includes:
- package documentation
- public interfaces
- exported functions/classes
- critical architectural comments
- critical performance notes

#### Required action
Normalize TSDoc/comment style so that:

- it is written in Russian
- it reflects the new architecture
- it does not describe the old packed-store model as canonical truth
- it clearly distinguishes:
  - canonical store
  - derived runtime forms
  - CPU direct execution
  - GPU local packing

Do not leave mixed old/new narratives in comments.

---

### 7. Preserve and improve critical performance notes

The current GPU runtime now has meaningful performance notes and partial update behavior.  [oai_citation:8‡index.ts](https://github.com/zavx0z/metafor/blob/arch/boundary/matrix/gpu/index.ts)

These notes must be preserved and improved where needed.

#### Required action
Keep explicit comments about:

- canonical truth remaining in Boundary store
- partial GPU update path
- structural refresh fallback
- remaining memory duplication
- remaining O(N) refresh costs on exhausted capacity / incompatible layout
- future optimization directions

Do not hide performance debt.
Do not overstate current performance.
Be explicit and technically honest.

---

### 8. Audit for semantic regressions

Because module relocation can easily change behavior accidentally, you must check that:

- CPU transition evaluation semantics remain unchanged
- lock semantics remain unchanged
- shared block / entangled value lookup semantics remain unchanged
- string-id semantics remain unchanged
- GPU derived packing remains behaviorally equivalent to previous correct version

If behavior changes, explain and justify them explicitly.

---

## Files to inspect

At minimum inspect and fix as needed:

- `boundary/boundary.ts`
- `boundary/store.ts`
- `boundary/store.t.ts`
- `boundary/store.access.ts`
- `boundary/fields/*`
- `boundary/matrix/derived.ts`
- `boundary/matrix/constants.ts`
- `boundary/matrix/pack.ts`
- `boundary/matrix/bytecode.ts`
- `boundary/matrix/heap.ts`
- `boundary/matrix/cpu/*`
- `boundary/matrix/gpu/*`
- `boundary/atlas/*`

Also inspect related tests and update them if module relocation affects them.

---

## Validation requirements

After completion verify all of the following:

1. Every significant function/module is in the correct architectural layer.
2. No remaining `boundary -> matrix/gpu` dependency leak exists.
3. Matrix does not depend on misplaced Fields implementation helpers.
4. Atlas package is either removed or explicitly reduced to non-architectural compatibility residue.
5. Boundary store remains canonical truth.
6. CPU still executes directly from canonical store.
7. GPU still derives packed forms locally.
8. No semantic regressions were introduced.
9. TSDoc in touched files is Russian and aligned with the new architecture.
10. Critical performance notes are preserved and explicit.

---

## Deliverables

1. Refactored module/function placement
2. Clean dependency graph between layers
3. Russian TSDoc normalization in touched files
4. Atlas cleanup/removal decision implemented
5. Updated tests if needed
6. Final Russian report including:
   - what was moved and why
   - what dependency leaks were removed
   - whether `atlas` was deleted or deprecated
   - whether all schema truth now lives in Boundary store
   - what critical performance limitations still remain
   - what was intentionally left as technical debt

---

## Acceptance criteria

The task is complete only if all of the following are true:

- module/function placement matches actual responsibility boundaries
- no architectural layer leaks remain in the touched area
- Russian TSDoc is consistent and accurate
- canonical Boundary store architecture is preserved
- CPU/GPU behavior is still correct
- critical performance caveats are documented explicitly