# Договор Visual layout

`pkg/visual` показывает один полный Monad snapshot через выбранную именованную
раскладку. Верхний уровень пакета — это каталог раскладок, а не перечень
`Atom`, `Matter`, `Field`, `State` и других видов entity.

## Публичная граница пакета

- `pkg/visual/src` — единственный production source и единственная публичная
  граница пакета. Только модули из `src` могут быть целями `exports` в
  `package.json`; production consumer импортирует их по объявленным package
  entrypoints и не обращается к исходным файлам по относительным путям.
- `pkg/visual/playground` — приватная лаборатория того же пакета. Она вправе
  компоновать production-модули из `src`, UI, fixtures, debug-инструменты и
  временные эксперименты, но не экспортируется наружу. Production-модуль не
  импортирует playground. После принятия эксперимента в `src` переносится
  только его очищенная переиспользуемая часть.
- Приватный каталог `Force Stories` содержит горизонтальную вкладку для каждого
  действующего `Part` из общего Force-протокола. Верхний уровень каталога не
  перечисляет Matter, Atom, Field, State либо семейства visual entities.
  Выбранная Story владеет одной входящей Particle и одним focused
  representation затронутого production graph slice. Photon representation
  содержит упорядоченные наборы layout strategies и camera views, расширяемые
  без изменения модели каталога; сейчас это две раскладки
  `centered-nested`/`outside-in` и две камеры `top`/`side`, то есть четыре
  одновременных отображения. Все они строятся из одного prepared projection и
  получают один Photon/Restart lifecycle. Внутри каждой раскладки обе камеры
  получают один и тот же immutable `VisualScene`, а не независимо
  подготовленные сцены. Side меняет только camera orientation: камера
  становится перпендикулярно неизменной оси State occurrences, чтобы их
  исходные позиции проецировались в один читаемый ряд без occlusion; layout для
  второго ракурса не выполняется повторно. Верхняя панель содержит только общие
  индикаторы State-рукавов,
  Apply/Restart и help в одной компактной горизонтальной строке. Название и
  status Story остаются в выбранной Force-вкладке и не повторяются над сценой;
  отдельного описательного яруса либо блока под областью просмотра нет.
  Справа от матрицы отображений постоянно видны ровно два
  JSON-инспектора: входящая Force Particle и подготовленный source snapshot, из
  которого построено representation; они не сворачиваются в нижний footer.
  Неподтверждённая visual-реакция остаётся явно
  обозначенным шаблоном и не рендерит придуманную сцену. Первым проверенным
  сценарием является записанный Photon sequence 412 для `zavx0z/lada-model`:
  подготовленный через sequence 411 projection-срез содержит полное
  causal-and-visual closure его State-рукавов, включая родительский Torus и
  общие Fields, Process, States, Transitions, Conditions и production
  relations/proxies. Одно focused representation проходит через обе production
  стратегии и четыре приватных Engine viewport. Photon переводит текущий State
  из `обращение к модели` в `ошибка` и меняет только activity/current materials
  State, Process, Transition и relation occurrences, сохраняя их identities и
  геометрию внутри каждой раскладки; Restart точно восстанавливает
  подготовленный срез перед Photon. Полная сцена, synthetic diagram, player,
  timeline, replay и virtual-time semantics в этот каталог не входят.
  Внутри private playground эти обязанности разделены явно:
  `ForceStories.ts` содержит только каталог, metadata и маршруты восьми Force;
  `PhotonForceStory.ts` вместе с `fixture/PhotonStoryFixture.ts` владеет
  записанным Photon-сценарием, closure и provenance;
  `ForceStoryLabAdapter.ts` является единственным private bridge к deep Bulk
  implementation. Только этот adapter гидратирует projection, применяет и
  сбрасывает Particle, строит manifestation/обе `VisualScene`, вычисляет
  activity summary и связывает их с private viewport lifecycle.
  `ForceStoriesLab.ts` является UI над каталогом и этим adapter и не импортирует
  Bulk implementation напрямую. Параллельного session/projection механизма у
  каталога либо UI нет.
- Каждая запись `Visual` является исполняемой стратегией с единым
  `buildScene({manifest, owners})`. Каталог не требует от consumer ручного
  `switch` по slug. `centered-nested` готова и используется production Bulk;
  `outside-in` остаётся явно помеченной `in-progress`. Это две и только две
  production layout strategies.
