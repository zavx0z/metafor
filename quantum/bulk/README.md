# Bulk HUD

Bulk владеет browser Store, viewport и causal-time interaction. Его production
HUD использует `@ui/components` HUD и Timeline; Bulk составляет playback
controller, causal-channel rows и fullscreen state из своих данных. Neutral
Timeline получает ranges, текущую позицию, keyframes и scene markers.

Визуальная проверка Bulk во внешнем Storybook остаётся целью. Она должна
показывать production HUD и актуальное состояние после pause/resume, выбора
causal frame и fullscreen через обычные события. Принадлежащие Bulk проверки
используют управляемые transport и fullscreen host. Текущий пакет не содержит
Storybook runtime, монтирующий эту композицию в Workbench.
