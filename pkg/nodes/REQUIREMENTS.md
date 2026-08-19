# Требования пакета nodes

Этот документ владеет требованиями к текущей общей
semantic/measured/positioned layout-границе. Новая Blender-подобная component
library принадлежит [`@nodes/ui`](ui/REQUIREMENTS.md) и намеренно не
адаптируется к этому формату до следующего этапа layout integration.
Алгоритмические законы находятся отдельно в `@nodes/layout`: [общие](layout/requirements/COMMON.md),
[adaptive side-selection](layout/requirements/ADAPTIVE.md),
[`RIGHT`](layout/requirements/RIGHT.md) и [`DOWN`](layout/requirements/DOWN.md).

## Projection и измерение

1. `nodes` владеет validation единой semantic topology и containment index.
   Semantic port принадлежит node; UI row, label, action или другой
   presentation element не является его владельцем.
2. `NodeSystemDocument` не требует `title`, `summary`, `tone`, rows, actions,
   размеров либо UI-anchor. Этот временно сохранённый layout contract не
   является моделью нового Node Editor.
3. Общий `MeasuredNodeSystem` содержит ту же topology, числовые intrinsic
   размеры, content boundary и offsets anchors. В нём нет UI, текста, DOM,
   Flex, WebGPU или product vocabulary.
4. Layout result возвращает resolved side каждого port отдельно от optional
   semantic side constraint. Renderer не выводит side из координаты и adapter
   не мутирует semantic port после layout.
5. Layout result связывается с исходным document по semantic IDs без
   post-routing и без изменения рассчитанной geometry.
6. Domain `NodeSystemNode.id` остаётся exact identity node и endpoint.
   Если runtime incarnation меняется, но visual slot остаётся тем же, producer
   передаёт отдельный уникальный `layoutId`. Adapter использует его только как
   стабильную identity минимального `LayoutGraph`, а результат связывает
   обратно с domain IDs. Runtime UUID, время появления и порядок lifecycle
   событий сами по себе не являются сигналом для другой geometry.
7. Порядок входных semantic arrays не меняет детерминированную geometry
   одинаковой topology в `RIGHT` и `DOWN`.

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
   реэкспортируют `@nodes/ui`.
8. Fixed и adaptive используют один policy-neutral transport lifecycle, но
   имеют отдельные clients и executors. Fixed executor импортирует только
   `@nodes/layout/fixed`, adaptive executor — только `@nodes/layout/adaptive`;
   client не импортирует ни один solver.

## Package и playground boundary

1. Core, fixed/adaptive layout policies, новый Node Editor consumer и оба
   Worker executors/clients имеют физически независимые browser entrypoints.
   Узкий layout consumer не загружает противоположную policy, UI или WebGPU без
   своего явного import; Node Editor consumer не загружает layout solver.
2. Dev-only SVG playground вызывает public `@nodes/layout/fixed` и
   `@nodes/layout/adaptive` через один private registry. Он не экспортируется
   production package, не владеет собственным placement/routing/validator и не
   импортирует Node Editor, Engine или product code.
3. Playground показывает normalized numeric input, public result, resolved
   sides, nodes/compounds, edges/bends/gateways, bounds и policy diagnostics для
   `RIGHT`/`DOWN`. Его SVG и browser screenshot доказывают только этот
   изолированный путь и не являются WebGPU или product acceptance.
4. Debug label каждого port располагается детерминированно вне route bounds и
   соединяется одним прямым leader с exact port center. Label boxes не
   пересекаются между собой или semantic routes; leader не является layout
   route и не меняет policy input/result geometry.
5. SVG playground соблюдает тот же containment painting law, что Surface:
   background каждого compound находится под semantic routes, а его foreground
   chrome и descendant leaf cards — над routes. Debug leaders также находятся
   под chrome/leaf cards; gateways, exact ports и внешние label boxes остаются
   верхними слоями. Edge marker имеет цвет semantic edge. Этот presentation
   order не меняет layout input/result geometry.
6. Adaptive playground matrix отдельно доказывает shared exact port на root
   leaf topology и на topology с source/target compounds в `RIGHT`/`DOWN`.
   Оба вида вызывают один public adaptive entrypoint и не создают playground
   solver или fixture-specific routing.
7. Каждый playground scenario является полным preset и владеет одной typed
   fixed/adaptive policy вместе с topology, viewport и expected direction.
   Независимый policy switch запрещён: run/reset/RIGHT-DOWN comparison получают
   policy только из scenario, а UI показывает её read-only. Cross-policy
   comparison требует отдельного явного действия и собственной matrix.
