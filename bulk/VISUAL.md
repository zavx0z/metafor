# Договор Bulk manifestation и Visual projection

Bulk проявляет один полный runtime projection в два последовательных, но
архитектурно разных представления.

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

- Единственная production-стратегия Bulk — готовая `centered-nested` из
  `@metafor/visual/layout/centered-nested`. В Bulk нет собственной запасной
  раскладки, runtime-переключателя layout или canonical viewport fallback.
- Initial package и каждое изменённое projection проходят один путь:
  `BulkManifest + projection → Axion defer policy → CenteredNested.buildScene →
  BulkVisualRenderManifest → applyVisualManifestPatch`.
- `pkg/visual` является единственным владельцем координат, абсолютных размеров,
  цветов форм и детерминированного размещения Torus, Field, State, причинных
  particles и Field proxies. Он строит immutable `VisualComponentForest`,
  один раз компилирует его в render indexes и line batches. Bulk проверяет
  identity и переводит готовые world coordinates в local frame владельца; он
  не адаптирует форму, не вычисляет вторую раскладку и не наследует geometry из
  semantic manifest.
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
  Вместе с ним renderer получает готовый sampled path из того же
  `pkg/visual` State-рукава; Bulk не строит собственную кривую между State.
- Relation material и замкнутый двухсторонний cubic Hermite sampled path также
  приходят из `pkg/visual`: верхняя и нижняя дуги используют по `64` сегмента
  и ту же высоту, что и Transition. Bulk не вычисляет relation endpoints или
  кривую.
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
  materials/paths, exact `torus/highlight=0` и `sphere/highlight=1`, `65`
  sampled points на Transition, `129` на Relation, единое forward/return
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
  заранее вычисленный fingerprint не сериализует все точки при повторном
  patch. Заменённая/удалённая line geometry освобождается; viewport-local
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
