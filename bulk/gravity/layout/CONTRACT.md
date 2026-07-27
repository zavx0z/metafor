# Договор раскладки Bulk × Gravity

`bulk/gravity/layout` строит runtime-снимок manifestation для визуализации. Рендер и
`pkg/engine` не участвуют в этом законе: сюда приходит реальное дерево Dark particles
из полного Boundary projection, отсюда выходит `BulkManifest` с локальными transform,
координатами и размерами materialized particles.

## Закон Atom

- Atom — рекурсивная единица manifestation. На каждом уровне повторяется один локальный
  закон построения, но не состав: Fields, состояния, топологии и дети принадлежат именно
  своему materialized Atom.
- Локальная геометрия Atom одинакова на каждом уровне. Корневой внешний диаметр равен
  примерно `100 мм`; дочерний Atom получает единый uniform scale относительно родителя.
- Один transform дочернего Atom охватывает его тор, подпись, Fields, orbital geometry,
  channels и всё реальное дочернее поддерево.
- Дочерние Atom детерминированно упаковываются внутрь внутреннего envelope родителя по
  materialized `parentDarkParticleId`. Отдельная декоративная иерархия не строится.
- Внешний envelope родителя фиксирован. Число, содержимое или изменение потомков не
  пересчитывает размер parent torus снизу вверх; при плотном составе уменьшается
  allocation содержимого внутри родителя.
- Собственные Fields Atom детерминированно упаковываются в его локальное ядро. При
  нехватке места уменьшаются сферы Fields, а не внешний envelope Atom.
- `orbitEdgeGapMm` влияет только на локальные зазоры внутри фиксированного envelope.
- Нормализация к корневому диаметру выполняется одним глобальным scale-проходом. Она
  не меняет рекурсивные transform и materialized отношения.
- Удаление корневого Atom само по себе не выбирает новый root для manifestation.
  Promotion применяется только по отдельному verified receipt, который называет
  удалённый root Atom, promoted Atom и захваченный frame бывшего root.
- При verified promotion promoted Atom занимает захваченный root frame одним
  uniform reframe. Тот же transform охватывает всё его поддерево на любую глубину;
  локальные позиции, размеры и materialized links внутри поддерева не
  пересчитываются. Receipt, не согласованный с post-projection, игнорируется.
- Без verified promotion receipt действует обычный закон выбранного `rootSrc`;
  удаление или текущая форма дерева не являются основанием угадывать promotion.
- Live promotion принимает receipt только через закрытый internal MF-117
  adapter после того, как projection уже получила все preceding entity
  consequences. Adapter заново сверяет removed/promoted Atom identities,
  отсутствие бывшего root и полное promoted subtree, затем сохраняет Lada как
  active root вместе с former-root frame. Receipt не является Particle и не
  создаёт общий Bulk command.
- Durable verification связывается с immutable structural proof: exact
  removed/promoted identities, former-root frame, retention и полным
  рекурсивным составом/reparent promoted subtree. Текущие Gluon/Photon/Process
  values не входят в этот proof и не могут создать конфликт при повторной
  проверке того же уже принятого promotion. Старый durable v1 receipt
  принимается только после проверки собственного hash, exact closed shape и
  тех же текущих structural invariants; он не переписывается.
- Принятый root Atom `replace` с `parentAtom = parentTopology = null`
  переводит selected root server и уже открытого observer на названный `wimp`.
  До такого structural consequence исходный Inference остаётся выбранным и
  проявляется обычным образом; удаление source без принятого нового root не
  является основанием выбрать другой root.
- Torus всегда принадлежит реально присутствующему materialized Atom. После
  accepted dissolve отсутствие Inference Inflaton/Atom в post-projection
  удаляет и его torus; promoted Lada получает собственный root torus в
  verified former-root frame. Отдельный ghost, stale либо decorative torus
  бывшего Inference запрещён.
- Существующие State markers на торе Capsule показывают текущий State самым
  сильным читаемым material/glow; достижимые potential State markers остаются
  явно видимыми, но вторичными, а неактивные sleeves — приглушёнными. Эта
  градация меняет только visual material markers и не меняет Capsule
  structure, State/Transition identity, activity, timeline либо projection
  semantics. Hue marker-а детерминирован semantic State identity: все
  occurrences одного State имеют один цвет, разные State — разные стабильные
  цвета. Current/potential/inactive меняют только brightness/opacity, не
  semantic hue. Лёгкий shimmer является ограниченной пространственной функцией
  GPU material с фазой от identity и текущего visual state: он обновляется
  вместе с обычной projection/state change, не создаёт CPU simulation,
  дополнительных marker objects или собственного perpetual render-loop gate.
  Current marker сохраняет обычный scene-depth material и прежний узнаваемый,
  но не glaring, look. Только non-current potential/inactive markers проходят
  последним
  bounded single-sample line-material overlay pass без depth write, чтобы
  внешняя wireframe geometry и MSAA resolve не скрывали их; pass использует
  saturating additive blend той же single-object marker geometry. Potential
  остаётся явно сильнее subdued inactive marker, а inactive — различимее фона.
- Существующие non-root Atom toruses образуют inner core и используют тот же
  bounded single-sample material overlay с отдельным opacity/luminance
  contrast. Это не меняет их torus geometry, transform, nesting/layout,
  identity или projection; root torus и connectivity geometry сохраняют
  обычный scene-depth material. Существующие Field spheres внутри этих nested
  Atom получают bounded red accent material в том же overlay и читаются как
  nucleus lights/orbs; их shader-local material scale меньше единицы и
  удерживает nucleus accent визуально меньше State-electron marker. Geometry,
  node transform, layout и pick/projection radius не меняются; новые
  objects/geometry для accent не создаются.
- Root Atom torus сохраняет outer form как subtle sparse/translucent material
  silhouette, а не dense foreground grid. Silhouette не пишет depth и поэтому
  не перекрывает relation/connection lines; пространственная rim-маска
  вычисляется в существующем line shader без новой geometry или render-loop.
- Field spheres и State spheres получают только в Bulk renderer
  детерминированную derived visual position на одной **сферической** shell
  поверхности своего owning Atom. Torus этого Atom находится в центре и
  целиком внутри сферы; marker-ы не объединяются в root-wide shell и не
  проецируются на torus surface. Shell radius монотонно растёт от outer radius
  owning torus с количеством marker-ов этого Atom и их visual radius,
  предотвращая crowding. Каждый Atom имеет отдельный identity
  `markerShell`-frame внутри собственного render container; его
  marker/proxy/connection render objects используют этот frame и не попадают в
  frame другого Atom. Shell center radius монотонно, но bounded растёт с
  occupancy и не превышает `0.59` final-world diameter собственного torus;
  endpoint локальной relation, включая Field-proxy offset, не превышает
  `0.64` того же diameter. Uniform recursive `matrixWorld` scale применяется
  одинаково к torus, shell и локальным relation endpoints, поэтому эти bounds
  сохраняются на любой глубине. Распределение стабильно по marker identity и
  пересчитывается только при projection/state change. Persisted
  `localX/localY/localZ`, parent ownership, topology, causal layout и identity
  не меняются; relation/transition geometry использует те же derived
  Atom-local endpoints и остаётся читаемой.

## Следствие

Добавление или изменение дочернего Atom может детерминированно изменить внутреннюю
упаковку siblings, но не внешний размер родителя. Initial package и дальнейшее
применение тех же Particle проходят через один store и один layout-закон, поэтому дают
эквивалентную геометрию.
