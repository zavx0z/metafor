# Требования @nodes/ui

`@nodes/ui` владеет Blender-подобной компонентной библиотекой Node Editor.
Она получает готовую positioned geometry, отображает её и управляет view; layout
format и автоматическое размещение принадлежат следующему отдельному этапу.

## Публичный словарь

1. Единственный публичный словарь:
   `NodeTree → Frame / Node → Parameter → Socket → Link`.
   Интерактивный компонент называется `NodeEditor`, read-only — `NodeCanvas`.
2. `Socket` является видимым input/output/bidirectional endpoint. `Link`
   соединяет exact sockets. Port/Edge остаются только терминами старого layout
   и не входят в новый component API.
3. `Frame` является отдельным visual owner вложенности. Node ссылается на него
   через `frameId`; обычная Node не может исполнять роль Frame.
4. `Parameter` является устойчивой строкой/identity внутри Node и владеет одним
   universal `Field`. `Socket` может ссылаться на Parameter через
   `parameterId`, но не владеет и не дублирует его Field.
5. У одного Parameter может быть один Socket слева, один справа либо оба
   одновременно. Это разные exact endpoints с разными IDs и общей строкой
   Parameter.
6. Component API допускает только visual sides `left | right`. `direction`
   (`input | output | bidirectional`) является независимой capability и не
   выводится из стороны. Fixed/adaptive выбор стороны принадлежит layout.
7. Node также может содержать Properties, не являющиеся connection Parameter.
   `Fact`, `Card`, Port и Edge не являются сущностями новой библиотеки.

## Component contracts

1. `NodeEditor` и read-only `NodeCanvas` принимают независимые typed
   `FrameRenderer`, `NodeRenderer`, `SocketRenderer`, `LinkRenderer` и
   `PositionedNodeTree`.
2. Renderer contracts сохраняют consumer fields и не импортируют старые
   `NodeSystemDocument`, Card model/layout/metrics, HUD, Hamiltonian или product
   code.
3. Node renderer владеет intrinsic measurement и Parameter slots. Socket type
   preset задаёт только имя типа, shape/color и endpoint presentation; default
   Field принадлежит Parameter.
4. Consumer может зарегистрировать собственный Node/Socket/Link renderer без
   изменения NodeEditor или central switch.
5. Поля внутри Node и standalone controls вызывают один renderer из
   `@ui/components`; node package не копирует field implementation.
6. Вся внутренняя композиция Node, Socket labels/default fields, catalog panels
   и playground regions выполняется существующими `flexRow`/`flexColumn` либо
   `flexRowCss`/`flexColumnCss`. Ручные UI-grid offsets запрещены.
7. Blender preset использует scale-aware compact Field density. Parameter Field
   и его left/right Socket получают одну Flex row и один viewport transform.

## Blender presets

1. Первый catalog покрывает `boolean`, `float`, `integer`, `vector`, `rotation`,
   `color`, `string`, `menu`, `object`, `collection`, `image`, `material`,
   `texture`, `geometry`, `matrix`, `shader`, `bundle`, `closure`, `custom`.
2. Socket shapes: `circle`, `square`, `diamond`, `circle-dot`, `square-dot`,
   `diamond-dot`.
3. Type color является presentation preset и может быть переопределён consumer.
   Link и связанные sockets одного типа получают одну color identity.
4. Unconnected Parameter может показать default Field независимо от того,
   находится его Socket слева, справа или с обеих сторон. Connected state не
   меняет Parameter identity.

## View и compositing

1. NodeEditor поддерживает fit, pan, zoom, culling и selection независимо от
   конкретного renderer preset.
2. Frame background рисуется под Links, его label/chrome и child Nodes — над
   Links. Link stroke доходит до exact Socket center.
3. Screen-visible minima strokes/sockets являются renderer policy и не
   возвращаются в geometry.
4. Controlled selection и canvas transform сообщаются consumer callback-ами;
   скрытого product state нет.
5. Ручными координатами остаются только входная positioned Node geometry,
   exact Socket centers и Link route points. Это scene data, не layout children.
6. NodeCanvas рисует scale-aware dot grid. Linked Parameter определяется из
   `NodeTree.links`: его default control скрывается без дублирования connected
   state во входной модели.
7. Collapsed Node сохраняет exact Socket endpoints вокруг compact header;
   Frame может быть вложен в другой Frame.
8. Selection различает Frame, Node и Link. Link получает hit corridors по
   готовым route segments; selected Link рисуется отдельным последним проходом
   поверх ordinary Links, но под Node.

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
