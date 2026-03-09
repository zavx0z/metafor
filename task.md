# Task: Fix rule violations introduced by the recent Matrix refactor

## Context

The recent Matrix refactor introduced multiple architectural and rule-level mistakes.

This task is NOT about continuing the refactor freely.
This task is about identifying and correcting the mistakes created by the previous agent.

You must work from the current repository state and the current rule system.
Do not invent a new architecture.
Do not expand scope.
Do not rewrite unrelated code.

Your goal is to restore compliance with the project rules and with the clarified project style discussed in this session.

---

## Primary objective

Fix the mistakes introduced in `boundary/matrix` and related testing/rule usage by applying the existing rule system correctly and minimally.

---

## Required review scope

Review at least:

- `AGENT.md`
- `rules/architecture/packages.md`
- `rules/architecture/modules.md`
- `rules/engineering/fp.md`
- all changed files in `boundary/matrix/**`
- all Matrix-related tests added or moved by the previous agent

---

## What went wrong and must be fixed

### 1. External store handling was corrupted

The previous agent treated external store-like data incorrectly.

Problems to detect:

- external package/domain store hidden inside class instance state
- store decomposed into fragmented function parameters
- store access became less obvious than `store$.field`

Required correction:

- if an external package/domain store is used, keep it explicit
- do not hide it as instance-owned state
- do not explode it into signature fragments when it is conceptually one store
- restore obvious access style through the store object

Important:
This rule applies specifically to real package/domain store objects.
Do not misuse `$` for ordinary local technical data.

---

### 2. `$` naming was applied too broadly

The previous agent treated `$` as a generic marker for any mutable thing.

Problems to detect:

- local technical runtime structures named like store objects
- temporary or helper-level mutable values named as if they were package/domain stores
- fake store semantics introduced through naming

Required correction:

- keep `$` only for real package/domain store objects
- ordinary local runtime fields must use ordinary names
- internal technical class fields must not pretend to be stores

Examples of acceptable ordinary instance fields:

- `states`
- `bufferedChanges`
- `context`
- `device`
- `pipeline`

---

### 3. Runtime class role became unclear

The previous agent used classes in a way that blurred the boundary between:

- backend adapter
- external store owner
- temporary computation container

Required correction:

- a class may exist only as an isolated execution/backend adapter
- it may hold backend-local persistent technical fields
- it must not become hidden owner of external package/domain store
- temporary computation data must remain local to the function where it is used
- do not put temporary data into store
- do not add unnecessary instance fields for one-step computation

---

### 4. Backend symmetry drifted

The previous agent introduced or encouraged asymmetry between CPU and GPU runtime operations.

Required correction:

- CPU and GPU implementations must expose the same semantic operations
- do not invent asymmetric semantic names when the operation is the same
- prefer backend distinction through module namespace, not through operation renaming
- preserve one stable contract across implementations

Target style:

- same operation names across CPU/GPU
- backend distinguished by module path / namespace

---

### 5. Module boundaries became muddled

Problems to detect:

- orchestration mixed with helper logic
- public surface mixed with implementation detail
- technical state handling spread across too many unrelated files without a clear center

Required correction:

- restore clear module roles according to the existing module rule
- public API through `index.ts`
- orchestrator as coordination point
- helpers focused
- types isolated in `*.t.ts`
- stores only where there is true ownership

---

### 6. Test ownership and placement were mishandled

Problems to detect:

- Matrix-specific tests placed above the owning package
- package-local logic validated from generic shared test folders
- helper imports treated as justification for moving tests out of the owning package

Required correction:

- if the test validates Matrix behavior, keep it inside Matrix
- helper import origin does not change test ownership
- top-level tests are only for true cross-package integration
- do not add dependencies only to support package-local tests when relative monorepo imports are enough

---

### 7. CPU/GPU parity was not properly proven

Problems to detect:

- no clear canonical parity cases
- no deterministic repeated execution checks
- no proof that CPU and GPU produce the same observable results
- hidden state reuse between tests

Required correction:

- use one canonical case set for both runtimes
- compare CPU and GPU results directly
- verify repeated deterministic execution
- ensure fresh setup per test
- report any behavioral divergence as a rule violation, not as a cosmetic difference

---

## Required implementation approach

### Step 1 — Diagnose before editing

Before changing files, produce a concise diagnosis table:

- file
- detected problem
- violated rule
- required minimal correction

Do not skip this step.

### Step 2 — Make minimal corrections

Fix only what is necessary to restore rule compliance.

Do not:

- perform unrelated cleanup
- rename large areas for style only
- move files without ownership reason
- continue speculative refactoring

### Step 3 — Preserve useful structure

If the previous agent introduced something useful, keep it.
Only remove the parts that violate the rules or the clarified project style.

### Step 4 — Verify by tests

Run targeted Matrix tests first.
Then run the broader test suite required by the project workflow.

---

## Required deliverables

Provide:

1. A short diagnosis of each introduced mistake
2. The exact files changed
3. The reason for each change
4. The minimal architectural correction applied
5. The final test result
6. Any remaining issue that could not be safely fixed in this task

---

## Acceptance criteria

The task is complete only when all of the following are true:

- external package/domain store is no longer mishandled
- `$` naming is no longer used for ordinary local technical state
- runtime classes only hold backend-local persistent technical fields
- temporary computation data is not stored unnecessarily
- CPU and GPU expose symmetric semantic operations
- Matrix tests live with Matrix unless they are true cross-package integration tests
- CPU/GPU parity is explicitly checked
- the fix is minimal and does not discard useful existing structure

---

## Hard prohibitions

Do not:

- rewrite Matrix from scratch
- replace the architecture with a new personal preference
- hide external store inside class instance state
- use `$` for ordinary local technical values
- move Matrix package tests into top-level shared test directories
- add dependencies only to support local test helpers
- declare the task complete without explicit parity verification

---

## Final instruction

Treat this task as a repair task, not as an open-ended refactor.

The goal is to remove the mistakes introduced by the previous agent while preserving the useful parts of the current codebase.
