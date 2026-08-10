# @ui/node

Generic node-system presentation package. Он не знает о Hamiltonian, Dark,
Bulk, Oracle или Force.

Геометрический pipeline имеет одного владельца раскладки:

1. renderer измеряет реальный TrueType text;
2. общий Flex plan задаёт card size и точные port centers;
3. полный inclusion tree с реальными children, ports и edges переводится в
   serializable fixed-point input pure TypeScript engine;
4. синхронное ядро единолично вычисляет positions, compound sizes, generated
   WEST/EAST gateways и orthogonal sections;
5. WebGPU surface рисует и анимирует полученную геометрию без второго layout
   или routing pass.

Значения наблюдаемых параметров рисуются штатным `@ui/components TextField`.
Поскольку монитор не владеет их изменением, эти поля передаются компоненту в
`disabled`-состоянии; renderer не имитирует control отдельным текстом или
самодельным прямоугольником. Каждый socket принадлежит конкретной строке
параметра через обязательный `NodeSystemPort.parameterId`, находится слева или
справа от неё и только эта координата передаётся layout engine как exact port.
Каждый semantic edge имеет ровно два endpoint. Каждый endpoint обязан содержать
`nodeId` и `portId` socket своей видимой строки параметра именно на указанной
ноде. Edge не может начинаться или заканчиваться на самой ноде, её центре,
compound boundary, implicit hierarchy contact, fallback point или чужом порту.
Compound-нода может быть endpoint только через собственный явно показанный
параметр и его port. Если нужного endpoint-параметра ещё нет, producer
проекции создаёт реальный параметр на фактической semantic endpoint node, после
чего edge ссылается на его port. Пересечение промежуточных compound boundaries
не создаёт endpoint, параметр или socket. Lowest common ancestor владеет только
containment и coordinate space edge; он никогда не заменяет source/target
parameter ports. Любое несоответствие отклоняется до layout; visual-only anchors,
endpoint lifting и второй фиктивный transport запрещены.

Нода может указать generic `parentId` для визуальной вложенности. Это не edge и
не transport: смысл отношения остаётся у producer. Adapter превращает
`parentId` в реальные nested `children`. Bottom-up placement получает всё дерево
и cross-hierarchy edges за один синхронный run, сам вычисляет размеры compound
и оставляет routing corridors сверх obstacle clearance. Глубина не ограничена
числом уровней; неизвестный parent, self-parent и любой containment cycle
отклоняются до поиска.
Compositing следует той же containment-глубине: background каждого owner
рисуется до проходящих внутри него edge-сегментов, а foreground owner и полные
карточки потомков — после них. Поэтому parent fill не скрывает route до socket
вложенной ноды, но линия не накладывается поверх дочерней карточки и её текста.
Каждая section начинается и заканчивается точно в центре видимого parameter
socket; renderer не добавляет anchors, gateways, bends или внутрипортовый
post-route. Retained traffic particles компонуются над edge и под
карточками/sockets, поэтому сигнал не может визуально удалить сам порт.

Compound padding и все node/edge/port spacing выводятся из одного фактического
`NODE_SYSTEM_PORT_PITCH`. Размер текста и строк портов является minimum intrinsic
geometry; окончательный размер владельца вычисляется по фактическим детям и
законным routing corridors.

Surface поддерживает drag одной ноды или выделенной рамкой группы в graph
coordinates и отдаёт одно атомарное `move/end` событие владельцу приложения.
Обычный trackpad wheel является двумерной панорамой, а передаваемый Chrome
`ctrl+wheel` pinch — плавным экспоненциальным zoom вокруг cursor; дискретный
шаг масштаба для trackpad не используется.
Прямое редактирование geometry является отдельной опцией generic surface.
Приложение, в котором engine единолично владеет раскладкой, устанавливает
`editable: false`; тогда selection не меняет coordinates и resize handles не
создаются. Сохранение geometry между загрузками не является обязанностью пакета.

Edge labels не занимают постоянное место в сцене. Название связи показывается
tooltip рядом с cursor только при наведении на узкий hit-corridor вдоль
rendered stroke; edge одновременно становится толще. Tooltip по
умолчанию располагается сверху, затем выбирает right/bottom/left, если мешает
край surface/browser. Hover не подменяет semantic tone общим highlight-цветом:
линия сохраняет исходный цвет и выделяется только увеличенной толщиной.
Карточка ноды, зарегистрированная позднее, сохраняет приоритет hit-testing.