- Готовая сцена доводится до renderer одним layout-agnostic контрактом
  `@metafor/visual/payload`. `buildVisualScenePayload(layout, input)` исполняет
  любую именованную стратегию и возвращает `VisualScenePayload`: сериализуемую
  детерминированную проекцию, в которой каждая позиция уже выражена в local
  frame своего владельца, а sampled path хранится плоской последовательностью
  координат. Payload не содержит Canvas, GPU handle, `Renderer`, `Space` либо
  `ViewPoint`, поэтому его готовит и сервер, и браузер, а `JSON.stringify` не
  меняет его смысл. `layoutSlug` в payload является полным union каталога, а не
  фиксированным именем одной стратегии.
- Consumer, которому нужна только готовая стратегия, использует
  side-effect-free `@metafor/visual/layout/centered-nested`. Этот subpath
  экспортирует `centered-nested`, layout-agnostic payload/reconciler контракты и
  необходимые ей neutral graph/form helpers, но не включает `outside-in`,
  каталог, viewport adapter или playground. Поэтому production bundle одной
  стратегии не втягивает незавершённую. Другая стратегия передаётся consumer'ом
  явно как `VisualLayout`; пакет не резолвит slug за него.
- Persistent Visual Store гидратируется готовой серверной сценой, сохраняет
  stable identities и принимает уже применённые upstream-изменения. Решение о
  визуальной работе выражается явно как `none | appearance | effects |
  relations | geometry | structure`. Appearance, effects и relations не
  запускают layout и возвращают точные declarative операции. Geometry и
  structure вправе потребовать повторного исполнения выбранной стратегии;
  correctness важнее локальности.
- Повторное изменение проходит через `reconcileVisualScenePayload(current,
  next)`. Он возвращает точный add/update/remove patch и не требует полной
  замены только из-за изменения набора identities. Совпавший payload не отдаёт
  renderer adapter ничего. Visual Store и patch не содержат causal frontier,
  reconnect, replay или recovery policy: это не visual contract данного этапа.
- `manifest` передаёт полную materialized структуру, а каждый элемент
  `owners` связывает один `StateGraph` с точным `ownerDarkParticleId`.
  Владелец обязан существовать в manifest, быть уникальным во входе и иметь
  тот же canonical `src` и тот же набор/current State, что и manifested
  occurrence. Для Atom действует текущий canonical Bulk namespace
  `ownerDarkParticleId = graph.atomId × 2`; другой pair отклоняется, даже если
  два Atom имеют одинаковые `src` и State. Manifest и graph могут иметь не
  более одного current State и обязаны совпадать по его nullable identity.
  Каждый manifest owner со State particles обязан иметь binding, а graph не
  вправе добавлять отсутствующие в manifest State; неполный snapshot
  отклоняется. Готовые State-layouts с внешними размерами во вход не
  принимаются: стратегия сама строит их по production sizing law.
- Результат `VisualScene` сохраняет identities и ownership Torus, Fields и
  каждого State-рукава, включая одновременно `ownerAtomId` графа и
  `ownerDarkParticleId` manifest. Каждый production State node несёт явную
  пару `nodeId ↔ orbitalParticleId`; внешний consumer не восстанавливает
  occurrence identity разбором opaque layout id. Массивы, placements и
  вложенная State geometry immutable и не ссылаются на изменяемые части
  входного manifest. Компоновщик не сортирует и не изменяет входные массивы.
- Чистые production entrypoints экспортируют layout catalog, single-layout
  entrypoint, payload, persistent Store, material policies и visual update
  decisions. Они не экспортируют playground, Canvas, GPU viewport, Engine
  adapter либо entity-lab catalog.
- Named-layout playground передаёт полный immutable `VisualScene` или готовый
  `VisualScenePayload` своему приватному Engine adapter без промежуточного
  State-layout projection. Adapter использует только готовые form, material и
  sampled path; повторное построение State, condition Field, causal particle,
  proxy, Hermite либо Relation geometry запрещено. Изолированный State Graph
  lab также остаётся приватным playground adapter. Force Stories использует
  тот же renderer adapter только через `ForceStoryLabAdapter.ts`; каталог,
  fixture/scenario и UI не становятся ещё одной Bulk integration boundary.
- Bulk и named-layout playground потребляют одну complete component scene.
  Bulk владеет canvas, viewport, `Space`, `Renderer`, `ViewPoint` и production
  Engine adapter; visual не владеет общим `Space` или Engine lifecycle. Bulk
  предоставляет Monad/Particle boundary, выбирает visual configuration и
  применяет готовые declarative render data либо update operations. Playground
  владеет только своими приватными lab adapters. Обе границы сохраняют identity
  coverage и package material laws до создания GPU objects.
