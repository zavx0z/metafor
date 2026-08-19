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
3. Node renderer владеет intrinsic measurement и Parameter slots. За один
   dirty cycle он выполняет один typed local plan и одну materialization всей
   Node вместе с background/foreground; независимые paint phases не могут
   повторно планировать тот же subtree. Socket type preset задаёт только имя
   типа, shape/color и endpoint presentation; default Field принадлежит
   Parameter.
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
6. NodeCanvas рисует intrinsic dot grid как retained child того же content-root.
   Linked Parameter определяется из `NodeTree.links`: его default control
   скрывается без дублирования connected state во входной модели.
7. Collapsed Node сохраняет exact Socket endpoints вокруг compact header;
   Frame может быть вложен в другой Frame.
8. Selection различает Frame, Node и Link. Link получает hit corridors по
   готовым route segments; selected Link рисуется отдельным последним проходом
   поверх ordinary Links, но под Node.
9. Mobile NodeEditor использует тот же positioned tree и renderers. Один touch
   панорамирует canvas, два touch выполняют anchor-preserving pinch; responsive
   FlexCss скрывает catalog surfaces, но не создаёт отдельную mobile Node.
10. На overview-scale Node сохраняет структуру body через progressive LOD в тех
    же Flex rows; детали controls возвращаются после pinch без второй Node model.
11. Content viewport переводится через inverse `matrixWorld` единственного
    content-root для culling Frame, Link и Node. Те же retained parents владеют
    selection hits: invisible ancestor не принимает input, actual paint order
    определяет победивший target, а selected Link остаётся последним среди
    Links. Node container регистрируется перед внутренними controls, поэтому
    поздний control получает input первым. Frame выбирается только своей
    intrinsic header area высотой не более `36` local px; body не перекрывает
    Links и вложенные controls.
12. Wheel и pinch получают local anchor через Surface↔content-root matrix
    conversion и меняют тот же retained root. Transform-only input обновляет
    culling, hit mapping и material clip, не увеличивая layout или
    materialization counters.

## Package boundary и удаление legacy

1. Старые Card model, Card layout/adapters, `NodeSystemSurface` и Card HUD
   удаляются без aliases, deprecated exports или compatibility bundles.
2. Hamiltonian и другие верхнеуровневые consumers в этой задаче не мигрируются:
   их новая интеграция выполняется после отдельного переписывания layout format.
3. Package-level tests и component playground являются acceptance этой задачи;
   exact root consumer compile gap фиксируется как вход следующего этапа.
4. Dev-only component playground показывает fields standalone и те же instances
   внутри Node, все socket presets/shapes, Links и containment. Он не заменяет
   будущую product integration. На desktop dev-only `ReferenceSurface` показывает
   maintained Blender screenshot рядом с live NodeEditor через тот же FlexCss;
   asset и Surface не экспортируются production package. На mobile reference и
   catalogs скрываются, оставляя NodeEditor.

## Источник терминов

Blender используется как терминологическая и UX-основа, но source/assets не
копируются:

* <https://docs.blender.org/manual/en/latest/interface/controls/nodes/parts.html>
* <https://docs.blender.org/api/current/bpy.types.NodeSocketStandard.html>
