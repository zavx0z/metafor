# NODES-018 — Перевести UI на engine parent/child transforms

## Коротко

UI component tree должен один раз построить локальную геометрию, после чего
движение и масштаб parent автоматически применяются ко всем children через
scene graph движка. Pan/zoom больше не пересчитывает каждую Node, Socket, Link,
иконку и строку текста на CPU и не пересоздаёт их meshes.

## Зачем

Node Editor выявил повторяющийся системный дефект: parent уменьшается, а текст
и другие children после локальных screen-min floors перестают масштабироваться.
Тот же путь заново планирует и материализует component subtree при pan/zoom.
Локальное исправление Node renderer закрепило бы ошибочную границу ещё раз.

## Связанные задачи и история

* NODES-016 result `7aab6269a` создал FlexBox-oriented component library, но
  отрисовал Node Editor внутри одной immediate-mode `UiSurface`.
* NODES-017 visual review доказал detached scale, пустые bodies при LOD и
  повторный `planBlenderNode`; research checkpoint `5ca434ae4` локализовал
  расхождение между scene transform и child metrics.
* Текущий source audit подтвердил: engine `Object3D` уже владеет
  `parent/children`, local `modelMatrix` и inherited `matrixWorld`; renderer
  обходит hierarchy рекурсивно и передаёт world matrix каждому render item.
* Разрыв находится выше engine: `UiSurface` складывает primitives плоскими
  siblings в общие layer `Object3D`, а `NodeCanvas` заранее преобразует каждую
  geometry через `planNodeEditorViewport` и при rerender очищает/materializes
  слои заново.
* Владелец прямо решил вынести исправление в отдельную задачу и выполнять её в
  отдельном пользовательском чате. NODES-017 становится зависимой от NODES-018.

## Решения владельца

1. Закон действует глобально для UI, а не только для node library.
2. Реализация принадлежит engine parent/child hierarchy; дополнительный набор
   ручных UI scale calculations не принимается.
3. Система layout называется `FlexBox`. CSS является только привычной
   декларативной формой описания `%`/`fr`/`grow`, а не отдельной `FlexCss`
   системой.
4. Visual child непрерывно наследует transform parent. Screen-space minimum
   разрешён только явно отделённой невидимой hit area, но не visual text,
   icon, padding, gap, radius, border, stroke или Socket.
5. Нужен очевидный и производительный retained path: local layout строится при
   изменении component content/size/style, а transform parent не перестраивает
   subtree.

## Целевой закон

```text
semantic component state
          ↓ dirty only
local FlexBox plan
          ↓ materialize only changed subtree
retained Object3D parent/children
          ↓ transform only
engine matrixWorld → renderer
```

Pan/zoom меняет local transform одного content-root. Node, Parameter, Socket,
Link, Text и control сохраняют локальную geometry и получают world transform от
engine. Culling, clipping и pointer conversion читают тот же transform и не
создают второй visual layout.

## Подзадачи

### NODES-018.1 — Закрепить engine/UI retained contract и baseline

Статус и исполнитель: `COMPLETE`, внутренний исполнитель
`NODES-018.1 — Закрепить engine/UI retained contract и baseline`.

Классификация: диагностический contract/baseline-срез; он закрепляет один
наблюдаемый разрыв до изменения retained lifecycle.

Требование или диагностический результат: документы-владельцы Engine и UI
задают inherited parent/child transform, local FlexBox dirty-law и границу
невидимого screen-space hit target. Representative NodeTree сообщает число
local layout plans, materializations и transform-only frames.

Основание и связанная история: task baseline `8a78b50c9`, NODES-016 result
`7aab6269a` и NODES-017 research checkpoint `5ca434ae4`.

Наблюдаемое расхождение: текущий `NodeCanvas` вызывает
`planNodeEditorViewport` из полного `UiSurface.render`, CPU-преобразует каждую
Frame/Node/Socket/Link и при каждом pan/zoom очищает и заново materializes
плоские drawing layers. `renderBackground` и `renderForeground` независимо
вызывают intrinsic Node plan.

Причина: подтверждена — engine hierarchy уже наследует `matrixWorld`, но
immediate-mode UI path не сохраняет component parent/children и не различает
dirty materialization от transform-only frame.

Разрешённое изменение одного механизма: постоянные Engine/UI owner contracts и
read-only diagnostics/counters текущего NodeCanvas path. Retained component
parent и перенос NodeCanvas относятся только к NODES-018.2/.3.