- Детерминированные Field layouts принимают не более `4096` markers за один
  вызов и используют ограниченный recent-cache. Превышение ресурсной границы
  отклоняется синхронно; cached geometry глубоко immutable.
- Одна Visual topology принимает не более `10000` Dark particles и глубину
  parent-child chain не более `256`. Превышение отклоняется контролируемым
  `RangeError`; duplicate identity и structural cycle отклоняются до
  рекурсивной композиции.

## Компонентная production-модель

- `outside-in` показывает повторяемую рекурсивную структуру, но не является
  владельцем готовой компонентной модели. Общая production-модель определена
  отдельно и применяется к результату любой именованной раскладки.
- `Torus` — переиспользуемая форма, но не вся компонентная модель.
  Самовоспроизводимая единица `VisualTorusComponent` содержит форму Torus,
  собственное Field-ядро, цельные State-рукава и вложенные
  `VisualTorusComponent`. `Atom`, `State`, `Fuzzy`, `Axion` и `MACHO` остаются
  semantic payload/role и не создают параллельные реализации формы.
- State-рукав является отдельным неделимым компонентом: occurrence identities,
  State-Torus, вложенные Process/Finally-Torus, привязанные к State остальные
  причинные particles, condition/projection Fields и готовые sampled Transition
  edges проходят один и тот же rigid transform. Причинная particle без exact
  State occurrence в production-сцене запрещена. Relation является отдельным
  edge-компонентом с готовыми material и sampled path.
- Именованная раскладка наполняет `VisualComponentComposer` непосредственно во
  время построения и один раз закрывает его в immutable
  `VisualComponentForest`; post-hoc обёртка готовых flat arrays не является
  production-моделью. `compileVisualComponents` один раз разворачивает лес в
  стабильные renderer indexes и кэширует результат по identity леса.
  Повторная компиляция той же сцены возвращает тот же объект.
- State edges компилируются в однородные батчи по владельцу, направлению
  forward/return и package-owned material; Relation edges — по владельцу и
  material. Для одного владельца State Transitions требуют не более двух
  батчей. Renderer не группирует линии по собственному визуальному закону.
- Material specs принадлежат engine-neutral layout entrypoint. Создание
  конкретных GPU material objects из готовых specs находится в renderer
  entrypoint и не втягивает engine в геометрический пакет.

## Закон раскладки

- Семантический владелец определяет payload, содержимое и связи компонента, но
  не создаёт отдельную реализацию формы или рекурсивной композиции.
- Пустой корневой Torus задаёт только минимальный self-similar baseline:
  внешний диаметр `100 мм`, `radius = 27.78 мм`, `tube = 22.22 мм`,
  внутренний радиус `5.56 мм`. На каждом следующем уровне вложения и пустой
  Torus, и Field-маркер уменьшаются ровно вдвое. Корневой Field имеет
  фиксированный радиус `11 мм` (`22 мм` в диаметре). State-Torus является
  следующим уровнем вложения, а Process/Finally-Torus — следующим уровнем
  внутри своего exact State.
- Baseline не является фиксированным envelope. Фактическое содержимое никогда
  не уменьшается для вмещения: Field-ядро расширяет внутреннюю границу, а
  Matter, State и их причинная геометрия расширяют внешнюю границу Torus.
  Минимальная радиальная толщина пустого Torus при росте сохраняется. Поэтому
  одинаковое содержимое на соседних уровнях геометрически самоподобно с
  коэффициентом `0.5`, а более наполненный Torus растёт наружу.
- Field-ядро любого Torus использует одну детерминированную плоскую
  псевдоокружность: равные Fields заполняют ближайшие к центру позиции
  треугольной решётки с шагом в один диаметр, то есть гексагональную плотную
  упаковку без пересечений. Радиус Field задаётся только уровнем вложения и не
  зависит от их количества, размера отверстия, камеры либо viewport.
  Необходимый размер ядра и Torus выводится из внешнего габарита полных Fields.
  Тот же общий закон действует для condition Fields внутри State-Torus и для
  read/write Field proxies в центральном ядре Process/Finally-Torus. Process
  сначала строится вокруг полного габарита своих Field-Sphere. Центр готового
  Process/Finally-Torus лежит на большой окружности своего exact State-Torus,
  внутри объёма его трубки, а не в центральном отверстии State. Толщина трубки
  State заранее растёт до полного внешнего габарита Process с зазором; при
  нескольких Process их угловые слоты также расширяют большую окружность.
  Обратной подгонки Field под готовое отверстие и отдельной реализации
  Field-раскладки нет.
