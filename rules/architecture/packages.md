# Package Architecture

This rule defines package boundaries, store placement, and dependency direction.

## Purpose

Place data where it is actually used, keep ownership clear, and prevent dependency inversion mistakes.

## When to apply

Apply this rule when deciding where code or state should live between packages or domains.

## Requirements

- Keep data in the narrowest scope that truly owns and uses it.
- Use a package-local store when the state belongs to one package.
- Move state to a higher shared store only when multiple packages need the same owned data.
- Let dependency direction flow from broader context to narrower implementation, not the reverse.
- Prefer explicit ownership over convenience imports.

When deciding store placement, ask:

1. Who owns this data?
2. Who writes it?
3. Who reads it?
4. Is the sharing structural or accidental?

## Forbidden

Do not:

- place shared state in an arbitrary package just because it is nearby;
- move data upward before there is a real multi-package need;
- let lower-level packages own higher-level orchestration state;
- create dependency cycles across packages.

## Checklist

- [ ] State ownership is explicit
- [ ] Store scope matches actual usage
- [ ] Dependency direction is consistent
- [ ] No package owns state just by convenience
