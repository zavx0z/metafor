# Требования @nodes/ui

Этот документ владеет требованиями к отображению готовой node-system geometry
и управлению видом. `@nodes/ui` не рассчитывает автоматическое размещение и не
меняет semantic topology.

## Отображение geometry

1. Визуальный stroke доходит до exact port center и не заменяет socket точкой
   на границе карточки.
2. Полный базовый stroke semantic edge виден постоянно. Moving-message marker
   рисуется поверх него; крупные движущиеся квадраты являются markers сообщений,
   а не портами.
3. Renderer может локально скруглить готовый waypoint, но не меняет exact
   endpoints, gateways, bends или clearance.
4. Compositing учитывает containment: owner background рисуется под проходящим
   внутри него маршрутом, а foreground и дочерние карточки — над маршрутом.
5. Текст и поля масштабируются пропорционально canvas scale. Минимальная
   экранная толщина strokes, borders и sockets является только renderer policy
   и не возвращается в layout bounds или spacing.

## View

1. Auto-fit и canvas transform не входят в layout algorithm. Пока auto-fit
   включён, UI показывает весь текущий graph и исключает HUD-окна из display
   rect.
2. Первый ручной pan/zoom выключает auto-fit для текущей page incarnation.
   Последующий transform принадлежит пользователю, пока он явно не включит
   auto-fit снова.
3. Toggle auto-fit и одноразовая команда «Показать весь граф» независимы:
   разовая команда выполняет один fit и не обязана включать автоматический
   режим.
4. Telemetry-only update не сбрасывает canvas transform. Resize выполняет новый
   fit только при включённом auto-fit.
5. Новая page incarnation не наследует старые coordinates, widths или canvas
   transform.
6. Анимация surviving nodes и compound не меняет окончательную layout geometry.
   Положение и размер owner интерполируются вместе с containment chain, и child
   не выходит за interpolated owner boundary.