Regression или опровергающее доказательство: focused test на representative
NodeTree сначала фиксирует baseline полного plan/materialization при transform,
а diagnostics различает layout, materialization и transform-only frame без
изменения semantic NodeTree либо layout solver.

Среда и критерий приёмки: `@metafor/engine`, `@ui/elements` и `@nodes/ui`
public contracts; focused Node UI tests, три package typecheck и
`git diff --check`. Browser pixels не являются приёмкой этого
диагностического среза.

Фактические действия: Engine contract закрепил inherited `matrixWorld` и
запрет запекать transform parent в visual children. UI owner contract назвал
систему FlexBox, оставил CSS-style только declarative-формой и закрепил
`dirty local plan → changed subtree materialization → transform-only frame`,
включая единственное исключение для отдельного невидимого hit target.
`NodeCanvas` публикует frozen cumulative diagnostics
`localLayoutPlans/materializations/transformOnlyFrames`; текущий flat path
считает viewport plan, независимые background/foreground Node plan phases и
завершённую полную materialization без изменения поведения.

Результат и вывод: regression с representative Blender NodeTree и настоящим
шрифтом фиксирует после первого render `{3, 1, 0}`, а после одного
`setCanvasTransform` и flush — `{6, 2, 0}`. Значит, текущий transform повторяет
viewport plan, оба Node plan и полную materialization, а transform-only path
ещё отсутствует и различим нулевым третьим счётчиком. Retained component parent
и перенос NodeCanvas не выполнялись.

Проверки: `bun test pkg/nodes/ui` — `27/27`; `@ui/elements` и `@nodes/ui`
package typechecks — pass; exact Engine source typecheck — pass;
`git diff --check` — pass. Canonical `@metafor/engine` script выполнен, но его
унаследованный root include по-прежнему останавливается на сохранённом после
NODES-016 Hamiltonian/Card consumer gap; ошибок изменённых Engine/UI/Node files
в выводе нет.

Подготовительный commit: `e3775ec107a9b69ff933c8b9a9ec43b434552afc`.

Result checkpoint: `d15d66671810a5a483e64ae1782c89dae29be025`.

Correction evidence финального audit на `e05a8541a`: верхние owner laws уже
называют систему FlexBox и CSS-style её declarative-формой, но три старые строки
в `@ui/elements`/`@nodes/ui` всё ещё использовали `FlexCss` как отдельное
архитектурное имя. Кодовые имена существующих helpers/types не меняются; это
тот же документальный контракт NODES-018.1, а не новый layout mechanism или
visual correction NODES-017.

Correction actual: три owner-doc строки теперь называют только единую систему
FlexBox, а responsive/mobile/reference flow описывают через CSS-style
declarative form. Существующие code identifiers `flexRowCss`/`flexColumnCss`,
runtime, tests и visuals не менялись.

Correction result: `FlexCss` больше не встречается в двух owner docs; task
history сохраняет это имя только как явно отвергнутую прежнюю формулировку.
`git diff --check` проходит.

Correction preparation: `d0231f3e982a13e2b7898e38f7e7fe2e2598f622`.
Correction result: `a2a44e14449d0e3eeb06ed9c09951629cad2a2a3`.

### NODES-018.2 — Добавить retained component parent в UiSurface

Статус и исполнитель: `COMPLETE`, внутренний исполнитель
`NODES-018.2 — Добавить retained component parent в UiSurface`.

Классификация: следующий implementation-срез того же UI owner contract; он
изменяет только retained lifecycle одного component parent.

Требование: `UiSurface` даёт subclass один lifecycle-safe путь создать точный
engine `Object3D` parent, materialize в нём локальные drawing primitives и
обновлять transform без очистки неизменённых children.

Основание и связанная история: NODES-018.1 result `d15d66671` закрепил
`dirty local plan → changed subtree materialization → transform-only frame` и
baseline counters `{3,1,0} → {6,2,0}`. Текущий неиспользуемый
`addRetainedObject` только прикрепляет готовый object и не владеет локальной
materialization либо recursive resource disposal.

Наблюдаемое расхождение: drawing primitives всегда попадают в общие плоские
layers, а `#clearLayer` освобождает только direct children. Вложенный retained
subtree нельзя атомарно заменить или удалить без orphan parent references и
риска оставить GPU geometry живой.

Причина: подтверждена — у `UiSurface` нет bounded materialization context и
единого recursive disposal владельца поверх существующего engine graph.

