# Functional Programming

This rule defines how functions, effects, and mutation boundaries should be structured.

## Purpose

Keep most logic pure and explicit. Isolate effects in orchestrators and make mutation visible.

## When to apply

Apply this rule when writing functions, coordinators, and state-changing code.

## Scope boundary

This rule is generic. It does not define store ownership, `$` naming policy, or runtime class state policy.

## Requirements

Pure functions should:

- receive only the data they actually need;
- return new data instead of mutating inputs;
- avoid hidden state;
- avoid side effects.

Use orchestrators for:

- IO;
- runtime interaction;
- cross-module coordination;
- state mutation;
- sequencing effectful steps.

Mutation discipline:

- make mutable inputs explicit;
- keep mutation near the orchestration boundary;
- keep transformation helpers pure and deterministic.

## Forbidden

Do not:

- hide mutation inside a function presented as pure;
- pass large ambient context when a small data object is enough;
- mix orchestration and transformation in the same helper without need;
- create effectful helpers when orchestration is the correct boundary.

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
function write(state: Store, data: Data): void {
  state.value = data.value
}
```

## Checklist

- [ ] Pure logic is separated from effects
- [ ] Mutable inputs are explicit
- [ ] Mutation is kept near the boundary
- [ ] Hidden state is avoided