- Все сплошные Sphere-формы используют один общий quantum-материал с
  фиксированным `highlightSize = 1`: это относится к Fields ядра, condition
  Fields внутри State-Torus, read/write Fields внутри Process/Finally-Torus и
  Sphere в изолированной Form Skin Lab.
  Уровень вложения, количество Fields, камера, viewport и browser controls
  значение не меняют. Это правило не распространяется на Torus и line-only
  wireframe-маркеры.
- State-sleeve владеет прозрачностью всей своей ветки. Для неактивной ветки
  State-Torus, входящие и внутренние Transition, Process/Finally, остальные
  causal forms, их Field proxies и Relation получают одно значение opacity
  `0.24`. Компонент не вычисляет собственную неактивную прозрачность поверх
  ветки; runtime activity внутри активной ветки может менять glow, но не
  branch opacity.
- Детализация Torus фиксирована по роли компонента, а не выбирается камерой:
  крупная Dark-оболочка использует `radialSegments = 64` по поперечному
  сечению, вложенные State, Process/Finally и Field-proxy Torus —
  `radialSegments = 32`;
  вдоль большого кольца обе роли используют `tubularSegments = 192`.
  Корневой размер, глубина вложения, камера и viewport не включают LOD и не
  меняют эти значения. Поэтому крупный горизонтальный профиль остаётся
  гладким, а компактные формы не получают бесполезное удвоение geometry.
- Раскладка получает один и тот же полный snapshot и сохраняет его topology,
  ownership и identity. Она один раз выводит собственную статическую
  геометрию из фактического состава snapshot; камера и размер viewport не
  меняют размеры либо взаимное расположение форм.
- `outside-in` является отдельной незавершённой обзорной стратегией. Она
  начинает с внешнего корневого Atom и рекурсивно раскрывает полный состав
  каждого Atom внутрь: собственные Fields, immediate Matter, State-рукава и
  их причинные элементы. Неизвестный slug не выбирает её как неявный fallback.
- `centered-nested` является отдельной раскладкой над тем же полным snapshot.
  Все Matter-Torus одного корневого дерева сохраняют ownership и identity, но
  имеют один мировой центр. Torus разрешаются от листьев к корню: внутренний
  Torus охватывает свои фактические Field-орбиты и State-рукава, следующий
  concentric Torus охватывает уже разрешённые дочерние формы. Внутренняя
  граница Torus начинается сразу после фактического ядра его собственных
  Fields. Только у корня индивидуальные Fields образуют центральную
  псевдоокружность; у вложенного владельца они занимают внешнюю орбиту уже
  доступного ему ядра. Shared-маркеры входят в ядро своего верхнего общего
  предка. Дочерние Matter-Torus последовательно занимают внутреннюю часть
  начавшейся оболочки. State-рукава владельца начинаются только после
  фактической внешней границы всех дочерних Matter-Torus и образуют последний
  занятый диапазон перед внешней границей Torus владельца. Поэтому State
  родителя не попадают в оболочку дочернего Torus и остаются ближе к краю
  своего Torus. Matter-Torus входят в пространство оболочки родителя и
  расширяют только её внешнюю границу; они не отодвигают начало родительской
  оболочки от Field-ядра.
- `centered-nested` определяет общность Fields только по materialized
  canonical Value identity из snapshot. Разные `Atom/Field` occurrences,
  указывающие на один `Value`, сохраняют свои Field identities в данных, но
  визуализируются одним общим Field-маркером без дублей у потомков. Владельцем
  placement является верхний общий предок всех Atom-владельцев occurrences;
  размер маркера определяется уровнем этого предка, и маркер входит в Field-ядро
  именно Torus этого предка. Совпадение имени либо payload не создаёт общности;
  computed Matter binding с новым `Value` остаётся независимым.
- Не разделяемые с потомками Fields корневого Atom образуют центральное ядро
  по общему закону плоской псевдоокружности. Shared Fields, верхним общим
  предком которых является корень, образуют следующие общие орбиты. Для них
  раскладка определяет максимальную глубину среди Atom-владельцев
  представленных occurrences: большая глубина располагается ближе к центру,
  а внутри одной глубины сохраняется детерминированная группировка по самому
  глубокому владельцу.
