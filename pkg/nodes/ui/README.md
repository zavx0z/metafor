# @nodes/ui

`@nodes/ui` — HUD-free пакет компонентов node-system. Здесь находятся
измерение/план универсальной карточки, явно названный fixed-port card adapter,
viewport, edge/flow presentation и WebGPU surface.

Card adapter получает независимые `NodeSystemDocument` и
`NodeSystemCardPresentation`, связывает semantic ports с rows по ID и создаёт
UI-owned Card preset. Измерение preset возвращает общий `MeasuredNodeSystem`, а
fixed layout — `PositionedNodeSystemCard` с явной resolved side каждого socket.
`@nodes/ui` не владеет semantic validation, containment или автоматической
раскладкой.

```ts
import {
  NodeSystemSurface,
  fitNodeSystemCanvasTransform,
} from "@nodes/ui"

import {
  adaptNodeSystemCardPresentation,
  type NodeSystemCardPresentation,
} from "@nodes/ui/card-model"
import {FixedNodeSystemCardLayouter} from "@nodes/ui/fixed-card-layout"
```

`NodeSystemSurface` рисует exact sockets и готовые waypoints, поддерживает
selection, pan/zoom и необязательные explicit move/resize для generic editor.
Потребитель может передать `connectionColor`, чтобы сопоставить собственную
семантику соединений цветам; без resolver используется детерминированный
универсальный fallback.

HUD-инспектор является необязательным adapter и экспортируется отдельно из
`@nodes/hud`.

`NodeSystemSurface` принимает готовый `PositionedNodeSystemCard`, поэтому
consumer со своей custom/adaptive geometry не импортирует fixed card adapter.
Bare/SVG consumer может работать непосредственно с `MeasuredNodeSystem` и
обычным `PositionedNodeSystem`, вообще не импортируя Card или WebGPU surface.

Требования к точному отображению geometry, containment-aware compositing,
auto-fit и ручному управлению видом находятся в
[`REQUIREMENTS.md`](REQUIREMENTS.md).
