# Требования семейства Nodes

Этот документ владеет композицией независимых Nodes packages и parent
playground. Runtime-законы принадлежат [`@nodes/core`](core/REQUIREMENTS.md),
authoring-команды — [`@nodes/editor`](editor/REQUIREMENTS.md),
алгоритмические законы — [`@nodes/layout`](layout/README.md), Worker boundary —
`@nodes/layout-worker`, WebGPU view — [`@nodes/ui`](ui/REQUIREMENTS.md), а
единый dev-каталог — [`@nodes/playground`](playground/REQUIREMENTS.md).

## Package boundary

1. `@nodes/core`, `@nodes/editor`, `@nodes/layout`, `@nodes/layout-worker` и `@nodes/ui`
   сохраняют независимые production entrypoints и не загружают соседние
   реализации без точного импорта.
2. Central playground является dev-only workspace consumer. Он не входит в
   production exports пакетов семейства.
3. Package-specific playground modules принадлежат одному `@nodes/playground`,
   но сохраняют package semantics и независимые exact routes.
4. Один `$nodes-dev` process и один browser origin заменяют прежние root,
   layout и UI selectors без compatibility servers.
