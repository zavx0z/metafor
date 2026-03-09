# Runtime Adapters

This rule defines how runtime and backend adapter classes should be used.

## Purpose

Use classes to isolate execution environments while keeping domain and package state ownership explicit.

## When to apply

Apply this rule when designing CPU/GPU, server/client, browser/node, or other runtime/backend adapters.

## Scope boundary

This rule defines runtime/backend class-owned state policy. Store semantics are in `rules/project/stores.md`, backend API symmetry is in `rules/architecture/backends.md`, and staged input flow is in `rules/architecture/dataflow.md`.

## Requirements

- Use a class to isolate an execution environment or backend.
- Runtime adapters are post-branch implementation adapters.
- Runtime adapters own only branch-local technical materialization for their implementation.
- Runtime adapters are not preparation layers.
- Parallel backends that implement one runtime role must share one strict abstract contract.
- Prefer `interface` for that shared contract by default.
- Use `abstract class` for the shared contract only when there is a real shared lifecycle or shared base behavior.
- A class may keep only backend-local persistent technical fields.
- Backend-local instance fields are ordinary technical fields, not stores.
- Simple internal fields on `this` are allowed, for example `this.states`, `this.bufferedChanges`, `this.device`, `this.pipeline`, `this.context`.
- Backend-local fields must not become a second source of truth for package/domain state.
- Keep data on `this` only when backend behavior needs it across calls.
- Package-level and domain-level store objects must not live in `this`.
- Prepared input may enter the adapter, but branch-local technical state must be derived from it after branching.
- Temporary per-call computation data must stay local to the function that computes it.
- Do not store temporary computation data in `this`.
- Do not promote temporary per-call data into long-lived instance fields without clear backend-local need.
- Do not store temporary computation data in package or domain stores.
- Keep semantic operation names aligned across backends.
- Express backend difference by module namespace, not by inventing different operation names.
- Keep contract shape aligned across backends for the same operation:
  - same required arguments;
  - same optional arguments;
  - same return shape;
  - same public meaning.
- Do not use convenience signature drift where one backend requires external state in a method but another backend does not.
- If external state is part of the contract, all backend implementations must accept it in the same place.
- If external state is not part of the contract, none of the backend implementations may require it in that operation.

## Preferred style

```typescript
import * as cpu from "./cpu"
import * as gpu from "./gpu"

cpu.step(boundary$, runtime)
gpu.step(boundary$, runtime)
```

## Forbidden

Do not:

- use class instance state to hide external package or domain stores;
- use runtime adapters as the ownership layer for preparation data;
- treat backend-local fields as package/domain stores;
- create backend-specific public verbs for the same semantic operation;
- move temporary per-call data into long-lived runtime fields.
- allow required/optional signature drift between backend implementations of one operation.
- rely on nominally shared types while backend method semantics differ.

## Checklist

- [ ] Class role is backend or runtime isolation
- [ ] `this` fields are backend-local technical state only
- [ ] External store ownership is not moved into class instance state
- [ ] Same semantic operation names exist across backend modules
- [ ] One strict shared abstract contract is used for parallel backends
- [ ] Required/optional arguments and return shape match across backends
