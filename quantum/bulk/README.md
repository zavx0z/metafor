# Bulk HUD

## Архивная реализация

Bulk архивирован на месте в `quantum/bulk`. Исходники, собственные manifests,
проверки и предметные контракты сохранены для отдельной будущей переработки.
Этот архив внутри MetaFor не связан с внешним архивным контуром Production.

Bulk и его дочерние packages исключены из активного workspace, общей установки,
проверки типов, стандартного запуска тестов и состава выпуска Cosmos.
Вместе с ними сохранён вне активного состава связанный `pkg/visual`.
Старые точки запуска Universe и browser-gateway Dark используют этот архив и
также выведены из рабочего запуска; библиотеки доменов и данные сохраняются.
Точные пути и команды рабочего состава задаёт
[руководство разработки](../../docs/DEVELOPMENT.md#архив-bulk).

[Cosmos](../../cosmos/README.md#текущий-контур-запуска) запускает свою
инфраструктурную визуальную среду. Следующие разделы описывают сохранённую
реализацию Bulk и не означают её подключения к текущему выпуску.

## Сохранённое представление

Bulk владеет browser Store, viewport и causal-time interaction. Его production
HUD использует `@ui/components` HUD и Timeline; Bulk составляет playback
controller, causal-channel rows и fullscreen state из своих данных. Neutral
Timeline получает ranges, текущую позицию, keyframes и scene markers.

Визуальная проверка Bulk во внешнем Storybook остаётся целью. Она должна
показывать production HUD и актуальное состояние после pause/resume, выбора
causal frame и fullscreen через обычные события. Принадлежащие Bulk проверки
используют управляемые transport и fullscreen host. Текущий пакет не содержит
Storybook runtime, монтирующий эту композицию в Workbench.