Разрешённое изменение одного механизма: общий protected retained-parent API
в `@ui/elements`, который использует только engine `Object3D`, направляет
primitive draw в выбранный owned parent, рекурсивно освобождает заменённый
subtree и отдельно запрашивает transform-only presentation frame. NodeCanvas,
его model/layout/culling/input и Blender visual policy не меняются.

Regression: identity parent и прежних children/geometry сохраняется после
transform-only frame; повторная dirty materialization освобождает каждый
вложенный geometry/text resource ровно один раз; remove/dispose отсоединяет
parent/children и повторный cleanup не вызывает double invalidation.

Среда и критерий приёмки: focused `@ui/elements` lifecycle tests, package
typecheck, применимые Node UI tests и typecheck, exact Engine source typecheck,
`git diff --check`. Browser и NodeCanvas performance относятся к
NODES-018.3–.5.

Фактические действия: UI owner contract закрепил один lifecycle точного engine
`Object3D`: root/nested create, атомарную materialization локальных primitives,
transform-only presentation и recursive remove/dispose с сохранением
`CachedText` cache law. `UiSurface` заменил неиспользуемые параллельные
`addRetainedObject`/`requestPresentationFrame` на protected
`createRetainedParent`, `materializeRetainedParent`,
`updateRetainedTransform`, `removeRetainedParent`. Materialization строит
staging subtree, переключает drawing context только на него и меняет прежних
children лишь после успешного draw; exception освобождает staging и оставляет
действующий subtree нетронутым. Общий cleanup теперь рекурсивно отсоединяет
каждый `Object3D`, удаляет orphan parent references и одним identity-set
инвалидирует вложенные Mesh/Line/обычные Text geometry.

Результат и вывод: fake renderer/runtime regression доказал stable identity
root, nested parent, children и geometry на двух transform-only presentations
без invalidation. Dirty rematerialization один раз освободила общий
`BufferGeometry` двух nested Mesh/Line и обе собственные geometry обычного
Text, но не invalidated shared geometry `CachedText`. Staging exception
сохранил прежний child/geometry; повторные remove/dispose не дали double
cleanup, а dispose ещё прикреплённого subtree полностью обнулил parent/children.
`NodeCanvas`, semantic NodeTree/layout solver, Blender renderer и visual policy
не изменялись.

Проверки: focused retained lifecycle — `3/3`, `61` assertions; весь
`bun test pkg/ui/elements` — `53/53`; `bun test pkg/nodes/ui` — `27/27`;
`@ui/elements` и `@nodes/ui` package typechecks — pass; exact Engine source
typecheck — pass; `git diff --check` — pass.

Подготовительный commit: `da884b2daf7ad467d6c7b85e6dbb7af5c5e45044`.

Result checkpoint: `57c66555848fda99c8d102a11a0d7c9ca67a3f62`.

### NODES-018.3 — Перевести NodeCanvas на retained content hierarchy

Статус и исполнитель: `COMPLETE`, внутренний исполнитель
`NODES-018.3 — Перевести NodeCanvas на retained content hierarchy`.

Классификация: следующий implementation-срез; он меняет один render-механизм
NodeCanvas с flat CPU projection на retained local component hierarchy.

Требование: NodeCanvas владеет одним retained content-root и engine
`Object3D` component parents для Grid, Frame passes, Link и Node. Positioned
geometry и FlexBox plans материализуются локально только при dirty; pan/zoom
обновляет position/scale одного content-root. Одна Node выполняет один
intrinsic plan и одну materialization за dirty cycle.

Основание и связанная история: NODES-018.1 result `d15d66671` доказал flat
baseline `{3,1,0} → {6,2,0}`, NODES-018.2 result `57c665558` дал атомарный
retained-parent lifecycle. NODES-017.8.8 локализовал двойной
`renderedBlenderNodePlan` и независимые visual scale floors.

Наблюдаемое расхождение: `planNodeEditorViewport` CPU-преобразует все
Frame/Node/Socket/Link на каждом render, Node background/foreground независимо
планируют один intrinsic subtree, а renderer contexts передают canvas scale и
повторяют его в text/radius/stroke/Socket/Field metrics.

Причина: подтверждена — render path остаётся screen-coordinate immediate mode,
несмотря на готовые engine hierarchy и retained lifecycle.

