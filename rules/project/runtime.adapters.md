# Runtime Adapters

This rule defines how runtime and backend adapter classes should be used.

## Purpose

Use classes to isolate execution environments while keeping domain and package state ownership explicit.

## When to apply

Apply this rule when designing CPU/GPU, server/client, browser/node, or other runtime/backend adapters.

## Scope boundary

This rule defines runtime/backend class-owned state policy. Store semantics are in `rules/project/stores.md`, and backend API symmetry is in `rules/architecture/backends.md`.

## Requirements

- Use a class to isolate an execution environment or backend.
- A class may keep only backend-local persistent technical fields.
- Backend-local instance fields are ordinary technical fields, not stores.
- Simple internal fields on `this` are allowed, for example `this.states`, `this.bufferedChanges`, `this.device`, `this.pipeline`, `this.context`.
- Backend-local fields must not become a second source of truth for package/domain state.
- Keep data on `this` only when backend behavior needs it across calls.
- Package-level and domain-level store objects must not live in `this`.
- Temporary per-call computation data must stay local to the function that computes it.
- Do not store temporary computation data in `this`.
- Do not promote temporary per-call data into long-lived instance fields without clear backend-local need.
- Do not store temporary computation data in package or domain stores.
- Keep semantic operation names aligned across backends.
- Express backend difference by module namespace, not by inventing different operation names.

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
- treat backend-local fields as package/domain stores;
- create backend-specific public verbs for the same semantic operation;
- move temporary per-call data into long-lived runtime fields.

## Checklist

- [ ] Class role is backend or runtime isolation
- [ ] `this` fields are backend-local technical state only
- [ ] External store ownership is not moved into class instance state
- [ ] Same semantic operation names exist across backend modules
