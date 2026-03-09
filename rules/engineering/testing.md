# Testing

This rule defines how tests should be placed, how test ownership is determined, and how package-local tests should import helper code inside the monorepo.

## Purpose

Keep tests close to the logic they validate, preserve package ownership, avoid top-level test sprawl, and prevent artificial dependencies created only for package-local testing.

## When to apply

Apply this rule when writing, moving, restructuring, or reviewing tests.

## Requirements

### Test ownership

- Place a test inside the package whose logic it validates.
- Determine test ownership by the behavior under test, not by where helper functions come from.
- If a test validates `matrix`, it must live in the `matrix` package, even when it uses helper code from parent or sibling packages.
- Use a higher-level test location only when validating a real cross-package integration contract.

### Monorepo imports for package-local tests

- Package-local tests may import helper functions, fixtures, field decoders, builders, or domain utilities from parent packages, sibling packages, or other monorepo locations by relative path.
- Relative imports for package-local tests may traverse upward as needed, including up to the project root, when that is the clearest and smallest solution.
- Using helper code from another package does not change ownership of the test.
- Prefer relative monorepo imports for package-local tests over adding package dependencies that exist only to support tests.

### Dependency discipline

- Do not add `dependencies` or `devDependencies` to a package only to make its internal tests import monorepo helper code.
- Add a dependency only when the tested package truly depends on that package as part of its real package contract.
- Keep test-only support lightweight and local.

### Test structure

- Keep package-specific test fixtures and helpers near the package that owns the tests.
- Shared top-level test utilities are allowed only when they support true integration testing across multiple packages.
- Prefer test inputs and assertions that express domain meaning rather than opaque numeric or indexed values whenever helper functions can make the test clearer.

## Forbidden

Do not:

- place package-specific tests in a shared top-level test directory just because they use helper functions from parent or sibling packages;
- treat imported helper origin as test ownership;
- add package dependencies solely for package-local tests when relative imports are sufficient;
- hide ownership of tested behavior behind a generic shared test folder.

## Checklist

- [ ] The test lives in the package that owns the validated logic
- [ ] Helper imports do not redefine test ownership
- [ ] Relative monorepo imports are used when they avoid artificial dependencies
- [ ] No dependency was added only for internal package tests
- [ ] Top-level test placement is used only for true integration coverage