Разрешённое изменение одного механизма: `@nodes/ui` создаёт и reconciles
retained component parents, materializes local geometry в paint order и
переводит Node renderer на один local render/plan. Visual renderer metrics и
compact Field становятся intrinsic local values без canvas-transform scale и
screen floors; content-root наследует единственный transform. Допустимы только
необходимые public renderer-context и `@ui/components` local-metric изменения.
Clipping, culling и transformed hit/input correctness остаются NODES-018.4;
semantic NodeTree/layout solver, Hamiltonian/Card и visual corrections
NODES-017.8.3–.7 не меняются.

Regression: representative Frame/Link/Node tree после dirty имеет устойчивые
content/component parent и geometry identities; серия `setCanvasTransform` и
wheel/pinch transform-only frames не увеличивает `localLayoutPlans` либо
`materializations`, но увеличивает `transformOnlyFrames`. Следующий dirty
semantic/style cycle materializes изменившийся subtree, а одна Blender Node
вызывает intrinsic `planBlenderNode` ровно один раз.

Среда и критерий приёмки: focused NodeCanvas/Blender retained tests,
`@ui/components`, `@ui/elements` и `@nodes/ui` tests/typechecks, exact Engine
source typecheck, package-boundary regressions и `git diff --check`. Browser
interaction/visual proof выполняется после NODES-018.4 в NODES-018.5.

Фактические действия: Node/UI owner contracts закрепили один typed local Node
plan, одну materialization background+foreground и intrinsic Field/visual
metrics без canvas scale. `NodeCanvas` создаёт один Surface-owned engine
content-root и устойчивые component parents для Grid, двух Frame passes, Link и
Node. ID maps удаляют, создают и materialize только изменённые components, а
actual `Object3D.children` order сохраняет Grid → Frame backgrounds → Links с
selected последним → Frame foregrounds → Nodes. `setCanvasTransform`, wheel и
pinch обновляют только position/scale content-root через retained Surface API;
render path больше не вызывает `planNodeEditorViewport`, который остался
явной read-only projection. Public Node renderer заменён одним typed
`plan`/`render` contract, Blender renderer использует переданный plan один раз,
а Frame/Node/Socket/Link contexts и compact Field больше не принимают canvas
scale.

Результат и вывод: generic Frame/two-Link/two-Node regression видит точные
engine parents и paint order. После initial dirty counters равны `{2,1,0}`;
после `setCanvasTransform` + wheel + pinch остаются `{2,1,3}`, а identities всех
component parents, children и geometry не меняются. Следующий tree dirty
materialize только изменённую Node и даёт `{3,2,3}` при сохранении geometry
второй Node; Link selection меняет actual child order и даёт `{3,3,3}` без
нового Node plan. Отдельный regression оборачивает настоящий public Blender
planner: initial dirty вызывает его один раз, две transform-only presentations
оставляют один вызов, следующий dirty Node увеличивает число до двух. Raw
Positioned Link points и Socket centers приходят renderer без CPU transform.
Clipping, culling и transformed hit/input не реализовывались и остаются
NODES-018.4; browser proof остаётся NODES-018.5.

Проверки: общий affected suite `@ui/components` + `@ui/elements` + `@nodes/ui`
— `92/92`, `1326` assertions; три package typecheck — pass; Node playground
typecheck — pass; package-boundary — `4/4`, `70` assertions; strict exact Engine
source typecheck — pass; `git diff --check` — pass.

Подготовительный commit: `92840ecda2342d6ecfb82084a4e9b56247cb838e`.

Result checkpoint: `0f511a5758c381c3f2c814df793ef6b0c286c340`.

### NODES-018.4 — Согласовать clipping, culling и input transforms

Статус и исполнитель: `COMPLETE`, внутренний исполнитель
`NODES-018.4 — Согласовать clipping, culling и input transforms`.

Классификация: следующий implementation-срез; он меняет один projection-
механизм наблюдения retained hierarchy для clip, visibility и input.

Требование: viewport clip, component culling, selection hit corridors,
pointer/wheel pan/zoom и touch pinch переводят surface points и local component
geometry через `matrixWorld`/inverse тех же engine parents, которые рисует
renderer. Transform-only input не планирует и не materializes subtree.

Основание и связанная история: NODES-018.2 result `57c665558` дал retained
lifecycle, NODES-018.3 result `0f511a575` создал один content-root и local
components с counters `{2,1,0} → {2,1,3}`. Input/clip/culling были явно
оставлены этому следующему срезу.