Surface принимает transient edge-message отдельно от serializable topology.
Одно принятое сообщение создаёт одну частицу, которая равномерно проходит
фактический rounded route по направлению source→target либо target→source.
Хвост состоит из затухающих сегментов того же semantic edge color. Частицы не
меняют document, layout, selection или persisted presentation state; кадры
запрашиваются только до истечения последней частицы. Их meshes живут в
retained presentation-layer: transforms и material uniforms меняются in-place,
а декларативная сцена нод/текста/рёбер не пересобирается. Все particle shapes
разделяют одну unit-plane geometry, поэтому peak concurrency не умножает
одинаковые vertex/index GPU buffers.

Card body и header используют отдельную умеренную opacity, поэтому рёбра и
другие карточки остаются различимы под перекрытием. Прозрачность не применяется
к typography, sockets и borders: она не должна превращать topology в бледный
единый слой.

Inspector использует штатный `HudWindow`, который компонует готовый
`@ui/components Pane` с общими title bar и frame interactions: title bar
двигает плавающую pane, границы и углы изменяют её размер, а кнопка сворачивает
её без потери выбранной ноды. Вернуть pane можно из штатного movable
`HudSideTab` у края canvas; movable-стик всегда остаётся на периметре и при
перетаскивании может перейти на соседнюю сторону только через ближайший край;
закрытое состояние не рисует пустую панель на всю высоту. И pane, и стик
сообщают владельцу только дельты frame и изменение open-state; хранением
geometry и перераскладкой workspace владеет приложение. Содержимое открытого
inspector использует общий scroll-контейнер UI: изменение размера pane не
удаляет факты или действия, а оставляет их доступными прокруткой.
Title bar открытого Inspector показывает `node.title`, а subtitle —
`node.kind`; постоянное предметное имя инспектора пакет не навязывает. Выбор
ноды и открытие Inspector являются независимыми действиями: selection может
обновить его содержимое в закрытом состоянии, а открыть pane должен отдельный
явный контрол владельца. Title bar использует стандартную высоту `HudWindow`
и не добавляет специальный нижний отступ из-за наличия subtitle. Caller
может передать generic `titleBarActions`: пакет только размещает их в
готовом `HudWindow`, не знает их предметного смысла и не сериализует callbacks.
`NodeSystemSurface` является бесконечным 2D-холстом. Его
`canvasTransform = {x, y, scale}` возвращается через
`onCanvasTransformChange`; это положение и масштаб содержимого внутри surface,
а не engine `ViewPoint` или камера. Предметные canvas controls принадлежат
приложению и могут жить в отдельном HUD-окне. После первого materialized
transform изменение размера surface сохраняет его без неявного fit: решение
повторно вызвать `fitToView` или установить новый transform принадлежит
приложению-владельцу.
Значение inspector, которое не помещается в точный Flex-slot, раскрывает полный
многострочный текст существующим cursor tooltip; короткие значения не получают
лишнего hover chrome.

Product path не имеет внешнего layout/routing backend, Web Worker, manual
placement или post-routing. `layoutGraph(input)` — синхронная pure function со
structured-clone-safe contract; будущий Worker может быть только адаптером
вокруг неизменного ядра. Выбран производительный гибрид: layered
median/barycenter ordering, bounded compaction по мотивам
[Brandes–Köpf](https://boriskoepf.de/papers/gd01a.pdf) и sparse visibility A*
из подхода [orthogonal connector routing](https://users.monash.edu/~mwybrow/papers/wybrow-gd-2009.pdf).
Network-simplex служит только ориентиром layered-архитектуры, описанной
[Gansner et al.](https://graphviz.org/documentation/TSE93.pdf), и не является
отдельным solver в product path. Если compact portrait candidates не оставляют
legal corridor для нескольких sibling relations, placement генерирует один
bounded wide fallback; router обращается к deterministic target-port edge order
только после hard failure основного semantic-ID order. `RIGHT` выбирается при `width >= height`,
`DOWN` — только при `height > width`. Для portrait действует выбранная
владельцем compact policy: compound empty ratio является acceptance gate до
soft turn/length objective. Повторы и стабильные permutations обязаны давать
битово одинаковую fixed-point geometry по semantic-ID tie-break.
