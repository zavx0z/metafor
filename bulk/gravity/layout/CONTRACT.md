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
- Root Atom torus сохраняет читаемую outer form в обычном scene-depth
  material; renderer не заменяет её sparse silhouette.
- Renderer использует materialized Atom-local `localX/localY/localZ` без
  дополнительной spherical-shell проекции. Поэтому Fields остаются в
  упакованном локальном ядре owning Atom, а State markers сохраняют
  тороидальную композицию manifestation. Marker-ы, Field proxies,
  transitions и локальные relations принадлежат одному render container
  owning Atom и используют те же materialized endpoints. Marker count,
  identity и visual radius не создают отдельную renderer-only раскладку и не
  меняют parent ownership, topology, causal layout либо identity.
- Initial root fit и click/focused fit используют один renderer-only visual
  envelope owning Atom: torus, Field/State sphere bounds, Field-proxy,
  transition и локальные relation geometry после их final-world transforms.
  Fit target остаётся в центре torus, а существующее направление камеры не
  меняется. Persisted pose, layout и geometry этим framing-законом не
  переписываются.

## Трёхуровневый coordinate contract Лады

Acceptance fixture использует ровно принятую MF-117 projection, а не
альтернативную тестовую Вселенную:

```text
Lada (Atom 2; manifest 4)
├── Auth (Atom 3; manifest 6)
├── Chat (Atom 4; manifest 8)
│   └── ChatSend (Atom 6; manifest 12)
└── Model (Atom 5; manifest 10)
```

Текущий transform содержит только translation
`t = (localX, localY, localZ)` и положительный uniform scale
`s = torusScale`. Обозначим такой локальный transform как `L`, а полный frame
Atom в world coordinates как `F`. Renderer материализует ровно эту parent
chain и получает композицию через scene graph; он не создаёт для Matter второй
envelope, центр или transform.

| Уровень | Atom frame | Что authored/materialized локально | Что наследуется | World law |
| --- | --- | --- | --- | --- |
| 0 | `F_Lada` | root frame Lada и координаты её собственного содержимого | только verified former-root frame при promotion либо обычный selected-root frame | `F_Lada = L_Lada` |
| 1 | `F_Auth`, `F_Chat`, `F_Model` | отдельные `L_Auth`, `L_Chat`, `L_Model` в frame Lada | ровно `F_Lada` | `F_child = F_Lada ∘ L_child` |
| 2 | `F_ChatSend` | отдельный `L_ChatSend` в frame Chat | полный `F_Chat = F_Lada ∘ L_Chat` | `F_ChatSend = F_Lada ∘ L_Chat ∘ L_ChatSend` |

Для translation и uniform scale композиция проверяется численно:

```text
worldOrigin(child) = worldOrigin(parent) + worldScale(parent) * t_child
worldScale(child)  = worldScale(parent) * s_child
```

Matter child authored только в локальном frame своего непосредственного
owning Atom. Для его полного локального outer radius `R_child`, uniform scale
`s_child` и фиксированного inner envelope `r_inner(parent)` обязательно:

```text
|t_child| + s_child * R_child <= r_inner(parent)
```

В world coordinates тот же закон обязан сохраниться после композиции:

```text
|O_child^W - O_parent^W| + S_child^W * R_child
  <= S_parent^W * r_inner(parent)
```

Bound проверяется сначала для Auth/Chat/Model относительно Lada, затем отдельно
для ChatSend относительно Chat. ChatSend нельзя author-ить в frame Lada,
прикреплять к root container либо вычислять как `F_Lada ∘ L_ChatSend`.
Его world origin и scale обязаны быть результатом композиции через Chat и
отличаться как от `F_Chat`, так и от `F_Lada`. Координаты из разных локальных
frames нельзя сравнивать или соединять до явного приведения обеих точек в
world coordinates.

## Следствие

Добавление или изменение дочернего Atom может детерминированно изменить внутреннюю
упаковку siblings, но не внешний размер родителя. Initial package и дальнейшее
применение тех же Particle проходят через один store и один layout-закон, поэтому дают
эквивалентную геометрию.