Наблюдаемое расхождение: retained visuals уже наследуют content-root transform,
но selection hits временно не регистрируются, materials retained subtree не
получают fixed viewport clip, а component parents не меняют visibility при
pan/zoom. Runtime wheel/pinch anchor ещё вычисляется из отдельной числовой
формулы, а не из inverse фактического content-root.

Причина: подтверждена — прежний immediate hit/clip path хранит flat surface
rects и не владеет lifecycle/matrix association retained parent.

Correction evidence после result `a4d611767`: root review вызвал ordinary
universal control внутри retained Node и доказал, что public `hit()`/`wheel()`
по-прежнему попадали в flat Surface arrays. Component-local rect не наследовал
content-root inverse, Node container record, зарегистрированная последней,
маскировала control, а `hoveredPointer()` возвращал surface point вместо local.
Это тот же global retained input lifecycle и та же среда приёмки NODES-018.4;
новый номер и другой механизм не требуются.

Разрешённое изменение одного механизма: `UiSurface` связывает staged retained
hits/clip regions с exact owned `Object3D`, атомарно заменяет и удаляет их вместе
с subtree и даёт protected surface↔retained point conversion через actual
world/inverse matrices. `NodeCanvas` использует эту проекцию для culling,
Frame/Link/Node selection и anchor-preserving wheel/pinch. Screen-space minimum
допустим только явно отдельной невидимой hit-area policy и не меняет visual
Socket/stroke/text geometry. Semantic model/layout, materialization hierarchy,
Blender visual corrections и Hamiltonian/Card не меняются.

Regression: после нескольких transforms clip bounds остаются viewport-owned,
offscreen component parents становятся invisible без rematerialization и не
перехватывают input; transformed Frame/Link/Node points выбирают exact IDs;
link/mobile hit minimum существует только в retained hit record. Wheel и pinch
сохраняют один local anchor по matrix conversion. Dirty/remove/dispose не
оставляют stale retained hits, а counters первых двух стадий не растут.

Среда и критерий приёмки: focused `UiSurface` retained clip/hit lifecycle и
NodeCanvas matrix/culling/input tests, affected UI/Node suites и typechecks,
package-boundary, exact Engine source typecheck и `git diff --check`. Exact
browser desktop/mobile behavior и captures остаются NODES-018.5.

Фактические действия: Engine/UI/Node owner contracts закрепили framebuffer
clip как material presentation фактической `matrixWorld` hierarchy, атомарный
lifecycle retained hit/local-clip evidence и один inverse content-root path для
culling и input anchor. `UiSurface` теперь staging-ит hit records вместе с
точным retained subtree, разрешает protected surface↔retained point/rect
conversion от inner `retainedLayer`, хранит fixed viewport clip у retained
owner и refresh-ит Text/Image/Rounded/basic Mesh clip при transform и move.
`MeshBasicMaterial` получил тот же optional framebuffer clip slot, а renderer и
shader передают его обычному одноцветному UI mesh без Node-specific adapter.
Hit traversal следует actual `Object3D.children` DFS order, не входит в
невидимый ancestor и допускает screen minimum только отдельной невидимой
record policy; staged failure, hide, remove и dispose не оставляют старые
hover/press/tooltip targets.

`NodeCanvas` регистрирует Frame, Link corridor и Node selection в их retained
component parents; selected Link остаётся последним среди Links. Fixed clip
принадлежит content-root, а inverse viewport включает/выключает Frame passes,
Links и Nodes без materialization. `set`, wheel, single-touch pan и pinch меняют
тот же root. Wheel/pinch сохраняют local anchor через actual Surface↔root
matrix conversion; runtime больше не вызывает оставшийся read-only pure pinch
helper.

Correction расширила тот же transaction: обычные public `hit()`/`wheel()`
внутри materialization теперь автоматически staging-ятся у exact target parent
и атомарно заменяются только после успешного subtree swap. Retained wheel
resolver использует тот же inverse, clip, visibility и DFS order; cleanup
удаляет обе record-группы. `hoveredPointer()` различает immediate Surface и
retained parent и возвращает последнему local point. Node, Link и Frame
container records регистрируются до renderer controls, а Frame selection снова
ограничена intrinsic header высотой не более `36` local px.

Root review также проверил retained Button interaction presentation. Surface
теперь сообщает subclass exact parent при hover/press/wheel transition и
отложенном keyed render. NodeCanvas хранит только dirty-set существующих engine
parents, materializes owning component и очищает mark после success; sibling
parents не меняются. Button использует keyed render только для завершения
своего уже существующего `120ms` pressed visual, когда исходный pointer callback
уже завершён.

