# Contributing to MetaFor

**English** | [Русский](CONTRIBUTING.ru.md)

MetaFor is still in an architectural formation stage, so contribution should stay conservative and explicit.

## Before You Change Anything

- Read the relevant document in [`docs/`](docs/), especially [Ontology](ONTOLOGY.md), [Architecture](ARCHITECTURE.md), and [Development](DEVELOPMENT.md).
- Preserve the current `arch` terminology: `Dark`, `Boundary`, `Bulk`, `Field`, `Brane`, protocol channels, and the distinction between ordinary fields and topology fields.
- Do not reintroduce older `qTp` framing as a semantic replacement for the current branch.

## Documentation Contributions

- Keep the public documentation bilingual when you touch the public entry surface.
- Add or preserve top-level language switches between English and Russian counterparts.
- Prefer small, verifiable edits over large conceptual rewrites.

## Code Contributions

- Do not turn domains into direct runtime dependencies of each other.
- Treat `Dark`, `Boundary`, and `Bulk` as isolated domains that will eventually communicate through protocols.
- Relative imports across domains may be acceptable in tests, but not as a production shortcut.

## Verification

- Run the smallest relevant local verification for the files you changed.
- For Markdown changes, run `bun run lint:md`.
- If you touch code, prefer targeted checks in the affected workspace instead of unrelated broad changes.

## Pull Requests and Discussions

- Explain the architectural intent of the change in plain language.
- Link the relevant document or invariant when a change depends on ontology or architecture.
- If the change introduces a new concept, document it before treating it as established repository truth.
