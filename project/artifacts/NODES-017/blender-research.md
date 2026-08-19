# Blender Node System research для NODES-017

## Граница источников

1. Официальный source mirror: `https://github.com/blender/blender`, sparse
   checkout `/Users/zavx0z/repozitarium/blender-reference-source`, branch
   `blender-v4.5-release`, revision
   `84afd5f785f7569b97cf3257000403e7847120a8` (Blender 4.5.12 LTS).
2. Локальный visual reference: установленный Blender 4.5.5 LTS, build
   `836beaaf597a`, owner screenshot `blender-4.5.5-reference.png`.
3. Official Manual rendered pages:
   * <https://docs.blender.org/manual/en/4.5/interface/controls/nodes/parts.html>
   * <https://docs.blender.org/manual/en/4.5/interface/controls/nodes/frame.html>
   * <https://docs.blender.org/manual/en/4.5/interface/controls/nodes/editing.html>
   * <https://docs.blender.org/manual/en/4.5/interface/controls/nodes/groups.html>
   * <https://docs.blender.org/manual/en/4.5/render/shader_nodes/index.html>
4. Official Python API:
   * <https://docs.blender.org/api/4.5/bpy.types.NodeSocket.html>
   * <https://docs.blender.org/api/current/bpy.types.NodeSocketStandard.html>
5. Official Manual forge `projects.blender.org/blender/blender-manual` трижды
   прервал bounded checkout по network timeout. Для offline full-text/images
   используется явно неофициальный Markdown snapshot
   `https://github.com/wlk-r-dev/blender-manual-4.5`, revision
   `48f79b7e9246f670283b043da8c6f4240e547241`. Его выводы принимаются только
   после сверки с official rendered Manual/API/source.

GPL/CC-BY-SA source и assets не копируются в production code MetaFor. Они
используются только как external reference; project artifacts содержат только
owner screenshot и этот собственный конспект.

## Общая модель Blender

Manual описывает четыре пользовательских Node Editor family:

* Geometry Nodes — procedural modeling;
* Shader Nodes — materials, lights, world;
* Composite Nodes — post-processing изображений;
* Texture Nodes — legacy/custom textures.

Source 4.5 sparse inventory содержит implementation files: `216` geometry,
`96` shader, `93` composite, `47` function и `25` texture nodes. Это верхняя
граница implementation inventory, а не точное число пунктов Add menu: туда
входят helpers, internal и deprecated implementations.

Общие organizational components: Frame, Reroute, Group Input/Output и nested
Node Groups. Group — reusable computation boundary; Frame — только visual
parent и не скрывает вычислительную topology.

## Node anatomy

Manual `Node Parts` закрепляет единый порядок:

1. title/header с collapse toggle;
2. output sockets сверху справа;
3. node properties между outputs и inputs;
4. input sockets снизу слева;
5. optional preview и collapsible panels.

Стандартный rendering rhythm в `node_intern.hh` выражен через общий
`U.widget_unit`:

* полная row: `NODE_DY = 1 × widget_unit`;
* половинный шаг: `NODE_DYS = 0.5 × widget_unit`;
* горизонтальный margin: `1.2 × widget_unit`;
* Socket radius: `0.25 × widget_unit`.

Это reference proportions, не значения для буквального копирования. MetaFor
должен выразить тот же ритм через общий Flex и собственные theme tokens.

## Socket types, shapes и states

`DNA_node_types.h` и `drawnode.cc` подтверждают 19 standard data kinds:

`float`, `vector`, `color`, `shader`, `boolean`, `integer`, `string`, `object`,
`image`, `geometry`, `collection`, `texture`, `material`, `rotation`, `menu`,
`matrix`, `bundle`, `closure` и virtual/custom.

Source enum имеет 8 display shapes: `circle`, `square`, `diamond`,
`circle-dot`, `square-dot`, `diamond-dot`, `line`, `volume-grid`. Public 4.5
Python API перечисляет первые шесть как обычные `display_shape`; последние два
являются source-level specialized shapes.

Важные state laws:

* output или logically linked Socket рисуется без default value;
* `hide_value` также скрывает default control;
* `is_inactive` делает row неактивной;
* multi-input принимает несколько ordered Links и имеет вытянутую форму;
* selected Links рисуются отдельным вторым проходом поверх обычных;
* output row выравнивается вправо;
* vector/rotation control является column, color — split label/control.

Blender связывает `in_out` со стороной UI. MetaFor это правило не копирует.

## Project extension: Parameter с двумя сторонами

Принятый MetaFor contract:

* Parameter имеет устойчивый `id`, label и один universal Field;
* Socket имеет собственный `id`, `direction` и `parameterId`;
* на одной Parameter row допускается не более одного left Socket и одного
  right Socket; могут существовать оба одновременно;
* `direction` не выводится из `left/right`;
* Field не копируется в Socket и рисуется один раз в center slot;
* component API сейчас ограничен `left/right`; automatic side choice остаётся
  layout policy;
* fixed layout может закреплять input слева/output справа, adaptive layout —
  выбирать разрешённую сторону без смены identity.

## Frame laws

Manual и `node_relationships.cc` подтверждают:

* Frame является допустимым parent Node и другого Frame;
* перемещение Frame перемещает descendants;
* drop/`Ctrl-P` attach и `Alt-P` detach меняют parent relation;
* nested/recursive descendant checks обязательны;
* `Shrink` автоматически подгоняет Frame под bounds children;
* при выключенном Shrink Frame можно resize вручную;
* label size и optional read-only text принадлежат Frame presentation;
* Frame не является reusable Node Group и не меняет computation topology.

Для MetaFor `Frame` становится отдельным public component/positioned entry,
не Node без sockets. Обычная Node ссылается на `frameId`.

## Набор representative components

Для playground недостаточно одного «универсального» mock Node. Representative
matrix должна показать:

* output-only data Node;
* property + vector/rotation input Node;
* numeric/enum/boolean inputs;
* color control;
* shader/geometry/material/resource sockets;
* connected и unconnected Parameter;
* Parameter с left+right Socket одновременно — project extension;
* multi-input Socket;
* collapsed Node и collapsed panel;
* Frame и nested Frame;
* Reroute;
* selected Node/Frame/Link;
* desktop и mobile viewport.

## Visual defect matrix NODES-016

| Область | Blender/reference law | Отклонённый playground |
| --- | --- | --- |
| Frame | отдельная translucent parent plane, nested, shrink | container притворяется Node с header/body |
| Parameter row | один compact row; Socket на границе | Field и Socket планируются разными путями, labels конфликтуют |
| Controls | единая низкая control height и shared theme | pill controls разных размеров и чрезмерные gaps |
| Socket | точный центр row, state/shape/type | center есть, но визуальная row не совпадает с ним |
| Links | layer под Nodes, selected поверх ordinary | layer частично верный, states и hierarchy не доказаны |
| Canvas | scale-aware grid и ясная scene depth | почти плоский фон без node-editor grid |
| Mobile | Blender не задаёт contract | отсутствует responsive/touch acceptance |

Проектный шрифт и ортогональные Link routes сохраняются как явные owner
решения; они не считаются дефектами parity.