Результат и вывод: representative two-Link tree после initial dirty имел
`{localLayoutPlans: 2, materializations: 1, transformOnlyFrames: 0}`, а после
`setCanvasTransform`, wheel и pinch — `{2,1,3}` с теми же geometry. Matrix
anchors остались в exact surface points, Frame/Node/Link выбирались после
transform, selected Link победил ordinary Link по фактическому child order, а
отдельный невидимый `16×16` minimum выбрал тонкий Link на scale `0.16` без
изменения stroke geometry. Полностью offscreen parents стали invisible и не
приняли retained hit. Link/basic material сохранил fixed Node viewport clip
`[0,38,640,360]` после transform; surface move и local clip обновили bounds без
rematerialization. Staging exception сохранила прежние subtree, hitmap и clip,
а hide/remove/dispose очистили interaction state.

Correction regression вызвал обычные `surface.hit()` и `surface.wheel()` внутри
retained component после translate/scale: поздний control победил container,
получил local pointer `{22,16}`, action и wheel, тогда как staging exception
сохранила прежние records. Hide/remove/dispose очистили hover/press и не вызвали
старые action/wheel. Отдельный Node renderer зарегистрировал `host.hit()` и
`host.wheel()` внутри Node: transformed control оставил selection `null`, wheel
не изменил canvas transform, geometry и counters остались прежними; offscreen
Node не вызвала control. Frame header выбирался, а blank point в body прошла к
canvas background.

Actual `button()` regression с двумя retained Nodes отдельно доказал:
hover/press/tooltip и delayed pressed reset меняли children/render state только
source Node (`hover → active → idle`), а target Node сохранила те же child
objects и единственный initial `idle` render. Tooltip из component-local hit
попал в projected overlay. Pure parent transform до interaction не вызвал ни
одной materialization.

Проверки: focused retained projection — `20/20`, `1111` assertions; общий
affected suite `@ui/components` + `@ui/elements` + `@nodes/ui` — `98/98`,
`1425` assertions;
Engine basic clip upload/shader — `2/2`; три package typecheck и Node
playground typecheck — pass; package-boundary — `4/4`, `70` assertions; strict
exact Engine source typecheck — pass; `git diff --check` — pass. Browser
desktop/mobile correctness и visual/performance capture не выполнялись и
остаются только NODES-018.5.

Подготовительный commit: `bbffb817f2bea9c0ccabebca77cb7b6340e5c8b0`.

Result checkpoint: `a4d611767094611ff7a233adc57adf94e643bbd0`.

Correction preparation: `1531868b8a0994cea21751d8aaf065be6da04b50`.

Correction result checkpoint: `00d982041e99f260241fcd4df7e6b0c31853f0ae`.

### NODES-018.5 — Доказать correctness и performance

Статус и исполнитель: `COMPLETE`, внутренний исполнитель
`NODES-018.5 — Доказать correctness и performance`.

Классификация: финальный verification/evidence-срез; production mechanism не
меняется, dev-only playground и skill helper только наблюдают уже реализованный
retained contract.

Требование: exact standalone Node playground на desktop и emulated mobile
доказывает retained scale, полные Node bodies, exact Socket/Link endpoints,
fixed viewport clip, transformed selection/touch и отсутствие horizontal
overflow/console errors. Отдельный performance proof выполняет серию чистых
pan/zoom transforms и подтверждает неизменные layout/materialization counters
при растущем `transformOnlyFrames`.

Основание и связанная история: NODES-018.1 result `d15d66671` зафиксировал flat
baseline `{3,1,0} → {6,2,0}`; NODES-018.2 `57c665558`, NODES-018.3
`0f511a575`, NODES-018.4 `a4d611767` и correction `00d982041` реализовали
retained lifecycle, local components, matrix projection и exact controls.

Наблюдаемое расхождение: unit/type evidence закрывает contracts, но ещё нет
фактического WebGPU browser proof актуального worktree, exact target,
desktop/portrait/landscape captures и browser-observed counters/scale ratios.

Причина: это оставленный evidence gate, а не подтверждённый production defect.
Если browser path опровергнет реализованный механизм, исправление сначала
возвращается в соответствующую NODES-018.3/.4 correction и не маскируется этим
verification-срезом.

Разрешённое изменение одного механизма: dev-only playground публикует bounded
read-only retained diagnostics/proof, а versioned `node-system-dev` browser
helper выполняет exact-target performance/scale/endpoint checks. Production
NodeTree/layout/renderer semantics и NODES-017 visual corrections не меняются.

