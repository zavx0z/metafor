# Договор Bulk Store и Visual projection

Bulk хранит одну плоскую реляционную проекцию наблюдаемого мира — Bulk Store.
Initial и последующие Force Particles изменяют этот же Store; промежуточных
Graph Store, Manifest, ReadyScene и второго scene Store в browser path нет.

## Bulk Store

- Рождение Bulk поднимает RPC, Force, browser handoff и принадлежащее им
  operational state без собственного HTTP listener. Bulk получает
  согласованный initial cut только через RPC и не читает Boundary или SQLite
  напрямую.
- Единственный server Dark отдаёт принадлежащие Bulk `GET /`, `/initial` и
  browser WebSocket как транспортный gateway. Dark не строит, не читает и не
  изменяет Bulk Store.
- `GET /` немедленно отдаёт общий HTML shell с Canvas и loader, не ожидая
  initial cut и не встраивая данные мира. Browser параллельно поднимает
  client-only viewport и запрашивает `GET /initial`; этот отдельный запрос
  получает собственный согласованный Bulk Store и одноразовую handoff session.
  В HTML и initial Store нет Graph, JSON Pointer, semantic manifest,
  renderer-ready scene, causal cursor и путей внутренних хранилищ. Loader
  скрывается только после кадра с применённым Store.
- Store плоский и columnar: один numeric `layout` выбирает фиксированный
  layout law (`0` — `centered-nested`, `1` — `outside-in`), а identity, kind,
  flags, ownership, geometry, material и compact Hermite controls хранятся
  числовыми колонками. Строковый словарь содержит только реально показываемый
  интерфейсом текст. Строковое имя layout в Store не передаётся и однозначно
  выводится из `layout`.
- Сервер формирует ту же основу Store, которую browser продолжает использовать.
  Browser заменяет wire-массивы typed buffers в тех же полях и добавляет только
  runtime-only `id → slot`, incident-relation/free-list indexes и renderer
  handles. Он не перекладывает строки Store в новую объектную модель и не
  удерживает вторую копию записей.
- Source IDs с плотным фактическим диапазоном получают прямой растущий
  `id → slot` typed lookup. Реляционные incidence indexes вычисляются один раз
  из колонок и не сериализуются.
- Направленные projection/read/write/transition relations хранят source и
  target согласно числовому kind. Симметричный field entanglement хранит одну
  канонически упорядоченную пару endpoints; фиктивное направление для него не
  создаётся.
- Порядок и повтор доставки принадлежат серверному Force transport. Bulk Store
  не содержит `throughTs`, revision, version или иной клиентский cursor.
- Каждый существующий Force Particle/operation имеет отдельный handler. Handler
  меняет точные slots Store, пересчитывает только их локальное structural,
  geometry, material или relation closure и сразу вызывает соответствующие
  renderer operations. Универсального diff/patch/consequence формата нет.
- Gluon несёт один canonical payload
  `fields[fieldId] = {valueId, value}`. `add/replace` передают resulting
  `valueId`, `remove` — previous `valueId`; тот же handler локально меняет
  symmetric entanglement для shared-Value и multi-Field случаев.
- Structural add/remove/move/copy не заменяют Store и не перестраивают сцену
  целиком. Они изменяют адресуемые slots, затронутую incident structure и
  минимальную цепочку layout owners.
- Categorical declaration `path` выбирает Boundary table. Для non-WIMP
  `move/copy` поле `from` является persisted numeric row `id`; resulting row
  сохраняет фактические `id` и FK. WIMP является единственным исключением:
  его source identity — canonical `src` string. Bulk-local declaration ID,
  составного `{wimp,localId}` адреса и JSON Pointer нет.
- Authoring Field Inflaton может адресовать source move внутренней canonical
  парой `Meta#localId`, но Boundary разрешает её до persisted row и Bulk
  получает только обычный Field Graviton с numeric `from`. Enum variants не
  являются отдельной RPC entity: Bulk видит только производные canonical
  Variant Gravitons той же Field transaction.
- Authoring State остаётся одной клиентской entity, а Bulk получает обычные
  State, Transition и Condition Gravitons её Boundary transaction и локально
  обновляет те же declaration slots. Mass declaration и `wimp.view_css`
  невизуальны и полностью исключены из Bulk Store; изменение Mass наблюдается
  другими доменами через resulting Atom replacement.
