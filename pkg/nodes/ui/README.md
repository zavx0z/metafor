# @nodes/ui

`@nodes/ui` — Blender-подобная WebGPU-библиотека компонентов Node Editor.
Публичный словарь:
`NodeTree → Frame / Node → Parameter → Socket → Link`.

```ts
import {NodeEditor} from "@nodes/ui/node-editor"
import {
  createBlenderNodeRenderers,
  type BlenderFrame,
  type BlenderLink,
  type BlenderNode,
  type BlenderSocket,
} from "@nodes/ui/blender-node"

const editor = new NodeEditor<BlenderNode, BlenderSocket, BlenderLink, BlenderFrame>({
  renderers: createBlenderNodeRenderers(),
})
```

`NodeEditor` получает готовый `PositionedNodeTree`, управляет fit,
pan/zoom и selection и вызывает независимые `NodeRenderer`, `SocketRenderer` и
`LinkRenderer`. Библиотека не владеет автоматической раскладкой и не импортирует
старый `NodeSystemDocument`, Card/HUD или продуктовый код. `NodeCanvas`
предоставляет ту же renderer boundary без пользовательского редактирования.

`Frame` является отдельным positioned component и visual owner вложенности.
Обычная Node ссылается на него через `frameId`; Frame может быть вложен в другой
Frame через `parentFrameId`. Validation отвергает cycles, неизвестного parent и
children за пределами direct Frame.

`blender-node` предоставляет стандартный Node renderer, 19 Socket presets,
8 Socket shapes и Link renderer. Это сменяемый preset: consumer может передать
собственные typed Node/Socket/Link renderer-ы без изменения editor.

Поля Node properties и default values Socket используют тот же универсальный
`Field` из `@ui/components`, что и обычные панели вне Node Editor.

Parameter владеет одним `Field`; Socket ссылается на него через `parameterId`.
Одна Parameter row может иметь отдельный Socket слева, справа или оба endpoint
одновременно. `direction` не выводится из стороны. Component boundary принимает
только resolved `left/right`; выбор стороны остаётся у layout policy.

## Flexbox-закон

Внутренняя композиция toolbar, Node header/body, Socket rows, полей и catalog
panels выполняется только общими `flexRow`/`flexColumn`/`flexCss` из
`@ui/elements`. Если нужного поведения нет, расширяется общий Flex и его тесты.

Ручной геометрией остаются только входные rect нод, exact center сокетов,
маршрут Link и низкоуровневые drawing primitives. Это scene geometry, а не
альтернативная система UI-вёрстки.

Нормативные контракты находятся в [`REQUIREMENTS.md`](REQUIREMENTS.md).

## Playground

```bash
bun run nodes:components
```

Dev-only playground показывает все universal fields отдельно и внутри Node,
полный Socket catalog, Links и visual containment. Он не импортирует layout
solver или продуктовый consumer.

На mobile breakpoint playground отдаёт viewport NodeEditor целиком. NodeEditor
поддерживает single-touch pan и two-touch pinch; overview LOD скрывает только
детали controls, не меняя NodeTree или renderer identity.