Regression и evidence: focused/full affected suites и typechecks; exact Engine
clip/source checks; browser DOM+console; native desktop и `390×844`/
`844×390 @2` exact canvas PNG; atomic synthetic touch; dirty-vs-transform
counters; matrix scale ratios на нескольких zoom levels; exact raw Socket
centers равны Link endpoints и Node body остаётся materialized на overview.

Среда и критерий приёмки: normal port `4016` занят внешним preserved PID
`68355` другого checkout, поэтому NODES-018 использует изолированный
checkout-owned `http://127.0.0.1:4018/` и exact CDP target этого URL. Это
evidence только standalone origin. Mobile emulation и synthetic TouchEvent не
выдаются за physical device, а captures — за owner visual acceptance.

Артефакты: [`project/artifacts/NODES-018`](../artifacts/NODES-018/README.md).

Фактические действия: только dev-only playground получил bounded observer
actual `editor.node` graph. Он называет exact content-root и components через
устойчивые WeakMap identities, читает actual visual/geometry children,
`matrixWorld`, framebuffer clip, Text/body presence и first/last paired
vertices Link ribbon geometry. `client.ts` публикует текущие counters после
callback frame и не меняет production NodeCanvas API.

Versioned `node-system-dev` helper получил repeatable `retained` и `evidence`
commands. `retained` фокусирует только exact target, сохраняет исходные
transform/selection, выполняет три zoom, wheel, pinch и transformed actual-hit,
проверяет identities/counters/ratios/endpoints/clip/body и восстанавливает
исходное состояние в `finally` с отдельными post-restore counters. `evidence`
выполняет atomic synthetic touch и полный native/portrait/landscape matrix,
пишет JSON и exact canvas PNG прямо в task artifacts и в `finally` возвращает
native device metrics. Python unit намеренно ломает transform phase и
доказывает оба restore-вызова; отдельный test проверяет exact transform
comparison.

Первый runtime проход нашёл только две ошибки evidence-механизма, не
production: observer слишком узко искал logical pixel scale по первому geometry
child, а hidden target не обслуживал rAF dirty frame. Промежуточная compacting
правка также временно сместила тело `same_transform`. Все три расхождения
исправлены в dev helper/observer, получили regressions, а каждый failure path
вернул исходные transform/selection. Ни один browser path не опроверг `.3/.4`.

Результат и вывод: exact target
`8A6231C66CBD889C40FA2B6677BAC369` на
`http://127.0.0.1:4018/` подтвердил один content-root. Clean performance run
начался с `{localLayoutPlans:6, materializations:1,
transformOnlyFrames:0}`. Три `setCanvasTransform`, wheel и pinch последовательно
дали `{6,1,1}` … `{6,1,5}` при тех же component/geometry identities и
descendant/root `matrixWorld` ratios. Transformed actual hit выбрал Node
`scalar` и ровно один раз увеличил dirty counters до `{7,2,5}`; restore вернул
исходный Link selection и transform, а отдельный post-restore snapshot записал
`{8,3,6}`.

Representative Node на overview `0.26` сохранил `28` geometry и `8` Text
objects. У всех четырёх Links actual first/last ribbon vertices равны raw
source/target Socket centers; framebuffer clip оставался fixed. Desktop,
portrait `390×844 @2` и landscape `844×390 @2` DOM готовы, без horizontal
overflow и console errors. Atomic synthetic touch изменил pan и pinch; native
`1920×1088 @2` восстановлен. Три exact canvas PNG просмотрены: desktop содержит
все regions, mobile содержит только полный editor с Node bodies/text и
соединёнными Socket/Link endpoints. Это доказательство standalone CDP origin;
physical mobile и owner visual acceptance остаются открытыми gates.

Проверки: общий affected suite `@ui/components` + `@ui/elements` + `@nodes/ui`
— `101/101`, `1438` assertions; Engine clip + package-boundary — `6/6`, `75`
assertions; focused playground/observer — pass; helper failure/restore unit —
`2/2`; `@ui/elements`, `@ui/components`, `@nodes/ui` typechecks, playground
typecheck и strict exact Engine source typecheck — pass; helper syntax/help и
`git diff --check` — pass. Browser evidence и SHA-256 описаны в
[`project/artifacts/NODES-018`](../artifacts/NODES-018/README.md).

Подготовительный commit: `09cb592839147b16d4912ae093f74010f3c756be`.