- Canvas, GPU, Renderer, Space и ViewPoint остаются client-only. Force Particle
  остаётся transport обновлений и не превращается в Graph patch.

## Точная форма Store

- Передаются `root` и единый `text[]` только для реально видимых key, label и
  value text. Таблица `wimp` хранит каждый canonical `WIMP.src` ровно один раз;
  её числовой slot служит только сжатием ссылок, а не новым domain ID. Она
  нужна, чтобы Atom и declaration rows ссылались на тот же WIMP без повторения
  `src`, а Graviton с canonical `src` находил точные slots. JSON Pointer, owner
  chains и operational strings не передаются. `wimp.view_css` полностью
  исключён из initial Store, Store-схемы и structural handlers.
- Boundary-compatible declaration source хранится отдельными числовыми
  колонками с persisted table PK: `fieldSource(id,wimp,localId,kind,key,label)`,
  `stateSource(id,wimp,position,name)`,
  `transitionSource(id,wimp,fromState,toState,position)` и
  `conditionSource(id,wimp,transition,field,position)`. `wimp` здесь — slot
  таблицы canonical `src`; FK State/Transition/Field сохраняют фактические
  persisted IDs. Невизуальный Condition predicate не передаётся.
- `processSource` хранит persisted `id`, WIMP, State name slot, kind/label и
  диапазоны числовых Field FK в `processField`. `reactionSource` хранит
  persisted `id`, WIMP, label, `allStates` и диапазоны Field/State FK в
  `reactionField`/`reactionState`. Готовые causal geometry и повторяющиеся
  declaration strings из этих source rows не передаются.
- `dark` передаёт numeric `id,parent,order,kind,flags,label` и рабочие
  `position[3],form[2],material[6]`.
- `field` передаёт marker `id`, canonical Field `field`, `owner,kind,flags`,
  UI slots `key,label,valueText`, canonical `value` и рабочие
  `position[3],form[2],material[6]`.
- `fieldAlias` передаёт каждую runtime occurrence один раз: numeric
  `id,atom,field,value,marker,order,orbit,valueText`. Kind/key/label берутся из
  единственной `fieldSource` row и в alias не повторяются. `fieldSource.localId`
  является стабильным Boundary placement fact; alias `order` фиксирует
  фактический occurrence order, а `orbit` — минимальный centered-nested cursor,
  необходимый для точной локальной parity после split/merge.
- `orbital` и `proxy` передают numeric identity/owner/kind/flags, только
  необходимые causal anchors и related-State ranges, UI label slot и рабочие
  `position/form/material` columns.
- `transition` передаёт направленные `from,to` и ровно `12` compact Hermite
  controls. `relation` передаёт numeric endpoint kind/id пары; направление
  projection/read/write следует из `kind`, а symmetric entanglement хранится
  одной канонически упорядоченной парой. Rendered Relation имеет `24` controls.
- `batch` передаёт numeric `id,owner,kind,flags` и `material[10]`. Batch
  membership однозначно следует из entity `batch` columns.
- Однозначно вычисляются depth, table-local `id → slot`, WIMP `src → slot`,
  owner child lists, Value groups, endpoint → incident relation slots, batch
  membership sets и free slots. Они runtime-only и не сериализуются. Canvas,
  GPU handles, picking records, camera и HUD также runtime-only.
- Одна canonical occurrence сохраняет одну identity. Совпавшие Values могут
  разделять один marker, но occurrence rows не сливаются и не копируются.
- Verified root promotion меняет выбранный root только по receipt. Axion
  identity и связи сохраняются; его Visual surface остаётся отдельным будущим
  этапом.

## Production Visual projection

- Production-ready layout laws ровно два: `centered-nested` и `outside-in`.
  Один Store содержит numeric selector выбранного закона и geometry именно
  этого закона; параллельных сцен, строкового layout payload и runtime fallback
  нет. Текущий contour по умолчанию строит `outside-in`; direct writer и local
  handlers принимают selector явно, чтобы обе раскладки проходили одинаковые
  parity и performance checks.
