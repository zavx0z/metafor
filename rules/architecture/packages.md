# Package Architecture

This rule defines package ownership, state placement, orchestration ownership, and cross-package boundaries.

## Purpose

Keep ownership explicit so state and orchestration live at the correct package level.

## When to apply

Apply this rule when deciding package placement for state, orchestration, and responsibilities.

## Requirements

- State is owned by the package or domain that owns its lifecycle and invariants.
- Orchestration is owned by the package that coordinates multi-step behavior.
- Place responsibilities upward only when ownership is truly shared.
- Keep dependency direction from broader context toward narrower implementation.
- Keep cross-package boundaries explicit and cycle-free.
- Package tests belong to the package that owns the validated behavior.

Use this ownership check before placement:

1. Who owns the lifecycle?
2. Who writes it?
3. Who reads it?
4. Is the sharing structural or accidental?
5. Which package owns the validated behavior?

## Forbidden

Do not:

- place state in a package that does not own it;
- move ownership upward without real shared ownership;
- let lower-level packages own higher-level orchestration;
- create cross-package dependency cycles.

## Checklist

- [ ] State and orchestration ownership are explicit
- [ ] Upward placement is justified by shared ownership
- [ ] Cross-package boundaries are clear and cycle-free
- [ ] Tests live in the package that owns validated behavior
