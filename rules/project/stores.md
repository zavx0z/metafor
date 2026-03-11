# Store Semantics

This rule defines what a real store is and when `$` naming is allowed.

## Purpose

Keep store semantics strict so mutable runtime details are not confused with package or domain state.

## When to apply

Apply this rule when naming or shaping state objects, passing state through APIs, or deciding where state should live.

## Scope boundary

This rule defines store semantics and store ownership only. Runtime class state policy is in `rules/project/runtime.adapters.md`, naming constraints are in `rules/project/naming.md`, and staged input flow is in `rules/architecture/dataflow.md`.

## Requirements

- Use `$` suffix only for real package-level or domain-level source-of-truth store objects.
- In MetaFor, real domain source-of-truth stores live at the domain `store.ts` level.
- `store.t.ts` defines the domain store contract; `store.ts` is the concrete source of truth.
- Persistence alone is not enough to classify a value as a store.
- Backend-local persistent technical fields are not stores.
- Prepared input objects are not stores by default.
- Branch-local technical contexts are not stores by default.
- Pass external stores as whole objects.
- Do not split an external store into signature fragments such as `heap`, `bytecode`, `offsets`, or `blockPtrs`.
- Keep access style explicit as `store$.field`.
- Do not hide package or domain stores inside backend instance fields.
- When parallel backends share one operation contract, store presence in that contract must stay symmetric across implementations.
- Treat store as source of truth, not scratch space.
- Keep temporary computation data in local function variables.
- Inter-domain transfer does not create shared store ownership; transfer contracts remain distinct from domain stores.

## State classes

- Package/domain store: source-of-truth state with package/domain ownership and `$` naming.
- Prepared input: shared execution input object, not a source-of-truth store by default.
- Backend-local technical fields: adapter/runtime implementation fields on `this`, without store semantics and without `$`.
- Branch-local technical context: implementation-specific materialization derived after branching, without store semantics by default.
- Temporary computation data: per-call local variables, not stored in `this` and not stored in package/domain stores.

## Direct answers

- Use `$` only when the value is a real package or domain store.
- Persistence by itself never justifies `$` naming.
- A real store is package/domain source-of-truth state with explicit ownership and invariants.
- A prepared input object is not a store just because multiple implementations consume it.
- Local mutable technical objects must not be named `state$`, `heap$`, or `changes$`.
- `boundary$` is valid when it is an external domain or package store passed into operations.
- Use the actual owner name for external stores, for example `gravity$`, `strong$`, `weak$`, or `em$` when the store is owned at that force-aligned level.
- `this.state$` is invalid for package or domain store ownership because it hides external source of truth in backend instance state.

## Forbidden

Do not:

- use `$` for any mutable value by default;
- rename temporary objects to look like stores;
- copy external store ownership into runtime class instance state;
- use store for temporary intermediate computation buffers.

## Examples

Valid:

```typescript
export function activateAccount(
  accountStore$: AccountStore,
  activatedAtEpochMs: number,
): void {
  if (accountStore$.lifecycleStatus !== "active") {
    accountStore$.lifecycleStatus = "active"
    accountStore$.activatedAtEpochMs = activatedAtEpochMs
  }
}
```

Invalid:

```typescript
class CpuRuntime {
  state$: BoundaryStore
}
```

## Checklist

- [ ] `$` is used only for real package or domain stores
- [ ] External store is passed whole and accessed as `store$.field`
- [ ] Package/domain store is not hidden in `this`
- [ ] Temporary data stays local, not in store