- Одна canonical shared-Value relation остаётся одной Store row в обеих
  раскладках. В `centered-nested` её batch равен `0`, только если обе occurrence
  уже указывают на один shared marker. В `outside-in` occurrence остаются в
  собственных Torus, поэтому row получает обычный relation batch и `24`
  compact Hermite controls. Initial writer и Gluon-handler обновляют эти
  controls локально и передают Renderer только затронутые relation batches.
- Initial cut проходит один server path: согласованные RPC rows → layout law →
  columnar Bulk Store. В browser wire входит только `{session, store}`; Store не
  содержит service objects, Canvas, GPU handles, `Renderer`, `Space` или
  `ViewPoint`.
- Production writer в два прохода читает уже согласованные Boundary rows,
  выделяет конечные Store columns и заполняет их напрямую. Короткоживущие
  группировки declaration/runtime rows являются только calculation inputs:
  они не материализуют `BulkManifest`, `ReadyScene`, Graph Store или ещё одну
  модель записей. Выбранный fixed layout writer пишет position/form/material и
  compact Hermite controls сразу в конечные массивы Store.
- Production browser применяет последующие Force Particles к тому же Store.
  Server не читает полный Graph на Particle, не строит event-local scene и не
  отправляет replacement. Browser не выполняет hydration/reconciliation между
  двумя представлениями сцены.
- Compact Hermite controls являются числовыми Store columns: `12` finite чисел
  для Transition и `24` для двухсторонней Relation. Sampled points не
  передаются. Browser CPU полностью реконструирует фиксированные `64` segments
  сразу в рабочий renderer `Float32Array`.
- Material/activity handlers меняют только затронутые material/flags slots и
  вызывают точные material operations. Geometry handlers меняют только
  затронутые position/form/control ranges и вызывают точные buffer operations.
  Structural handlers дополнительно поддерживают локальные ownership и
  incidence indexes, не вызывая full-scene layout или diff.
- Stateless functions из `../../pkg/visual` вычисляют initial и локально затронутые
  values выбранного fixed layout law. Они возвращают calculation values непосредственно в
  рабочие Store columns; сериализуемых render indexes, второй сцены или
  долгоживущего calculation model нет.
- Вложенные Torus одного materialized root имеют общий мировой центр.
  Renderer хранит root center локально, а для каждого потомка —
  разность мировых центров ребёнка и непосредственного родителя.
- Один Visual Field marker может представлять несколько canonical Field
  occurrences только при одном materialized Value. Alias хранит каждую
  исходную `(parentDarkParticleId, fieldId, fieldParticleId)` и никогда не
  становится Boundary identity.
- State layout node связывается с canonical occurrence только точной парой
  `nodeId ↔ orbitalParticleId`. Transition обязан совпасть ровно с одним
  canonical channel по owner, source id, endpoints и condition Field ids.
  Wire несёт одну owner-local cubic Hermite-дугу, полностью описанную
  layout-owned endpoints и derivatives; Bulk не строит собственную кривую
  между State.
- Material и замкнутый двухсторонний cubic Hermite channel отображаемой Relation хранятся
  как две упорядоченные compact-дуги. Browser CPU
  детерминированно восстанавливает по `64` сегмента на дугу перед существующим
  `LineSegments` и пишет их сразу в его `Float32Array`, не создавая
  промежуточный массив point objects.
- `process-read` и `process-write` остаются Store relations и участвуют в
  локальном Process/Field-proxy layout, но имеют `batch = 0` и
  `controlStart = -1`: постоянная линия к пустому центру Process-Torus не
  создаётся и Renderer для неё не вызывается.
- Process и Finally получают готовый Torus на большой окружности внутри объёма
  трубки своего exact State, но не в центральном отверстии State. Их read/write
  Field proxies получают готовые Sphere placements в центральном ядре самого
  Process/Finally-Torus. Толщина трубки State заранее расширяется вокруг полного
  Process/Finally content extent. Reaction получает готовую placement рядом со
  State. Axion и
  принадлежащая только ему geometry отсекаются до вызова Visual strategy,
  поэтому не занимают placement slot и не меняют положение видимых particles.
  Condition Field proxy без Process/Finally ownership получает готовую
  spherical placement из State layout; прочие proxies получают готовую
  self-similar placement той же стратегии. Bulk не масштабирует прежние State
  offsets.
