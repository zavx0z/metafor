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
4. Domain `NodeSystemNode.id` остаётся exact identity факта, action и endpoint.
   Если runtime incarnation меняется, но visual slot остаётся тем же, producer
   передаёт отдельный уникальный `layoutId`. Adapter использует его только как
   стабильную identity минимального `LayoutGraph`, а результат связывает
   обратно с domain IDs. Runtime UUID, время появления и порядок lifecycle
   событий сами по себе не являются сигналом для другой geometry.
5. Presentation adapter может переставлять только связанные parameter rows,
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
5. Новая topology generation, добавление/удаление нод или settled изменение
   точного viewport запускают один полный пересчёт актуального graph. Серия
   resize-событий ограничивается debounce, а устаревший Worker result не может
   примениться после более нового размера. Telemetry-only update без изменения
   topology, intrinsic geometry или viewport не запускает layout повторно.
6. Предыдущая geometry может быть только начальным кадром presentation-анимации
   и не передаётся как input новой раскладки.
