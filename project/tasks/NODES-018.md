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

Статус и исполнитель: `IN_PROGRESS`, внутренний исполнитель
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

Статус и исполнитель: `IN_PROGRESS`, внутренний исполнитель
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

Фактические действия: ещё не выполнены.

Результат и вывод: ещё не получены.

Подготовительный commit: текущий project-коммит после этой регистрации.

Result checkpoint: ещё не записан.

### NODES-018.5 — Доказать correctness и performance

На desktop и mobile доказать одинаковое parent/child scale ratio, отсутствие
пустых Node из-за detached text scale и неизменные exact Socket/Link centers.
Performance proof сравнивает dirty materialization и серию transform-only
pan/zoom frames: layout/materialization counters не растут при чистом transform.

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

`IN_PROGRESS`: NODES-018.1–.3 завершены result checkpoints. Текущий срез —
NODES-018.4; browser correctness/performance proof выполняется только после него
в NODES-018.5. Visual corrections NODES-017 не выполняются параллельно.
