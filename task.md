# Task: Generalize the architecture rules around data flow so they work for any project level

## Context

The current rule pack already covers:

- module structure
- package ownership
- store semantics
- runtime/backend adapters
- backend API symmetry
- testing

However, one important architectural rule is still missing in a sufficiently general form:

the system does not yet define data flow itself as a first-class architectural principle.

This is causing ambiguity in practice:

- it is hard to tell where data is prepared
- it is hard to tell where execution actually begins
- it is hard to tell where one shared input branches into backend- or implementation-specific representations
- it is hard to draw a data-flow diagram directly from the rules
- abstractions remain too high-level and do not sufficiently constrain how data moves through the system

This task must fix that.

---

## Primary objective

Add and refine architecture rules so that data flow is described explicitly and generically enough to apply to any project level, not only to Matrix or this repository.

The new rules must be universal and reusable.
They must describe architectural stages and responsibilities in a way that works for:

- domain preparation pipelines
- runtime systems
- backend adapters
- server/client boundaries
- CPU/GPU variants
- any layered execution architecture built on staged data flow

---

## Core principle to introduce

Architecture must explicitly describe data flow as staged transformation:

### Stage 1 — Preparation

A preparation layer validates, normalizes, compiles, encodes, or assembles data.

### Stage 2 — Common execution input

Preparation produces one explicit backend-agnostic / implementation-agnostic input object.

This is the single input point into the execution subsystem.

### Stage 3 — Branching / materialization

Only after that common input point may the flow branch into implementation-specific materialization:

- CPU/GPU
- server/client
- browser/node
- adapter A / adapter B
- local/remote execution
- any other parallel implementation path

### Stage 4 — Execution

Each branch executes the same abstract contract using its own local technical representation.

---

## Universal architectural distinctions that must become explicit

The updated rules must clearly distinguish these categories:

### 1. Preparation data

Intermediate data used to validate, normalize, encode, compile, assemble, or derive a common execution input.

### 2. Common prepared input

The minimal shared input required by all parallel implementations of one execution role.

### 3. Branch-local materialization

Implementation-specific technical state derived from the common prepared input after branching.

### 4. Source-of-truth stores

Package/domain-level owned persistent state with explicit ownership and invariants.

### 5. Temporary per-call computation data

Ephemeral local variables that do not belong in stores and do not need to persist in long-lived instance state.

---

## Important universal rule

Do not confuse these categories.

The rules must explicitly prevent:

- preparation logic becoming runtime/backend ownership
- source-of-truth store being confused with prepared input
- branch-local context being confused with store
- temporary local data being promoted into store or long-lived instance fields
- one implementation receiving conceptually different input than another implementation of the same role

---

## Scope of rule updates

Review and refine at minimum:

- `rules/architecture/packages.md`
- `rules/architecture/modules.md`
- `rules/architecture/backends.md`
- `rules/project/stores.md`
- `rules/project/runtime.adapters.md`
- `AGENT.md`
- `QWEN.md` only if trigger wording requires a small change

You may add one new dedicated rule file if needed, but only if that improves clarity without bloating the pack.

Preferred possible location:

- `rules/architecture/dataflow.md`

If you add it:

- keep it universal
- do not make it Matrix-specific
- update trigger maps minimally

---

## What the new rules must say, in universal form

The resulting architecture rules must make these statements explicit:

### A. Every execution subsystem should have one explicit common input point

If multiple implementations perform the same runtime or execution role, they must begin from one shared prepared input contract.

### B. Branching happens after the common input point

Implementation-specific state or resources must only appear after the shared input enters the execution subsystem.

### C. The common input contains only truly shared data

Do not place implementation-specific convenience data into the common input unless it is genuinely part of the shared execution contract.

### D. Implementation-specific context is local technical materialization

Branch-local execution context is not a store and not a source of truth by default.

### E. Store, prepared input, and implementation-local context are different architectural entities

These must remain distinct both in naming and in ownership.

### F. The rules should be usable to draw a direct data-flow diagram

A reader should be able to infer:

- where preparation happens
- where common input is formed
- where branching happens
- where execution happens
- which data stays shared
- which data becomes branch-local

---

## Required changes by rule area

