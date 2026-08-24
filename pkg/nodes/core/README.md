# @nodes/core

`@nodes/core` — независимый runtime универсального нодового графа. Пакет
владеет живыми `NodeTree`, `Parameter`, `Frame`, `Node`, `Socket`, `Link`,
ревизиями, подписками, JSON-снимком и координацией производных проекций.

Core не знает о renderer, WebGPU, DOM, Blender или конкретном layout solver.
Действующие законы находятся в [требованиях core](REQUIREMENTS.md), а карта
всего семейства пакетов и playground — в [родительском обзоре](../README.md).

```bash
bun run --cwd pkg/nodes/core typecheck
bun test pkg/nodes/core
```
