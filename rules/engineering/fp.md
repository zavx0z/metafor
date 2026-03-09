# Functional Programming

This rule defines how functions, effects, and mutation boundaries should be structured.

## Purpose

Keep most logic pure and explicit. Isolate effects in orchestrators and make mutation visible.

## When to apply

Apply this rule when writing functions, coordinators, and state-changing code.

## Requirements

Pure functions should:

- receive only the data they actually need;
- return new data instead of mutating inputs;
- avoid hidden state;
- avoid side effects;
- avoid callback-style control injection when direct data flow is enough.

Use orchestrators for:

- IO;
- runtime interaction;
- cross-module coordination;
- state mutation;
- sequencing effectful steps.

Mutation discipline:

- make mutable inputs explicit;
- prefer naming mutable values with a `$` suffix, such as `store$`, `heap$`, or `state$`;
- use argument order `mutable$` → `data` → `options?` when practical;
- keep mutation near the orchestration boundary.

## Forbidden

Do not:

- hide mutation inside a function presented as pure;
- pass large ambient context when a small data object is enough;
- mix orchestration and transformation in the same helper without need;
- use classes as default containers for hidden mutable state.

## Examples

Pure helper:

```typescript
function normalizeInput(input: Input): Output {
  return {
    id: input.id.trim(),
    active: Boolean(input.active),
  }
}
```

Explicit mutation boundary:

```typescript
function write(store$: Store, data: Data): void {
  store$.value = data.value
}
```

## Checklist

- [ ] Pure logic is separated from effects
- [ ] Mutable inputs are explicit
- [ ] Mutation is kept near the boundary
- [ ] Hidden state is avoided