- Активность State-sleeve задаёт opacity всей ветки. Неактивная ветка получает
  единое package-owned значение `0.24`: его используют State-Torus, входящие и
  внутренние Transition-дуги, Process/Finally и прочие causal forms, а также
  все Field proxies и Relation-дуги этой ветки. Runtime-активность отдельного
  Process или Relation может менять glow внутри активной ветки, но не отменяет
  branch opacity.
- Orbital и Field proxy получают форму только через исчерпывающие и
  непересекающиеся exact sidecars. Render record не дублирует Torus outer radius
  в `sphereRadius` и Sphere radius в `ringRadius`.
- До изменения scene state renderer boundary отклоняет non-finite coordinates
  и colors, неположительные radii/tubes, color вне `[0, 1]`, отрицательные
  canonical counts и любой mesh detail кроме package-owned `64 × 192` для
  крупных Dark Torus, `32 × 192` для вложенных State/Process/Finally/Field-proxy
  Torus и `32 × 24` для Sphere. Он также проверяет точное identity coverage
  materials/paths, exact `torus/highlight=0` и `sphere/highlight=1`, wire law
  `cubic-hermite@1` с `64` segments, одну curve на Transition и две на Relation,
  отсутствие legacy `points`, единое forward/return
  направление batch и не более четырёх Transition batches на владельца
  (`active/inactive × forward/return`).
- Relation endpoints и aliasing проверяются при построении Store. Browser
  получает numeric endpoints, owner, controls и material; renderer читает
  только точные slots/ranges, названные handler.
- Production Dark Torus используют фиксированный mesh detail `64 × 192`,
  вложенные State/Process/Finally/Field-proxy Torus — `32 × 192`, Sphere —
  фиксированный package-owned detail. Depth LOD, wireframe carrier, fallback
  Torus geometry и cosmos-reflow запрещены.
- Torus, Field, State/causal forms, Field proxies и краткоживущий Force
  impulse являются first-class `Mesh`. `LineSegments` разрешены только для
  Transition и Relation: это связи, а не скрытый старый renderer. Готовые
  package batch ids дают не более четырёх Transition draw-batches на владельца:
  active/inactive для forward/return. Fingerprint не сериализуется: изменённый
  handler уже знает точный batch slot, а неизменённый Store slot не требует CPU
  sampling или замены GPU buffer.
  Заменённая/удалённая line geometry освобождается; viewport-local
  surface caches удерживают только используемые Mesh geometry и полностью
  очищаются при dispose.
- Picking, fit, labels и HUD читают тот же Bulk Store. Direct Higgs/Gluon
  mutation меняет только фактически затронутые slots; geometry buffer меняется
  лишь когда handler изменил соответствующие position/form/control columns.
- Каждый видимый semantic Mesh является самостоятельной целью picking и
  navigation: Dark, Field, State, Process, Reaction, Finally и Field proxy.
  Выбор Mesh фокусирует камеру на его точной render geometry; выбор Dark
  фокусирует принадлежащую ему полную Atom-проекцию. При наложении одинаково
  близких к указателю форм вложенный Mesh имеет приоритет над окружающим
  прозрачным Torus. Среди объектов одного visual depth выбирается Mesh,
  ближайший к указателю в экранной проекции, а не ближайший к камере. Click и
  tap используют текущий уровень фокуса. Отдельный Mesh под указателем всегда
  сохраняет свою identity и приближает к этому Mesh, даже если луч также пересекает
  внешний прозрачный Torus. Клик по более высокому реальному Torus без hover-padding
  отдаляет к родителю, когда под указателем нет другого точного Mesh. Если камера
  находится внутри нескольких прозрачных Tori и их exact-hit distance совпадает,
  выход выбирает ближайший меньший visual depth, а не перескакивает сразу к root.
  Луч через отверстие Torus также достигает вложенного Mesh.
- Каждый Dark, State и toroidal Field proxy Torus получает подпись из своей
  точной render identity без depth-window. Подпись использует viewport-owned
  baseline шрифта и отступа и увеличивает их пропорционально точному внешнему
  радиусу формы относительно package-owned baseline пустого корневого Torus.
  Поэтому выросший от содержимого Torus сохраняет читаемый масштаб подписи, а
  малый Torus не уменьшает её ниже viewport baseline.
