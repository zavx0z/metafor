# @ui/node

Generic node-system presentation package. Он не знает о Hamiltonian, Dark,
Bulk, Oracle или Force.

Геометрический pipeline разделён намеренно:

1. renderer измеряет реальный TrueType text;
2. общий Flex plan задаёт card size и точные port centers;
3. ELK предлагает первоначальные координаты нод;
4. при add/remove прежние ноды остаются якорями, а новая нода получает
   свободную позицию из ELK proposal;
5. server-only export `@ui/node/server` передаёт фиксированные rectangles и
   ports в Libavoid и возвращает orthogonal edge routes;
6. WebGPU surface рисует ту же геометрию и скругляет повороты сохранённого
   Libavoid route локальными cubic Bézier segments.

Surface поддерживает drag одной ноды или выделенной рамкой группы в graph
coordinates и отдаёт одно атомарное `move/end` событие владельцу приложения.
Обычный trackpad wheel является двумерной панорамой, а передаваемый Chrome
`ctrl+wheel` pinch — плавным экспоненциальным zoom вокруг cursor; дискретный
шаг масштаба для trackpad не используется.
Обе вертикальные границы карточки являются resize handles: правая сохраняет
левый край, левая — правый; ports и connected endpoints следуют за новой
шириной немедленно. Сам пакет не хранит coordinates или width: Hamiltonian
сохраняет пользовательскую геометрию в origin-local storage и после отпускания
просит тот же server-side Libavoid adapter перестроить только рёбра.

Edge labels не занимают постоянное место в сцене. Название связи показывается
tooltip рядом с cursor только при наведении на узкий hit-corridor вдоль
rendered stroke; edge одновременно становится толще. Tooltip по
умолчанию располагается сверху, затем выбирает right/bottom/left, если мешает
край surface/browser. Hover не подменяет semantic tone общим highlight-цветом:
линия сохраняет исходный цвет и выделяется только увеличенной толщиной.
Карточка ноды, зарегистрированная позднее, сохраняет приоритет hit-testing.

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
Caller может передать generic `titleBarActions`: пакет только размещает их в
готовом `HudWindow`, не знает их предметного смысла и не сериализует callbacks.
Hamiltonian использует этот contract для локального `fitToView`; вычисленный
viewport возвращается через обычный `onViewportChange`, поэтому приложение
может сохранить его без отдельного toolbar или transport-команды.
Значение inspector, которое не помещается в точный Flex-slot, раскрывает полный
многострочный текст существующим cursor tooltip; короткие значения не получают
лишнего hover chrome.

Основной export не включает WASM backend, поэтому browser bundle не получает
Libavoid. Серверный adapter проверен с Bun 1.3.14 и сериализует обращения к
общему WASM runtime.

`@mr_mint/elkjs-libavoid` распространяется под MIT и использует
`libavoid-js`/Adaptagrams Libavoid под LGPL-2.1-or-later. При публикации
собранного server artifact нужно сохранить соответствующие license notices и
доступность исходного кода LGPL-компонента.
