# Требования пакета nodes

Этот документ владеет требованиями к model/layout integration. Алгоритмические
законы находятся отдельно в `@nodes/layout`: [общие](layout/requirements/COMMON.md),
[`RIGHT`](layout/requirements/RIGHT.md) и [`DOWN`](layout/requirements/DOWN.md).

## Projection и измерение

1. `nodes` владеет validation node-system model, containment index и
   преобразованием измеренной presentation-модели в минимальный `LayoutGraph`.
2. Загруженный renderer font и card plan измеряются до вызова layout. В graph
   передаются только числовые intrinsic sizes, content boundary и port offsets;
   текст, facts, actions, Flex и `NodeSystemDocument` границу не пересекают.
3. Layout result связывается с исходным document по semantic IDs без
   post-routing и без изменения рассчитанной geometry.
4. Presentation adapter может переставлять только связанные parameter rows,
   чтобы уменьшить bends и Manhattan length. ID параметров и edges не меняются,
   обычные и несвязанные строки сохраняют исходный порядок. Перестановка
   принимается только при улучшении общей лексикографической оценки; если её
   достаточно, целые карточки ради этого не перемещаются.

## Layout Worker

1. Worker adapter принадлежит пакету `nodes`, а не алгоритмическому
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
5. Новая topology generation, добавление/удаление нод или переход viewport через
   границу `RIGHT`/`DOWN` запускают один полный пересчёт актуального graph.
   Telemetry-only update без изменения topology, intrinsic geometry или режима
   не запускает layout повторно.
6. Предыдущая geometry может быть только начальным кадром presentation-анимации
   и не передаётся как input новой раскладки.
