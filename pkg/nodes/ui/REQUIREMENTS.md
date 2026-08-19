# Требования @nodes/ui

Этот документ владеет требованиями к отображению готовой node-system geometry
и управлению видом. `@nodes/ui` не рассчитывает автоматическое размещение и не
меняет semantic topology.

## Intrinsic measurement

1. Card Model является presentation preset `@nodes/ui`, а не частью semantic
   `NodeSystemDocument`. Она владеет `title`, `summary`, `tone`, facts, actions,
   размерами и явными anchors `semantic port ID → Card row ID`.
2. Card adapter проверяет полноту ссылок и до вызова layout измеряет фактические
   intrinsic width/height карточки, нижнюю границу занятого собственного content
   и offsets центров видимых sockets. Измерение использует тот же card plan,
   шрифты и содержимое, которые затем отображаются.
3. `contentHeight` заканчивается на последней занятой строке карточки либо на
   нижней границе header, если собственных строк нет. Декоративный нижний
   padding в эту величину не входит.
4. Расстояние между центрами соседних sockets передаётся владельцу
   layout как единый socket pitch. UI не добавляет к нему скрытый spacing.
5. Масштабирование одинаково применяется к card slots и socket offsets. UI не
   выбирает координаты нод, compound, gateways или bends.

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
6. Наведение на любой видимый участок semantic edge выделяет его полный
   базовый stroke. Если в одной видимой области проходят несколько edges, UI
   выделяет их все; порядок рисования не выбирает случайного единственного
   победителя. Leaf-card foreground остаётся поверх маршрута и не активирует
   скрытый под ним edge; пустая область compound-контейнера не блокирует
   наведение на видимый внутри него маршрут.
7. Цвет exact socket, semantic edge и moving-message marker определяется одним
   consumer-provided resolver по их общему `connectionType`; без resolver
   применяется детерминированный универсальный fallback. Вход и выход одного
   типа имеют одинаковый цвет. `direction` задаёт универсальную capability,
   optional semantic `side` ограничивает placement, а renderer использует
   обязательный resolved side из positioned result; состояние
   `neutral / live / paused / warn` передаётся отдельным признаком и не меняет
   цветовую identity типа соединения.

## Package boundary

1. `@nodes/ui` не импортирует `@ui/hud` или `@nodes/hud`.
2. Inspector и другие HUD-window integrations принадлежат `@nodes/hud`.
3. `@nodes/ui/surface` принимает готовую geometry и не импортирует fixed card
   adapter. Поэтому custom/adaptive consumer не загружает fixed policy.
4. `@nodes/ui/fixed-card-layout` явно владеет fixed placement exact sockets и
   может импортировать `@nodes/layout`; этот import не проходит через renderer
   surface entrypoint.

## View

1. Auto-fit и canvas transform не входят в layout algorithm. Пока auto-fit
   включён, UI показывает весь текущий graph внутри переданного владельцем
   display rect.
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
