# Naming Semantics

This rule defines strict naming boundaries for stores and backend-local technical state.

## Purpose

Prevent semantic drift caused by names that imply store ownership where none exists.

## When to apply

Apply this rule when naming store objects, runtime fields, and mutable technical values.

## Scope boundary

This rule is naming-only. Store ownership rules live in `rules/project/stores.md`, and runtime class ownership rules live in `rules/project/runtime.adapters.md`.

## Requirements

- Use `$` naming only for real package-level or domain-level stores.
- Use ordinary names for backend-local instance fields.
- Do not name local technical objects as stores.
- Do not fake store semantics through naming.

## Forbidden

Do not:

- suffix backend-local technical fields with `$`;
- call temporary local data `state$`, `heap$`, or `changes$`;
- use store-like names for values that are not source-of-truth state.

## Checklist

- [ ] `$` names map only to real package/domain stores
- [ ] Backend-local fields use ordinary names
- [ ] Local technical values are not named as stores
