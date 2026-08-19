# Требования пакета nodes

Этот документ владеет требованиями к общей semantic/measured/positioned
границе. Card presentation и fixed/adaptive Card adapters принадлежат
`@nodes/ui`.
Алгоритмические законы находятся отдельно в `@nodes/layout`: [общие](layout/requirements/COMMON.md),
[adaptive side-selection](layout/requirements/ADAPTIVE.md),
[`RIGHT`](layout/requirements/RIGHT.md) и [`DOWN`](layout/requirements/DOWN.md).

## Projection и измерение

1. `nodes` владеет validation единой semantic topology и containment index.
   Semantic port принадлежит node; Card row, label, action или другой
   presentation element не является его владельцем.
2. `NodeSystemDocument` не требует `title`, `summary`, `tone`, facts, actions,
   размеров либо UI-anchor. Presentation adapter связывает semantic IDs со
   своим содержимым без создания параллельной topology.
3. Общий `MeasuredNodeSystem` содержит ту же topology, числовые intrinsic
   размеры, content boundary и offsets anchors. В нём нет Card, текста, DOM,
   Flex, WebGPU или product vocabulary.
4. Layout result возвращает resolved side каждого port отдельно от optional
   semantic side constraint. Renderer не выводит side из координаты и adapter
   не мутирует semantic port после layout.
5. Fixed card adapter связывает layout result с исходным document по semantic IDs без
   post-routing и без изменения рассчитанной geometry.
6. Domain `NodeSystemNode.id` остаётся exact identity node и endpoint.
   Если runtime incarnation меняется, но visual slot остаётся тем же, producer
   передаёт отдельный уникальный `layoutId`. Adapter использует его только как
   стабильную identity минимального `LayoutGraph`, а результат связывает
   обратно с domain IDs. Runtime UUID, время появления и порядок lifecycle
   событий сами по себе не являются сигналом для другой geometry.
7. Presentation adapter может переставлять только связанные Card rows,
   чтобы прежде всего уменьшить edge-edge crossings, затем bends и Manhattan
   length. ID параметров и edges не меняются, обычные и несвязанные строки
   сохраняют исходный порядок. Если crossing устраняется перестановкой строк,
   целые карточки ради этого не перемещаются. Перестановка принимается только
   при улучшении общей лексикографической оценки и одинаковой hard validity.
   Порядок прихода связанных lifecycle facts не является presentation state:
   перед scored candidates они канонизируются по semantic ID только внутри
   уже занятых ими slots. Поэтому одинаковая topology даёт одну geometry в
   `RIGHT` и `DOWN` независимо от порядка событий и входных массивов.

## Layout Worker

1. Worker transport adapter принадлежит пакету `nodes`, а не алгоритмическому
   `@nodes/layout`. Layout package предоставляет только синхронное pure ядро и
   его serializable protocol.
2. Один долгоживущий browser-local Worker получает минимальный `LayoutGraph`,
   возвращает geometry той же generation и отклоняет устаревшие ответы. Worker
   не является domain, topology или lifecycle node приложения.
3. Worker вызывает то же pure ядро, а не второй алгоритм. Молчаливого
   синхронного fallback на main thread при ошибке нет; failure передаётся
   потребителю явно.
4. Worker request/response/client types принадлежат `nodes/types`, не
   `@nodes/layout/types`. В layout protocol остаются только вход и результат
   синхронного алгоритма.
5. Новая topology generation, добавление/удаление нод или settled изменение
   точного viewport запускают один полный пересчёт актуального graph. Серия
   resize-событий ограничивается debounce, а устаревший Worker result не может
   примениться после более нового размера. Telemetry-only update без изменения
   topology, intrinsic geometry или viewport не запускает layout повторно.
6. Предыдущая geometry может быть только начальным кадром presentation-анимации
   и не передаётся как input новой раскладки.
7. Ни Worker transport, ни корневой barrel `nodes` не импортируют и не
   реэкспортируют `@nodes/ui` или `@nodes/hud`.
8. Fixed и adaptive используют один policy-neutral transport lifecycle, но
   имеют отдельные clients и executors. Fixed executor импортирует только
   `@nodes/layout/fixed`, adaptive executor — только `@nodes/layout/adaptive`;
   client не импортирует ни один solver.

## Package и playground boundary

1. Core, fixed/adaptive layout policies, fixed/adaptive Card adapters, custom
   positioned Surface и оба Worker executors/clients имеют физически независимые
   browser entrypoints. Узкий consumer не загружает противоположную policy,
   Card, Surface, HUD или WebGPU без своего явного import.
2. Dev-only SVG playground вызывает public `@nodes/layout/fixed` и
   `@nodes/layout/adaptive` через один private registry. Он не экспортируется
   production package, не владеет собственным placement/routing/validator и не
   импортирует Card, UI/HUD, Engine или product code.
3. Playground показывает normalized numeric input, public result, resolved
   sides, nodes/compounds, edges/bends/gateways, bounds и policy diagnostics для
   `RIGHT`/`DOWN`. Его SVG и browser screenshot доказывают только этот
   изолированный путь и не являются WebGPU или product acceptance.
4. Debug label каждого port располагается детерминированно вне route bounds и
   соединяется одним прямым leader с exact port center. Label boxes не
   пересекаются между собой или semantic routes; leader не является layout
   route и не меняет policy input/result geometry.
