# Договор Bulk manifestation и Visual projection

Bulk проявляет один полный runtime projection в два последовательных, но
архитектурно разных представления.

## Единственная стартовая основа

- Рождение Bulk поднимает только RPC, Force, browser handoff и принадлежащее им
  operational state. Оно не вызывает `Dark.readGraph`, не создаёт серверный
  Graph Store и не удерживает derived projection.
- Каждый browser `GET /` отдельно вызывает rootless `Dark.readGraph({})`.
  Dark возвращает один актуальный полный `Graph`, а `Graph.root` остаётся
  данными этого ответа. Bulk валидирует его, request-local строит semantic и
  Visual projection, вкладывает готовую scene в HTML и после ответа не хранит
  этот Graph или projection. `Boundary.initialProjection.read` и другая сборка
  полного мира на стороне Boundary для Bulk запрещены.
- JSON является только технической сериализацией Graph на transport/storage
  границах; Bulk не вводит из неё второй world format или отдельный контракт.
- Обычный `Particle` не является Graph patch: его paths содержат внутренние
  runtime identity, которых публичный Graph намеренно не содержит. Сейчас
  входящий `Particle` служит causal invalidation: Bulk дожидается применённого
  Boundary cut, читает полный Graph только через Dark и готовит одну
  event-local replacement scene для подключённых browsers. Серверного Graph
  cache между invalidations нет. Checkpoint JSON Patch не переносится в
  live-протокол.
- Единственный адаптер `Graph → BulkProjectionSnapshot` создаёт
  Bulk-local identity и готовит существующую semantic projection/scene. Он не
  читает Boundary, не хранит world state и не добавляет значения, которых нет
  в Graph. При изменении public Graph контракта сначала
  меняются его domain law, validator и `readGraph`; затем одним срезом
  меняются этот адаптер, initial/update transport и их совместные тесты.
- Visual остаётся stateless библиотекой вычисления геометрии. Graph Store,
  адаптированная semantic projection и scene Store возникают только внутри
  browser-owned `BulkVisualSceneLifecycle`; renderer и Engine lifecycle также
  принадлежат Bulk, но не серверному startup.

## Semantic manifestation

- `buildBulkManifestation` строит только identity, ownership, порядок и
  причинные связи `Dark`, `Field`, `State`, `Transition`, `Process`,
  `Reaction`, `Finally`, `Axion` и Field proxy.
- Semantic `BulkManifest` не содержит координат, размеров, scale, цвета,
  mesh-detail или renderer material state. Эти значения нельзя использовать
  для восстановления topology.
- Одна canonical occurrence сохраняет одну identity. Совпавшие Values не
  объединяют Field occurrences в semantic manifest.
- Одна декларация Process или Finally проявляется отдельной canonical
  occurrence в каждом точном появлении связанного State во всех его
  State-sleeves. Только occurrence в активном sleeve получает `active=true`;
  неактивность меняет материал и причинный статус, но не скрывает Process и не
  переносит его в другое появление State.
- Verified root promotion меняет выбранный semantic root только по receipt.
  Захваченный `formerRootFrame` остаётся operational evidence и не запускает
  скрытый reflow либо старую раскладку.
- Axion identity и связи сохраняются. Его Visual surface пока не
  активируется: это отдельный будущий этап.

## Production Visual projection

- Раскладка по умолчанию — готовая `centered-nested` из
  `@metafor/visual/layout/centered-nested`. Bulk зависит именно от этого
  single-strategy subpath, а не от каталога стратегий, поэтому находящаяся в
  разработке `outside-in` не попадает в production bundle. Любая другая
  стратегия передаётся вызывающей стороной явно как `VisualLayout` — того же
  публичного контракта; собственной запасной раскладки и canonical viewport
  fallback в Bulk нет.
- Initial package и каждое изменённое состояние Graph проходят один путь:
  `BulkManifest + projection → Axion defer policy → buildVisualScenePayload →
  VisualScenePayload → классификация инвалидации и reconcile →
  adaptBulkVisualRenderManifest → applyVisualManifestPatch`.
  `VisualScenePayload` — сериализуемый layout-agnostic результат стратегии: он
  не содержит Canvas, GPU handles, `Renderer`, `Space` или `ViewPoint`, поэтому
  может быть подготовлен на сервере.
- Публичный `bulk/visual` предоставляет один Bulk-owned lifecycle для
  production browser, будущего UI и playground: `prepare` принимает полный
  snapshot, `hydrate` — server-prepared initial scene, `apply` проводит один
  Particle через projection/composition/presenter, `state`, `snapshot`,
  `layoutInput` и `compose` возвращают detached declarative cuts, а `dispose`
  освобождает подключённый renderer target. Внутренние projection,
  manifestation, Store и renderer adapters не являются public integration
  points.
- Для каждого `GET /` сервер готовит initial `VisualScenePayload` из свежего
  request-local no-root Graph read и вкладывает полный validated initial package в HTML
  как inert JSON. Браузер читает embedded package и гидратирует его в
  Bulk-owned persistent `BulkVisualStore` без отдельного `/initial` request и
  без повторного layout. Bulk не выбирает root из local Store, MF-117 receipt
  или default source; он использует `Graph.root` ответа Dark. Этот initial contract не содержит causal frontier,
  reconnect, replay или recovery policy.
- Envelope `visual-prepared-scene@1` и вложенный `cubic-hermite@1` являются
  fail-closed wire contracts. Payload содержит ровно `12` finite чисел на дугу
  и не содержит sampled `points`; unknown version, другая arity или legacy
  representation отклоняются до hydration.
