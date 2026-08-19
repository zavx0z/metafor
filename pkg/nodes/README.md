# nodes

Node-направление разделено на две независимые границы:

* [`@nodes/ui`](ui/README.md) — Blender-подобная компонентная библиотека
  `NodeTree → Node → Socket → Link` с WebGPU Node Editor и собственным
  component playground;
* [`@nodes/layout`](layout/README.md) и корневой `nodes` — временно сохранённое
  чистое semantic/measured/positioned ядро текущей автоматической раскладки.

Новая component library намеренно не адаптируется к прежнему layout format.
Следующий этап перепишет layout integration непосредственно под `NodeTree` и
`Socket`; до него обе границы собираются и проверяются независимо.

## Component library

```ts
import {NodeEditor} from "@nodes/ui/node-editor"
import {
  createBlenderNodeRenderers,
  type BlenderLink,
  type BlenderNode,
  type BlenderSocket,
} from "@nodes/ui/blender-node"

const editor = new NodeEditor<BlenderNode, BlenderSocket, BlenderLink>({
  renderers: createBlenderNodeRenderers(),
})
```

`@nodes/ui` не содержит Card, Fact, HUD или `NodeSystemSurface`. Universal
fields принадлежат `@ui/components` и одинаково используются внутри Node и вне
Node Editor. Внутренняя UI-композиция строится только общим Flex из
`@ui/elements`.

## Текущая layout-граница

```ts
import {
  validateNodeSystemDocument,
  type NodeSystemDocument,
} from "nodes"
import {layoutMeasuredNodeSystemAdaptive} from "nodes/adaptive-layout"
import {layoutFixed} from "@nodes/layout/fixed"
import {layoutAdaptive} from "@nodes/layout/adaptive"
```

Эта граница остаётся renderer-free: она не импортирует Node Editor, UI или
Engine. Fixed/adaptive policies и Worker entrypoints физически разделены. Это
не обещание совместимости с новым component API, а изолированная основа для
следующего пересмотра формата раскладки.

## Проверка

```bash
bun run --cwd pkg/nodes typecheck
bun run --cwd pkg/nodes/ui typecheck
bun run --cwd pkg/nodes/ui typecheck:playground
bun test pkg/nodes
bun run docs:layout
```

Playgrounds запускаются независимо:

```bash
bun run nodes:playground
bun run nodes:components
```

Первый показывает public layout policies в SVG, второй — Flexbox-композицию
fields, Node, Socket и Link через WebGPU.
