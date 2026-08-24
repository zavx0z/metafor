# Требования @nodes/ui

`@nodes/ui` владеет Blender-подобной компонентной библиотекой Node Editor.
Она отображает готовую projection и управляет view. Exact `node-editor`
solver-free; explicit `blender-projection` адаптирует живой root `NodeTree` к
`@nodes/layout` и Blender renderer.

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
   `FrameRenderer`, `NodeRenderer`, `SocketRenderer`, `LinkRenderer` и готовую
   projection. Отдельный `PositionedNodeTree` остаётся component-level входом.
2. Renderer contracts сохраняют consumer fields и не импортируют старые
   `NodeSystemDocument`, Card model/layout/metrics, HUD, Hamiltonian или product
   code.
3. Projection adapter владеет intrinsic measurement и Parameter slots. Он
   выполняет один typed local plan после точного measurement и передаёт его
   NodeEditor; materialization не планирует тот же subtree повторно. В
   component-level `setTree` renderer может планировать локально. Socket type
   preset задаёт только имя типа, shape/color и endpoint presentation; default
   Field принадлежит Parameter.
4. Consumer может зарегистрировать собственный Node/Socket/Link renderer без
   изменения NodeEditor или central switch.
5. Поля внутри Node и standalone controls вызывают один renderer из
   `@ui/components`; node package не копирует field implementation.
6. Вся внутренняя композиция Node, Socket labels/default fields, catalog panels
   и playground regions выполняется существующими `flexRow`/`flexColumn` либо
   `flexRowCss`/`flexColumnCss`. Ручные UI-grid offsets запрещены.
7. Blender preset использует intrinsic compact Field density. Parameter Field
   и его left/right Socket получают одну local Flex row и вместе наследуют
   transform retained Node parent; renderer context не передаёт canvas scale.
8. Node UI собирает Parameter controls только из public `@ui/components`.
   HTML-подобные `@ui/elements` используются для layout/chrome, а Node-specific
   direct drawing разрешён Socket, Link и внешней scene geometry; Node не
   реализует собственные IconButton, ControlGroup, picker или Field input.
9. Link сохраняет утверждённую ортогональную route geometry вместо Blender
   Bezier. Это исключение не меняет Blender-law для thickness, colors,
   hover/selected/invalid states, exact Socket attachment и interaction.

## Blender presets

1. Первый catalog покрывает `boolean`, `float`, `integer`, `vector`, `rotation`,
   `color`, `string`, `menu`, `object`, `collection`, `image`, `material`,
   `texture`, `geometry`, `matrix`, `shader`, `bundle`, `closure`, `custom`.
2. Socket shapes: `circle`, `square`, `diamond`, `circle-dot`, `square-dot`,
   `diamond-dot`, `line`, `volume-grid`. Первые шесть являются обычными public
   Blender display shapes; последние два сохраняют specialized source states.
3. Type color является presentation preset и может быть переопределён consumer.
   Link и связанные sockets одного типа получают одну color identity.
4. Unconnected Parameter может показать default Field независимо от того,
   находится его Socket слева, справа или с обеих сторон. Connected state не
   меняет Parameter identity.
5. Loose right-side Socket рисуются над Properties и Parameters, loose
   left-side Socket — под ними. Порядок является visual-side presentation и не
   выводит `direction` из стороны; Socket Parameter остаются на своей общей row.
6. Пропорции header, body, Parameter rows, controls и Socket, их padding и
   centers сверяются с точным Blender 4.5.5 reference при сопоставимом масштабе.
   Fixture-specific offsets и свободный подбор размеров запрещены.
7. Node имеет мягкую симметричную тень со всех четырёх сторон. Обычная тень
   нейтральна; selection не меняет border, а окрашивает тень в прозрачный
   оттенок фактического header. Тень непрерывно наследует scale retained Node
   parent и не запускает отдельный blur-pass при pan/zoom.
8. Node header radius/collapse/selection не являются project divergence и
   сверяются с exact Blender 4.5.5 capture/source.

## View и compositing

1. NodeEditor поддерживает fit, pan, zoom, culling и selection независимо от
   конкретного renderer preset. NodeCanvas хранит один retained content-root:
   pan/zoom меняет только его engine position/scale, а Grid, Frame passes, Links
   и Nodes остаются устойчивыми children с локальной geometry.
2. Frame background рисуется под Links, его label/chrome и child Nodes — над
   Links. Link stroke доходит до exact Socket center.
3. Stroke, Socket, text, padding, radius и другие visual metrics являются
   intrinsic local geometry и непрерывно наследуют parent transform.
   Screen-visible minimum допустим только отдельному невидимому hit target.
4. Controlled selection и canvas transform сообщаются consumer callback-ами;
   скрытого product state нет.
5. Ручными координатами остаются только входная positioned Node geometry,
   exact Socket centers и Link route points. Это scene data, не layout children.
   Renderer может вернуть отдельный culling envelope для внешнего overlay,
   но ordinary Node presentation rect остаётся единственным body hit и не
   меняет positioned tree geometry.
