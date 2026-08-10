# @nodes/ui

`@nodes/ui` — каталог и пакет компонентов node-system. Здесь находятся
измерение/план карточки, viewport, edge presentation, WebGPU surface и
Inspector.

Компоненты получают `NodeSystemDocument` или уже рассчитанный
`PositionedNodeSystem` из пакета `nodes`. Они не владеют validation,
containment, semantic topology или автоматической раскладкой.

```ts
import {
  NodeInspectorSurface,
  NodeSystemSurface,
  fitNodeSystemCanvasTransform,
} from "@nodes/ui"
```

`NodeSystemSurface` рисует exact sockets и готовые waypoints, поддерживает
selection, pan/zoom и необязательные explicit move/resize для generic editor.
Hamiltonian передаёт `editable: false`, поэтому координаты там принадлежат
`@nodes/layout`.