### 1. `rules/architecture/packages.md`

Add concise but universal guidance that package placement should respect data-flow stage ownership:

- preparation ownership
- common input ownership
- execution ownership
- branch-local ownership

Do not make this file long.
Keep it package-level.

### 2. `rules/architecture/modules.md`

Clarify that module structure should reflect stage boundaries where relevant:

- preparation modules
- orchestration entry modules
- branch-specific modules
- helper modules
- type modules

Do not overload this file with runtime philosophy.
Keep it structural.

### 3. `rules/architecture/backends.md`

Extend it so backend symmetry includes one shared conceptual input model before branching.

The file must make it clear that:

- symmetry is not only about method names and signatures
- symmetry also means parallel implementations branch from the same prepared input contract

### 4. `rules/project/stores.md`

Refine it so store semantics are explicitly distinguished from:

- prepared input objects
- branch-local technical contexts
- temporary local computation data

Do not broaden `$`.
Keep store semantics strict.

### 5. `rules/project/runtime.adapters.md`

Refine it so runtime adapters are explicitly defined as:

- post-branch implementation adapters
- owners of branch-local technical materialization only
- not preparation layers
- not source-of-truth store owners

### 6. Optional new file: `rules/architecture/dataflow.md`

If needed, introduce a new universal rule dedicated to data flow stages.

If you add this file, it must define:

- preparation
- common input
- branching
- branch-local materialization
- execution
- source-of-truth store distinction
- temporary data distinction

It must remain universal and reusable across projects.

---

## Requirements for universality

The new rule wording must NOT depend on:

- Matrix
- Fields
- MetaFor-specific terms
- GPU-specific logic
- one exact project layout

Instead, it must work for any architecture where:

- one layer prepares data
- another layer accepts common prepared input
- parallel implementations materialize local execution context
- execution proceeds under one shared contract

---

## Required implementation approach

### Step 1 — Diagnose the missing rule

Produce a compact diagnosis:

- what current ambiguity exists
- why current architecture rules are insufficient
- why data flow must be a first-class rule

### Step 2 — Draft the universal data-flow architecture rule

Either:

- refine existing files only,
or
- add one dedicated universal `dataflow` rule plus minimal supporting refinements elsewhere

Choose the cleaner option.

### Step 3 — Align adjacent rules

Adjust:

- packages
- modules
- backends
- stores
- runtime adapters

so their boundaries stay clean and consistent with the new data-flow rule.

### Step 4 — Update entry triggers if needed

Only if needed, add a small trigger in:

- `AGENT.md`
- `QWEN.md`

for tasks involving:

- data flow
- staged architecture
- preparation vs execution
- shared input vs backend-local materialization

### Step 5 — Verify diagram-readiness

At the end, confirm that the final rules are sufficient to draw a direct staged data-flow diagram for a new system without guessing hidden architectural conventions.

---

## Required deliverables

Provide:

1. A diagnosis summary
2. The exact files changed
3. The exact universal architectural rule text added or refined
4. A short explanation of why the new wording is universal rather than project-specific
5. A short note describing the final staged data-flow model in plain language
6. A confirmation that the rule pack now distinguishes:
   - store
   - prepared input
   - branch-local context
   - temporary local data

---

## Acceptance criteria

The task is complete only when all of the following are true:

- the rule pack explicitly defines staged data flow
- the rule pack defines one shared prepared input point before branching
- the rule pack distinguishes common input from branch-local materialization
- the rule pack distinguishes store from prepared input and from local context
- the rule wording is universal and reusable across projects
- the rule pack is more useful for drawing data-flow diagrams directly
- no project-specific terminology is required to understand the new architecture rule

---

## Hard prohibitions

Do not:

- make the rule Matrix-specific
- make the rule GPU-specific
- use project-only terms as the primary abstraction
- weaken existing store/runtime/backend distinctions
- collapse multiple rule responsibilities into one bloated file
- turn this into a code refactor task

---

## Final instruction

Treat data flow as a universal architecture rule.

The goal is to make the rule pack strong enough that, for any project layer, an agent can tell:

- where data is prepared,
- where shared execution input is formed,
- where branching begins,
- what stays common,
- what becomes local,
- and how to diagram the architecture without guessing.
