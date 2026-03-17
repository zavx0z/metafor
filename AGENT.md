# Agent Guidance

Before making code, architecture, or documentation changes, the agent must inspect the current project documentation.

## Required reading order

1. Start with `README.md` or `README.ru.md` to understand the public entry surface and current project status.
2. Read the relevant documents in `docs/` before changing semantics, architecture, or navigation.
3. For architectural work, always review:
   - `docs/ONTOLOGY.md` / `docs/ONTOLOGY.ru.md`
   - `docs/ARCHITECTURE.md` / `docs/ARCHITECTURE.ru.md`
   - `docs/PROTOCOL.md` / `docs/PROTOCOL.ru.md`
   - `docs/DEVELOPMENT.md` / `docs/DEVELOPMENT.ru.md`

## Documentation discipline

- Treat the current `arch` documentation as the source of truth.
- Do not replace `Dark`, `Boundary`, `Bulk`, `Field`, or protocol terminology with older framework-era terms.
- Preserve bilingual navigation when changing the public documentation surface.
- If documentation is edited, update both language versions immediately and keep them structurally mirrored.