- `BulkVisualSceneLifecycle`, `BulkVisualScenePresenter` и
  `bulk/visual-store.ts` владеют persistent scene state, update policy и связью
  Store с payload, находящимся на экране.
  `selectLayout` меняет выбранную стратегию и сбрасывает удержанный payload,
  так как другая стратегия вправе разместить каждую форму иначе. `hydrate`
  принимает payload, подготовленный вне этого процесса, и отклоняет payload,
  чей `layoutSlug` не совпадает с выбранной стратегией; layout при этом не
  пересчитывается. `apply` классифицирует пришедшее изменение: изменение, не
  способное сдвинуть geometry, при идентичном payload вообще не доходит до
  viewport, а structural change перестраивает scene целиком, потому что
  сужение там оставило бы её устаревшей.
- Visual явно различает `appearance`, `effects`, `relations`, `geometry` и
  `structure`. Первые три не запускают layout и отдают точные declarative
  операции; geometry и structure вправе перестроить layout ради correctness.
  Reconcile после такого перестроения всё равно передаёт Engine adapter только
  фактически добавленные, изменённые и удалённые identities.
- Вызванный Bulk stateless pattern из `pkg/visual` вычисляет координаты,
  абсолютные размеры, цвета форм и детерминированное размещение Torus, Field,
  State, причинных particles и Field proxies. Он возвращает immutable
  `VisualComponentForest`, render indexes и line batches; Bulk выбирает pattern
  и композирует его derived artifacts в общую сцену. Bulk проверяет identity и
  переводит готовые world coordinates в local frame владельца; он не вычисляет
  вторую раскладку и не наследует geometry из semantic manifest.
- Вложенные Torus одного materialized root имеют общий мировой центр.
  Renderer manifest хранит root center локально, а для каждого потомка —
  разность мировых центров ребёнка и непосредственного родителя.
- Один Visual Field marker может представлять несколько canonical Field
  occurrences только при одном materialized Value. Alias хранит каждую
  исходную `(parentDarkParticleId, fieldId, fieldParticleId)` и никогда не
  становится Boundary identity.
- State layout node связывается с manifested occurrence только точной парой
  `nodeId ↔ orbitalParticleId`. Transition обязан совпасть ровно с одним
  canonical channel по owner, source id, endpoints и condition Field ids.
  Wire несёт одну owner-local cubic Hermite-дугу, полностью описанную
  layout-owned endpoints и derivatives; Bulk не строит собственную кривую
  между State.
- Relation material и замкнутый двухсторонний cubic Hermite channel также
  приходят из `pkg/visual` как две упорядоченные compact-дуги. Browser CPU
  детерминированно восстанавливает по `64` сегмента на дугу перед существующим
  `LineSegments` и пишет их сразу в его `Float32Array`, не создавая
  промежуточный массив point objects; Bulk не вычисляет relation endpoints,
  форму или сторону.
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
- Relation endpoints после Field aliasing обязаны существовать и принадлежать
  тому же materialized root component, что и channel parent.
- Production Dark Torus используют фиксированный mesh detail `64 × 192`,
  вложенные State/Process/Finally/Field-proxy Torus — `32 × 192`, Sphere —
  фиксированный package-owned detail. Depth LOD, wireframe carrier, fallback
  Torus geometry и cosmos-reflow запрещены.
- Torus, Field, State/causal forms, Field proxies и краткоживущий Force
  impulse являются first-class `Mesh`. `LineSegments` разрешены только для
  Transition и Relation: это связи, а не скрытый старый renderer. Готовые
  package batch ids дают не более четырёх Transition draw-batches на владельца:
  active/inactive для forward/return;
  заранее вычисленный fingerprint покрывает compact curves и material, поэтому
  неизменённый patch не требует CPU sampling или замены GPU buffer.
  Заменённая/удалённая line geometry освобождается; viewport-local
  surface caches удерживают только используемые Mesh geometry и полностью
  очищаются при dispose.
- Picking, fit, labels и HUD читают точную Visual render projection. Direct
  Higgs/Gluon mutation не изменяет geometry: новая geometry появляется только
  после следующей полной semantic manifestation и Visual projection.
- Каждый видимый semantic Mesh является самостоятельной целью picking и
  navigation: Dark, Field, State, Process, Reaction, Finally и Field proxy.
  Выбор Mesh фокусирует камеру на его точной render geometry; выбор Dark
  фокусирует принадлежащую ему полную Atom-проекцию.
- Каждый Dark, State и toroidal Field proxy Torus получает подпись из своей
  точной render identity без depth-window. Подпись использует viewport-owned
  baseline шрифта и отступа и увеличивает их пропорционально точному внешнему
  радиусу формы относительно package-owned baseline пустого корневого Torus.
  Поэтому выросший от содержимого Torus сохраняет читаемый масштаб подписи, а
  малый Torus не уменьшает её ниже viewport baseline.
- Меню, HUD, Node View, navigation/picking, camera pose, viewport fit,
  fullscreen, Force impulses, causal timeline с отдельным control dock и
  capture остаются Bulk-owned поведением и не заменяются вместе с
  layout/visual law.
- Canvas, viewport, `Space`, `Renderer`, `ViewPoint`, GPU resources и их
  lifecycle принадлежат Bulk. Shared `Space` может содержать невизуальные
  слои, поэтому `pkg/visual` не создаёт и не владеет ни всем `Space`, ни Engine
  lifecycle; он заканчивается на declarative scene и update operations.
- Renderer получает geometry-bearing manifest и компактные canonical counts,
  но не полный semantic manifest. Отсутствующий parent является ошибкой; child
  не переносится в workspace и entity не пропускается молча.

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

`BulkVisualRenderManifest.manifest` является отдельным geometry-bearing render
contract и не сохраняется как canonical manifestation. `sourceStats` переносит
только canonical counts для HUD; полный semantic `BulkManifest` не пересекает
renderer boundary.