- Меню, HUD, navigation/picking, camera pose, viewport fit,
  fullscreen, Force impulses, causal timeline с отдельным control dock и
  capture остаются Bulk-owned поведением и не заменяются вместе с
  layout/visual law.
- Для принадлежащих Bulk меню, HUD, navigation и timeline immediate parent
  выделяет semantic child slots по
  [законам `LAYOUT-SLOT-001` и `LAYOUT-FLEX-001`](https://github.com/zavx0z/layout/blob/main/packages/core/requirements.md#semantic-child-slots).
  [Закон UI-композиции](https://github.com/zavx0z/ui/blob/main/ARCHITECTURE.md#ui-composition-law)
  связывает эти slots с consumer-owned retained parent; Bulk не вычисляет
  sibling offsets и не создаёт второй component graph. Renderer, picking и
  primitive scene geometry внутри уже выделенного slot остаются Bulk-owned
  визуальной геометрией, а не UI child layout.
- Canvas, viewport, `Space`, `Renderer`, `ViewPoint`, GPU resources и их
  lifecycle принадлежат Bulk. Shared `Space` может содержать невизуальные
  слои, поэтому `../../pkg/visual` не создаёт и не владеет ни всем `Space`, ни Engine
  lifecycle; он заканчивается на declarative scene и update operations.
- Renderer получает только точные Store values/ranges или add/remove/move/copy
  operations. Отсутствующий parent является ошибкой; child не переносится в
  workspace и entity не пропускается молча.

## Проверяемая граница

Production Bulk bundle не должен содержать прежние layout и renderer symbols:

```text
bulk/gravity/layout/snapshot
bulk/gravity/layout/stream
bulk/gravity/level/detail
bulk/gravity/level/geometry
bulk/gravity/level/memo
latticePoints
placeOrbitItemsByBands
createQuadTorusWireframeGeometry
getTorusWireframeGeometry
getSphereWireframeGeometry
applyCanonicalManifestPatchToScene
```

Production boundary не содержит `BulkVisualRenderManifest`, universal render
patch или второй scene Store. Counts для HUD выводятся из активных Store rows.

## Измеренное доказательство direct initial

На сохранённом Lada projection direct writer и прежний трёхступенчатый test
oracle дают одинаковые numeric visual columns для `5` Dark, `28` Field markers,
`54` Field occurrences, `193` Orbitals, `864` proxies, `165` Transitions,
`1928` Relation rows, из которых `864` имеют geometry, и `27` line batches.
Direct Store дополнительно сохраняет
Boundary-compatible source rows: `5` WIMP, `54` Field, `23` State, `32`
Transition, `43` Condition и `13` Process (`0` Reaction в этом fixture).
Сравнение включает все pixels, forms, materials и compact Hermite controls; UI
text сравнивается по значению, а не по внутреннему номеру dictionary slot.

Повторный замер после добавления всех source columns: в `15` чередующихся
прогретых проходах на одном runtime projection median CPU составляет
`26.949 ms` у direct writer против `453.738 ms` у oracle (`−94.06%`). JS heap
capacity над forced-GC baseline составляет `15,604,736` против `103,626,752`
байт (`−84.94%`); изолированный process peak RSS — `65,970,176` против
`214,687,744` байт (`−69.27%`). UTF-8 initial payload `{session, store}`
занимает `680,546` байт против `1,373,527` байт у прежнего ReadyScene
(`−50.45%`). Direct Store foundation занимает `680,515` байт; oracle-derived
Store — `678,391` байт, потому что test oracle закономерно не содержит новые
canonical declaration source facts.

На том же прогретом Lada Store с no-op renderer median handler CPU составляет
`2.246 ms` для Photon material update, `7.206 ms` для чередующегося Gluon
split/merge с локальной geometry и `9.964 ms` для Process structural replace;
`p95` соответственно `3.765`, `8.640` и `13.050 ms`. Эти цифры измеряют
server projection/Store handlers и не подменяют browser first-paint/live proof.
