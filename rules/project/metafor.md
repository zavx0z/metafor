# MetaFor DSL

This rule defines the expected structure of `meta.ts` files in the MetaFor project.

## Purpose

Keep MetaFor declarations consistent, ordered, and readable.

## When to apply

Apply this rule when creating or editing `meta.ts`.

## Requirements

Treat `meta.ts` as declarative source only.
It does not describe ownership transfer between `Bulk` and `Boundary`.
Each domain that needs the declaration must load it through its own `DSL -> AST` path.

Use this shape:

```typescript
import "@metafor/dsl"

export default MetaFor("<name>")
  .fields((field) => ({}))
  .superposition({})
  .mass({})
  .processes((process, destroy) => ({}))
  .reactions((reaction) => [])
  .bulk({
    gravity: ({ state, value, html }) => html``,
    view: ({ css }) => css``,
  })
```

Keep call order:
`fields -> superposition -> mass -> processes -> reactions -> bulk`

Field rules:

- keep primitive scalar-like data in `fields`;
- place object-like structures in `mass`;
- provide generics explicitly for arrays when needed;
- keep declarations readable and intentional;
- keep the file declarative, not orchestration-oriented.

## Forbidden

Do not:

- reorder the core builder stages;
- put object structures into `fields` when they belong in `mass`;
- leave declarations implicit when explicit typing improves clarity;
- use `meta.ts` to encode runtime choreography between domains.

## Checklist

- [ ] Builder stage order is correct
- [ ] `fields` contains primitive-like declarations
- [ ] `mass` holds object-like structures
- [ ] The file matches the standard MetaFor shape
