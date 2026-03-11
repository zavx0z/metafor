# Data Flow Architecture

This rule defines staged data flow as a first-class architectural principle.

## Purpose

Make data flow explicit so a reader can identify where preparation happens, where shared execution input is formed, where branching begins, and what remains local to each implementation.

## When to apply

Apply this rule when designing or reviewing staged execution systems, preparation pipelines, parallel backends, adapter boundaries, or data-flow diagrams.

## Scope boundary

This rule describes staged flow inside one execution role or one domain path.
It does not define the global system topology between parallel domains such as `Bulk` and `Boundary`.
Each parallel domain may own its own preparation chain and its own prepared input.

## Requirements

Treat execution flow as these stages:

1. Preparation
2. Common input
3. Branching and materialization
4. Execution

Stage rules:

- Preparation validates, normalizes, compiles, encodes, assembles, or derives execution data.
- Preparation may be multi-stage and may span several layers, modules, or packages.
- No single package is required to own the entire preparation chain.
- One explicit common prepared input appears only after the full preparation chain for one execution role completes.
- The common prepared input is the single shared input point into parallel implementations of that role.
- Different domains or roles may each have their own common prepared input.
- Branching may happen only after the common prepared input exists.
- Branch-local materialization may derive implementation-specific technical representations from that common input.
- Execution runs the shared contract using each branch's local technical representation.
- Crossing from one domain to another requires an explicit transfer contract and must not be inferred from this staged-flow rule.

Keep these data classes distinct:

- Preparation data: intermediate data used before the common input exists.
- Preparation chain: one or more upstream preparation stages that lead to the common prepared input.
- Common prepared input: minimal shared input required by all implementations of one execution role.
- Branch-local materialization: implementation-specific technical context derived after branching.
- Source-of-truth store: owned package/domain state with explicit ownership and invariants.
- Temporary per-call data: ephemeral local variables used only inside one call.

## Forbidden

Do not:

- treat preparation data as execution-owned branch state;
- collapse a multi-stage preparation chain into one artificial owner when ownership is actually distributed;
- treat common prepared input as a source-of-truth store by default;
- place implementation-specific convenience data into the common prepared input unless it is truly shared by all implementations of that role;
- let one backend or implementation begin from a conceptually different prepared input than another implementation of the same role;
- read this rule as if it defines one linear pipeline for the whole system when domains are architecturally parallel;
- promote temporary per-call data into a store or long-lived instance state without need.

## Checklist

- [ ] Preparation is explicit, even when it spans multiple stages
- [ ] One common prepared input exists before branching
- [ ] Branch-local materialization begins only after the common input point
- [ ] Store, prepared input, branch-local context, and temporary data are distinct
- [ ] The flow can be drawn as a direct staged diagram without hidden conventions
