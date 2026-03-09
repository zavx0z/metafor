# Testing

This rule defines test ownership, monorepo test imports, top-level integration boundaries, and backend runtime parity coverage.

## Purpose

Keep tests where behavior ownership is clear, avoid artificial dependency churn, and enforce comparable backend behavior.

## When to apply

Apply this rule when writing, moving, or reviewing tests.

## Requirements

### Test ownership

- A test lives in the package whose logic it validates.
- Helper import origin does not change test ownership.

### Monorepo imports

- Package-local tests may use relative imports across the monorepo.
- Package-local tests may traverse upward when needed.
- Do not add dependencies only to support package-local test imports.

### Top-level tests

- Use top-level tests only for true multi-package integration behavior.

### Runtime parity

- When one package has multiple backends, run the same canonical cases against each backend.

## Forbidden

Do not:

- move package-local behavior tests into shared top-level folders because helpers are imported from elsewhere;
- redefine test ownership by helper location;
- add dependencies only for internal test helper access;
- keep backend-specific case sets that break parity for the same contract.

## Checklist

- [ ] Test location matches behavior ownership
- [ ] Monorepo relative imports are used when they avoid artificial dependencies
- [ ] Top-level tests are true multi-package integrations
- [ ] Canonical backend cases run for each backend variant