Result checkpoint: `0a4ce7f810d4b5731d1fc7db7a47dc52f675e35c`.

## Итоговый result checkpoint

Все пять подзадач имеют отдельные preparation/result boundaries и статус
`COMPLETE`. Parent result объединяет действующие owner laws и публичные
contracts, retained implementation, regressions и exact standalone evidence;
задача переводится в `REVIEW` без closing, удаления артефактов, интеграции в
другую ветку либо разблокировки NODES-017.

Parent result commit: текущий result commit; exact hash записывается следующим
project-only record.

## Closing handoff для REVIEW

Граница результата:

* `@metafor/engine`: inherited `matrixWorld` UI-law и optional framebuffer clip
  обычного `MeshBasicMaterial`; владельцы — `pkg/engine/CONTRACT.md`, public
  material/renderer contract и shader regression.
* `@ui/elements`: один retained-parent staging/swap/disposal lifecycle, exact
  parent hit/wheel/clip records, matrix conversions и dirty interaction hook;
  владелец — `pkg/ui/elements/REQUIREMENTS.md`.
* `@ui/components`: compact Field metrics являются intrinsic local geometry и
  Button delayed state возвращается к exact retained owner; владелец —
  `pkg/ui/components/REQUIREMENTS.md`.
* `@nodes/ui`: один content-root, retained paint components, typed one-plan Node
  renderer, transform-only counters, shared culling/clip/input hierarchy и
  dev-only observer; владелец — `pkg/nodes/ui/REQUIREMENTS.md`.
* `node-system-dev`: repeatable exact-target `retained`/`evidence` proof и
  restore/focus units; это versioned development evidence, не production API.

Проверяемое evidence:

* result line: `.1` `d15d66671` + terminology correction `a2a44e144`, `.2`
  `57c665558`, `.3` `0f511a575`, `.4` `a4d611767` + retained-control correction
  `00d982041`, `.5` `0a4ce7f81`;
* affected UI/Node suite `101/101`, Engine clip + package-boundary `6/6`, Python
  helper restore/focus `2/2`, package/playground typechecks и strict exact
  Engine source typecheck проходят;
* [`project/artifacts/NODES-018`](../artifacts/NODES-018/README.md) хранит
  machine-readable exact-target proof и три побайтово повторённые canvas PNG с
  SHA-256;
* live review contour: checkout-owned PID `52416`, origin
  `http://127.0.0.1:4018/`, exact target
  `8A6231C66CBD889C40FA2B6677BAC369`, native `1920×1088 @2`, console `0`;
  внешний PID `68355` на 4016 сохранён без adoption.

Границы review: semantic NodeTree, layout solver, Hamiltonian/Card и visual
corrections NODES-017 не менялись. Canonical broad Engine script всё ещё видит
записанный NODES-016 Hamiltonian/Card consumer gap; exact Engine source contract
проверен отдельно. Mobile evidence является emulation+synthetic TouchEvent, а
не physical-device либо owner visual acceptance. Эти два gates принадлежат
NODES-017 и не подменены NODES-018.

## Границы

* Не менять semantic NodeTree и layout solver format.
* Не мигрировать Hamiltonian либо старые Card consumers.
* Не создавать DOM/CSS renderer или второй transform tree.
* Не скрывать visual scale floors новым helper-именем.
* Не выдавать emulated mobile за physical device acceptance NODES-017.

## Критерии готовности

1. Engine contract явно закрепляет inherited parent/child transform для UI.
2. FlexBox строит local child slots; CSS-style sizes остаются формой описания.
3. Pan/zoom representative NodeTree меняет один retained parent transform и не
   вызывает повторный FlexBox plan/materialization unchanged subtree.
4. Text, icon, Socket, stroke, radius, padding и gap сохраняют одинаковое
   отношение scale к parent на нескольких zoom levels.
5. Clip/culling/hit/touch используют ту же hierarchy и проходят desktop/mobile
   regressions без overflow и detached endpoints.
6. Resource disposal не оставляет orphan geometry/text либо stale hit targets.
7. Node package tests, UI/engine typechecks, browser DOM/console и visual
   captures проходят; NODES-017 может вернуться из `WAITING` в `IN_PROGRESS`.

## Состояние

`REVIEW`: parent result зафиксирован отдельным commit после completion audit.
Closing review, удаление карточки/артефактов, интеграция и перевод NODES-017 из
`WAITING` требуют отдельного решения владельца и в эту задачу не входят.