6. NodeCanvas рисует intrinsic dot grid как retained child того же content-root.
   Linked Parameter определяется из `NodeTree.links`: его default control
   скрывается без дублирования connected state во входной модели.
7. Collapsed Node сохраняет exact Socket endpoints вокруг compact header;
   Frame может быть вложен в другой Frame.
8. Selection различает Frame, Node и Link. Link получает hit corridors по
   готовым route segments; selected Link рисуется отдельным последним проходом
   поверх ordinary Links, но под Node.
9. Mobile NodeEditor использует тот же positioned tree и renderers. Один touch
   панорамирует canvas, два touch выполняют anchor-preserving pinch; единый
   responsive FlexBox flow, заданный CSS-style declarative form, скрывает
   catalog surfaces, но не создаёт отдельную mobile Node.
10. На overview-scale Node сохраняет структуру body через progressive LOD в тех
    же Flex rows; детали controls возвращаются после pinch без второй Node model.
11. Content viewport переводится через inverse `matrixWorld` единственного
    content-root для culling Frame, Link и Node. Те же retained parents владеют
    selection hits: invisible ancestor не принимает input, actual paint order
    определяет победивший target, а selected Link остаётся последним среди
    Links. Node container регистрируется перед внутренними controls, поэтому
    поздний control получает input первым. Frame выбирается только своей
    intrinsic header area высотой не более `36` local px; body не перекрывает
    Links и вложенные controls. Изменение hover/press/tooltip одного retained
    control materializes только owning component parent; siblings сохраняют
    identity, а чистый transform не становится interaction dirty.
12. Wheel и pinch получают local anchor через Surface↔content-root matrix
    conversion и меняют тот же retained root. Transform-only input обновляет
    culling, hit mapping и material clip, не увеличивая layout или
    materialization counters.
13. Node Preview является controlled Node capability, не Field и не Socket.
    Только previewable Node показывает right-header eye toggle; node flag
    сохраняется независимо от view-owned global Overlays/Previews. При обоих
    global flags и enabled node flag drawable image buffer рисуется отдельной
    extra-info panel над body: inset `3`, свой translucent TH_BACK/TH_NODE
    material, top corners и aspect-preserving image inset `3`. Missing/zero
    buffer не создаёт fake panel. Preview расширяет только renderer culling
    envelope; body size/hit, Socket centers, Links, topology и values не
    меняются. Несколько Node могут держать независимые enabled flags.

## Package boundary и удаление legacy

1. Старые Card model, Card layout/adapters, `NodeSystemSurface` и Card HUD
   удаляются без aliases, deprecated exports или compatibility bundles.
2. Прежний root `NodeSystem*` format удалён. Живой `@nodes/core` Parameter-store и
   `blender-projection` являются единственным новым parent integration path;
   product consumers подключаются отдельно.
3. Package-level tests, central UI page и editor integration page доказывают
   разные границы и не подменяют друг друга.
4. Dev-only UI page является desktop consumer общего Workbench
   `@ui/playground`; её exact lifecycle маршрутизирует один `$nodes-dev`
   selector `nodes`, а package identity задаёт mount `/ui/`. Выбор Component
   сначала открывает его overview: `/ui/socket/` показывает все Socket types,
   `/ui/socket/boolean/` — все варианты Boolean, и только
   `/ui/socket/boolean/input` задаёт exact detail story. Prefix overview не
   скрывает прежний Workbench: для preview/source он использует первый detail
   descendant, сохраняя catalog, sections, dock и code panel. Catalog выбирает
   NodeEditor, Socket и comparison. Для
   выбранного Socket вторая панель перечисляет все concrete Socket type presets,
   center показывает один production detail preview, dock — независимые
   `input | output | bidirectional` variants, а правая панель постоянно хранит
   exact TypeScript/copy и controls/events того же story state. Aggregate
   inventory типов, форм или состояний допустим только отдельной documentation
   story и не заменяет detail route. Story metadata и lazy implementation
   принадлежат package consumer и импортируют production через exact public
   subpath; общий Workbench не получает Node vocabulary. Standalone Fields
   принадлежат playground `@ui/components`; здесь они видны только внутри Node.
   Comparison сохраняет maintained Blender screenshot и representative live
   Node; asset и Surface не экспортируются production package. Client-side
   смена route повторно применяет layout без fake resize или page reload.
5. NodeEditor detail stories имеют exact ordinary/selected variants отдельно
   для развёрнутой и свёрнутой production Node. Route, target Node id, args,
   controls, preview, source и `NodeEditor` selection образуют одно состояние;
   legacy default route остаётся ordinary expanded. Выбранное состояние не
   создаётся manual browser input и не подменяется Frame или Link selection.

## Источник терминов

Blender используется как терминологическая и UX-основа, но source/assets не
копируются:

* <https://docs.blender.org/manual/en/latest/interface/controls/nodes/parts.html>
* <https://docs.blender.org/api/current/bpy.types.NodeSocketStandard.html>
