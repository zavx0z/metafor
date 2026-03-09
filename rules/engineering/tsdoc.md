# TSDoc Standards

TSDoc explains **why** and **how to use**, not what is already obvious from code.

## Purpose

Use TSDoc to document implicit relationships, constraints, and intent.

## When to apply

Apply this rule when writing or editing TSDoc in TypeScript files.

## Requirements

General:

- document the non-obvious;
- do not restate names or signatures;
- keep comments tied to intent, constraints, and usage;
- do not translate identifiers into another language.

Links:

| Target | Format |
| --- | --- |
| Package or module path | `` `@scope/pkg` `` |
| Type | `{@link TypeName}` |
| Type field | `{@link TypeName.field}` |
| Field inside `@property` | `@property field {@link Type.field\|description}` |

Store files are documented in layers:

1. `store.t.ts` — short single-line field comments in the interface.
2. `store.ts` — one header above the store object with `@property` entries.
3. Fields inside the store object literal — no TSDoc comments.

Use this `store.ts` shape:

```typescript
/**
 * Short description of the store.
 *
 * Filled in `@{domain}/orchestrator`, used in `@{domain}/executor`.
 *
 * @property data {@link ModuleStore.data|description}
 * @property offset {@link ModuleStore.offset|description}
 *
 * @see {@link ModuleStore} — state type
 */
export const store: ModuleStore = {
  data: null as unknown as Uint32Array,
  offset: 0,
}
```

Use this `store.t.ts` shape:

```typescript
/**
 * State of the `@{domain}/store`.
 *
 * Stores data used by multiple packages:
 * - {@link ModuleStore.data | data} — for initialization
 * - {@link ModuleStore.offset | offset} — for operations
 */
export interface ModuleStore {
  /** Short field description. */
  data: Uint32Array

  /** Short field description. */
  offset: number
}
```

For methods:

- `@param` describes format, constraint, or role, not type;
- `@returns` describes meaning, not type.

## Forbidden

Do not:

- use `{@link}` for packages or module paths;
- add TSDoc to fields inside the store object literal;
- describe the same field in detail at multiple documentation layers;
- write multi-line comments for interface fields;
- repeat type information in `@param` or `@returns`.

## Examples

Wrong:

```typescript
export const store: Store = {
  /** {@link Store.field|Field description}. */
  field: "",
}
```

Correct:

```typescript
/**
 * Store description.
 *
 * @property field {@link Store.field|Field description}
 */
export const store: Store = {
  field: "",
}
```

## Checklist

- [ ] The comment explains something non-obvious
- [ ] Package paths use literals, not `{@link}`
- [ ] Store fields in `store.ts` are documented through `@property`
- [ ] The store object literal has no field TSDoc
- [ ] Interface field comments are short
- [ ] `@param` and `@returns` do not repeat types