- Private Field вложенного Atom не входит в общее центральное ядро и не
  смешивается с shared-орбитами предка. Он остаётся в Field-ядре собственного
  Torus: после уже занятой внутренней части Matter-полосы private Fields
  владельца занимают минимальную внешнюю орбиту ядра, а внутренняя граница
  Torus этого владельца начинается сразу после их полного габарита и локального
  Torus-зазора.
- Внутри одной Matter-полосы дочерние ветви с большей максимальной глубиной
  занимают более внутренний концентрический диапазон; при одинаковой глубине
  действует стабильный порядок snapshot. Это depth-правило не переносит
  private Field из его owning Torus в корневое ядро.
- Один поверхностный зазор, равный полному диаметру максимального Field первой
  shared-группы, отделяет private-ядро владельца от его первой shared-орбиты.
  Все последующие Field-орбиты этого владельца идут без нового поверхностного
  зазора: соседние орбиты разделяет только сумма радиусов их максимальных
  Field-маркеров. Орбита сохраняет минимальный радиус и не расширяется из-за
  количества Fields. Если её окружности недостаточно, создаются следующие
  концентрические орбиты той же группы, а маркеры детерминированно
  распределяются между ними пропорционально геометрической вместимости;
  Field-маркеры не уменьшаются.
- Каждый объявленный State начинает отдельный причинный рукав со всеми
  достижимыми путями и ветвлениями. Повторное появление State в разных рукавах
  является контекстом пути, а не новой доменной identity; рукава нельзя
  схлопывать в единое кольцо State.
- В изолированном `State Graph` lab пути одного стартового State делят общую
  геометрию только до первого различающегося Transition. После ветвления каждый
  контекст пути сохраняет собственный поперечный коридор на всех следующих
  шагах и не сдвигается к центральной оси, когда соседний путь заканчивается.
  Возвратный Transition замыкается на уже существующую occurrence того же
  State внутри своего коридора.
- В `outside-in` внутренняя граница Torus равна максимуму из baseline пустого
  Torus этого уровня и фактического габарита Field-ядра с локальным зазором.
  Дополнительное пустое отверстие под теоретически возможный состав не
  резервируется.
- Matter-полоса существует только у Torus с непосредственными дочерними Torus.
  Она выводится из реальных внешних габаритов этих детей и заканчивается сразу
  после них. Если детей нет, State-полоса начинается сразу после Field-ядра.
- Внешняя граница Torus заканчивается сразу после фактически размещённых
  State-рукавов. Поэтому пустая Matter-полоса и фиксированный внешний envelope
  production manifestation не переносятся в эту обзорную раскладку.
- Все State-рукава одного владельца располагаются на одной следующей внешней
  орбите этого владельца после его непосредственных Matter-Torus. Каждый
  production-рукав строится сразу с радиусами State-Torus, вложенных
  Process/Finally-Torus, их центральных read/write Field-Sphere, condition
  Fields и поверхностными зазорами уровня владельца. Из лаборатории `State Graph`
  переиспользуется только prefix/branch-lane алгоритм, но не её численные
  размеры или координаты. Готовый самодостаточный `StateGraphRootLayout`
  является неделимой геометрией: раскладка выбирает для его корня угловой слот
  и переносит весь рукав одним поворотом и переносом. Взаимные локальные
  смещения узлов не пересчитываются; для вложенного владельца применяется
  только единый world transform его уровня.
- State-граф получает расстояния без пересечений из фактического полярного
  envelope каждого State-рукава, а не из максимального габарита, повторённого
  для всех рукавов. Для узла-диска `j` рукава `i` используются его локальные
  `xᵢⱼ`, `yᵢⱼ` и увеличенный на половину зазора радиус
  `r'ᵢⱼ = rᵢⱼ + g/2`. На минимальной разрешённой ядром орбите `R₀` угловой
  спрос рукава вычисляется напрямую:
  `αᵢ = maxⱼ(|atan2(yᵢⱼ, R₀ + xᵢⱼ)| +
  asin(r'ᵢⱼ / hypot(R₀ + xᵢⱼ, yᵢⱼ)))`.
  Если `Σαᵢ > π`, рукав получает полусектор
  `βᵢ = παᵢ / Σα`; достаточный общий радиус затем получается без поиска:
  `R = max(R₀, maxᵢⱼ((r'ᵢⱼ + |yᵢⱼ| cos βᵢ) / sin βᵢ - xᵢⱼ))`.
  Если рукава уже помещаются на `R₀`, свободный полуугол распределяется между
  ними без увеличения радиуса. Соседние центры разделены `βᵢ + βᵢ₊₁`.
  Один дополнительный фиксированный проход проверяет середину между `R₀` и
  прямой безопасной границей и принимает её только при `Σαᵢ ≤ π`. Поэтому
  расчёт требует не более трёх линейных проходов по узлам и одного
  prefix-прохода по рукавам; цикла сходимости, попарного поиска пересечений,
  бинарного поиска и одинаковых угловых слотов нет. State, Process/Finally и
  их Fields не сжимаются, а owning Torus расширяется вокруг всего готового
  State-рукава.
