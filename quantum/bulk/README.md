# Bulk HUD

Bulk владеет browser Store, viewport и causal-time interaction. Его внешняя
Storybook-проекция использует production `@ui/components` HUD и Timeline,
сохраняет их компактную Blender 5.2 форму и отдельно показывает Bulk-owned
playback controller, causal-channel rows, placement, fullscreen state и causal
resolution tones. Neutral Timeline получает только ranges, текущую позицию,
общие keyframes и отдельные scene markers.

External Workbench владеет catalog, overview и package lifecycle. Runtime Bulk
монтирует одну живую production-композицию в предоставленный semantic Document.
Детерминированные development transport и fullscreen host задают только ответы
окружения; pause/resume, выбор causal frame и fullscreen остаются поведением
Bulk и проходят обычные bubbling events. После каждого действия Workbench
показывает то же живое дерево с актуальным видимым состоянием. Category `bulk`
и subject `bulk/hud` сохраняют прежние overview paths без дополнительного
уровня навигации. Catalog resources указывают на владельцев закона, production
composition и story source; внешняя система читает их напрямую и не создаёт
копий.
