# Task: Final polish of the universal data-flow rules

## Context

The new universal data-flow rule was added in the right direction and is already useful.
The current rule pack now explicitly covers:

- staged data flow
- backend symmetry
- package ownership by stage
- store vs prepared input vs branch-local context

However, the new data-flow wording still needs one more small universal refinement.

This task is a polish task.
Do NOT rewrite the rule pack.
Do NOT make the rules project-specific.
Do NOT expand scope into code refactoring.

The goal is to strengthen the universality and remove the last ambiguity.

---

## Primary objective

Refine the universal data-flow rules so they clearly support multi-stage preparation and do not accidentally imply that preparation is always owned by a single package or a single module.

---

## Files to review

At minimum:

- `rules/architecture/dataflow.md`
- `rules/architecture/modules.md`
- `rules/architecture/packages.md`
- `AGENT.md`
- `QWEN.md`

Also verify consistency with:

- `rules/architecture/backends.md`
- `rules/project/stores.md`

---

## Remaining issues to fix

### 1. `rules/architecture/dataflow.md` is still slightly too linear

Current issue:
the current wording can still be read as if preparation is one stage owned by one place and directly produces the common prepared input.

That is too narrow.

What must be fixed:

- explicitly state that preparation may be multi-stage
- explicitly state that upstream preparation may span several layers or packages
- explicitly state that the common prepared input appears only after the full preparation chain completes
- explicitly state that the rule does not require one package to own all preparation

The final wording must make it clear that:

- there may be several preparation layers
- the execution entry point is defined by the existence of the shared prepared input
- the architecture should not collapse all preparation into one owner artificially

---

### 2. `rules/architecture/modules.md` is slightly too concrete in file-pattern wording

Current issue:
the wording around preparation can be interpreted too concretely as one file-role pattern.

What must be fixed:

- keep preparation guidance structural
- avoid implying that preparation is always one file or one module
- allow a preparation stage to be implemented by one or more focused modules

The file should stay structural and universal.

---

### 3. `rules/architecture/packages.md` should stay compatible with multi-stage preparation

Current issue:
the current package-ownership wording is good, but it should be checked and slightly refined if needed so it does not imply one preparation owner too early.

What must be ensured:

- package ownership can still be reasoned per stage
- preparation ownership may itself be staged
- the common prepared input owner is not confused with upstream preparation contributors

Keep this file concise.

---

### 4. Trigger wording should stay aligned

Check whether `AGENT.md` and `QWEN.md` still describe the trigger for data flow clearly enough after the refinement.

Only make a tiny wording change if needed.

Do not bloat the entry files.

---

## Required implementation approach

### Step 1 — Diagnose before editing

Provide a compact diagnosis table:

- file
- remaining ambiguity
- why it matters
- minimal wording correction needed

### Step 2 — Refine only the wording needed

Do not rewrite the structure.
Do not add project-specific examples.
Do not expand into implementation advice beyond architecture level.

### Step 3 — Verify universality

After editing, verify that the rule now works equally well for:

- one-stage preparation
- multi-stage preparation
- one-package preparation
- cross-package preparation
- one prepared input before backend branching

### Step 4 — Verify consistency across neighboring rules

Check consistency with:

- backend symmetry
- store semantics
- package ownership
- module structure

---

## Required deliverables

Provide:

1. The diagnosis table
2. The list of changed files
3. The exact before/after wording for the refined parts
4. A short note explaining how the final rule now supports multi-stage preparation without collapsing preparation into one owner
5. A short confirmation that the rule remains universal and project-agnostic

---

## Acceptance criteria

The task is complete only when all of the following are true:

- `dataflow.md` explicitly supports multi-stage preparation
- `dataflow.md` makes it clear that the common prepared input appears after the full preparation chain
- `dataflow.md` does not imply that one package must own all preparation
- `modules.md` stays structural and does not over-materialize preparation into one file pattern
- `packages.md` remains compatible with staged preparation ownership
- the result is still universal and reusable for any project
- no project-specific terminology is introduced

---

## Hard prohibitions

Do not:

- rewrite the data-flow rule from scratch
- make it Matrix-specific
- make it Fields-specific
- force one-package preparation ownership
- turn this into a code refactor task
- bloat the rule pack with unnecessary new files

---

## Final instruction

This is the last small universality pass.

Keep the architecture rule generic, make multi-stage preparation explicit, and ensure the rule describes where execution begins without collapsing all preparation into one owner.