- Внутренняя геометрия рукава строится единожды общим
  `buildStateGraphBranchLayout`: пути делят prefix до первого различающегося
  Transition, затем каждый путь сохраняет собственный поперечный коридор.
  `outside-in` и `centered-nested` используют этот результат напрямую и не
  запускают поверх него отдельную линейную, органическую или радиальную
  перепаковку.
- Внутренние расстояния между State-Torus принадлежат авторитетной геометрии
  `buildStateGraphBranchLayout` и при композиции не изменяются. Полярный
  упаковщик отвечает только за непересечение разных цельных State-рукавов:
  их envelopes расширяются на половину локального зазора с каждой стороны,
  после чего owning Torus охватывает получившуюся общую орбиту.
- Узлы, condition Fields и sampled paths всех Transition являются одной
  неделимой geometry State-рукава. `VisualScene` возвращает готовый путь
  каждого edge после того же rotation/translation, что применён к его узлам.
  Production consumer может только перенести эти точки в локальный frame
  renderer; заново строить Bézier/Hermite, менять branch lanes или соединять
  центры State собственной кривой запрещено.
- Каждая Relation строится по точным component endpoints как замкнутый
  двухсторонний channel из двух открытых cubic Hermite-дуг. Верхняя и нижняя
  дуги используют тот же geometry law, ту же высоту и по `64` сегмента, что и
  Transition; общий sampled path содержит `129` точек и `128` сегментов.
  Consumer вправе только перевести готовые мировые точки в local frame их
  владельца; выбор другой кривой, стороны или material запрещён.
- При структурном изменении snapshot чистый компоновщик один раз строит новую
  immutable-сцену. Dark owner → root, Field owner → root, State occurrences,
  exact Transition keys и graph-wide State indexes строятся по одному проходу
  и переиспользуются всеми рекурсивными компонентами; повторный полный scan
  Fields либо State occurrences для каждого root/State запрещён.
  Детерминированные semantic orderings сохраняют честную верхнюю границу
  `O(N log N + E)`, где `N` — размер canonical snapshot, а `E` — число
  фактически испущенных State/path occurrences. Pairwise geometry search и
  layout work в render loop отсутствуют: готовая сцена остаётся неизменной
  между структурными обновлениями.
- Entity-компоненты остаются переиспользуемыми визуальными примитивами и
  изолированными линзами для разработки. Они не являются самостоятельными
  верхнеуровневыми раскладками и не образуют основную навигацию playground.
- Каталог содержит ровно `centered-nested` и `outside-in` как независимые
  раскладки над тем же snapshot.
- Выбор раскладки меняет только визуальную композицию. Он не меняет данные,
  topology, parent ownership, State computation, Force history или
  materialization.
- Именованная раскладка не предоставляет пользователю geometry controls.
  Visibility-линза может скрывать слой, но не меняет размеры и позиции.
  Algorithm labs вправе локально варьировать параметры эксперимента, однако
  их controls и `localStorage` не передаются в именованные раскладки.

Bulk manifestation владеет semantic identity, ownership и причинными связями,
но не geometry. `pkg/visual` получает immutable `BulkManifest` и единолично
строит geometry-bearing `VisualScene` и `VisualComponentForest`. Bulk выполняет
только проверку canonical identities и перевод готовых world points в local
frame владельца; он не адаптирует геометрию, не копирует алгоритм, не наследует
прежние coordinates и не держит запасную раскладку. Переиспользуемая
компонентная модель не активирует Axion сама по себе: текущая Bulk policy
отсекает отложенный Axion до вызова production strategy.

Visual заканчивается на declarative scene и visual update decision. Canvas,
viewport, `Space`, `Renderer`, `ViewPoint`, создание GPU resources, применение
patch к Engine objects и lifecycle contour принадлежат Bulk либо приватному
playground adapter, но не production Visual.
