# Требования @nodes/ui

`@nodes/ui` владеет Blender-подобной компонентной библиотекой Node Editor.
Она получает готовую positioned geometry, отображает её и управляет view; layout
format и автоматическое размещение принадлежат следующему отдельному этапу.

## Публичный словарь

1. Единственный публичный словарь: `NodeTree → Node → Socket → Link`.
   Интерактивный компонент называется `NodeEditor`, read-only — `NodeCanvas`.
2. `Socket` является видимым input/output/bidirectional endpoint. `Link`
   соединяет exact sockets. Port/Edge остаются только терминами старого layout
   и не входят в новый component API.
3. Node содержит title, sockets, Properties и Parameters. `Fact` и `Card` не
   являются сущностями новой библиотеки.
4. Container Node задаёт visual containment; generated boundary crossing
   является geometry, а не domain Gateway.

## Component contracts

1. `NodeEditorSurface<TNode, TSocket, TLink>` принимает независимые typed
   `NodeRenderer`, `SocketRenderer`, `LinkRenderer` и `PositionedNodeTree`.
2. Renderer contracts сохраняют consumer fields и не импортируют старые
   `NodeSystemDocument`, Card model/layout/metrics, HUD, Hamiltonian или product
   code.
3. Node renderer владеет intrinsic measurement и internal slots. Socket type
   preset задаёт только имя типа, shape/color и optional default field.
4. Consumer может зарегистрировать собственный Node/Socket/Link renderer без
   изменения NodeEditor или central switch.
5. Поля внутри Node и standalone controls вызывают один renderer из
   `@ui/components`; node package не копирует field implementation.

## Blender presets

1. Первый catalog покрывает `boolean`, `float`, `integer`, `vector`, `rotation`,
   `color`, `string`, `menu`, `object`, `collection`, `image`, `material`,
   `texture`, `geometry`, `matrix`, `shader`, `bundle`, `closure`, `custom`.
2. Socket shapes: `circle`, `square`, `diamond`, `circle-dot`, `square-dot`,
   `diamond-dot`.
3. Type color является presentation preset и может быть переопределён consumer.
   Link и связанные sockets одного типа получают одну color identity.
4. Input socket может показать default field; output socket не превращается в
   field и остаётся connection endpoint.

## View и compositing

1. NodeEditor поддерживает fit, pan, zoom, culling и selection независимо от
   конкретного renderer preset.
2. Container background рисуется под Links, его chrome и child Nodes — над
   Links. Link stroke доходит до exact socket center.
3. Screen-visible minima strokes/sockets являются renderer policy и не
   возвращаются в geometry.
4. Controlled selection и canvas transform сообщаются consumer callback-ами;
   скрытого product state нет.

## Package boundary и удаление legacy

1. Старые Card model, Card layout/adapters, `NodeSystemSurface` и Card HUD
   удаляются без aliases, deprecated exports или compatibility bundles.
2. Hamiltonian и другие верхнеуровневые consumers в этой задаче не мигрируются:
   их новая интеграция выполняется после отдельного переписывания layout format.
3. Package-level tests и component playground являются acceptance этой задачи;
   exact root consumer compile gap фиксируется как вход следующего этапа.
4. Dev-only component playground показывает fields standalone и те же instances
   внутри Node, все socket presets/shapes, Links и containment. Он не заменяет
   будущую product integration.

## Источник терминов

Blender используется как терминологическая и UX-основа, но source/assets не
копируются:

* <https://docs.blender.org/manual/en/latest/interface/controls/nodes/parts.html>
* <https://docs.blender.org/api/current/bpy.types.NodeSocketStandard.html>
