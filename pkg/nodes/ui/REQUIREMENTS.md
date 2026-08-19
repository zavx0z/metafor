# Требования @nodes/ui

Этот документ владеет требованиями к отображению готовой node-system geometry
и управлению видом. `@nodes/ui` не рассчитывает автоматическое размещение и не
меняет semantic topology.

## Blender-подобная компонентная граница

1. Публичный UI-словарь строится вокруг `NodeTree`, `Node`, `Socket`, `Link` и
   `NodeEditor`. `Card` не является второй сущностью рядом с Node: это один
   compatibility renderer preset прямоугольной Node.
2. Generic `NodeEditor` принимает готовую positioned geometry и typed
   `NodeRenderer`, `SocketRenderer`, `LinkRenderer`. Он не импортирует Card
   model, Card layout, Card metrics, Hamiltonian или product code.
3. `Socket` является видимым input/output/bidirectional endpoint. Низкоуровневый
   layout protocol может продолжать использовать `Port`; публичный component
   API не смешивает оба термина в одном слое.
4. `Link` является видимой связью sockets; `Edge` остаётся допустимым
   алгоритмическим термином layout/core. Link renderer не меняет exact endpoints
   или готовый route.
5. Node renderer владеет measurement и внутренними slots, но использует поля из
   `@ui/components`. Node-specific `Fact` запрещён в generic API; независимая
   key/value-строка называется `Property`, вычислительный вход — `Parameter`.
6. Socket type preset задаёт только имя типа, shape/color и optional default
   field. Consumer может зарегистрировать собственный renderer/type без
   изменения NodeEditor.
7. Первый Blender-подобный catalog покрывает `boolean`, `float`, `integer`,
   `vector`, `rotation`, `color`, `string`, `menu`, `object`, `collection`,
   `image`, `material`, `texture`, `geometry`, `matrix`, `shader`, `bundle`,
   `closure` и `custom`; shapes — `circle`, `square`, `diamond` и их dot-варианты.
8. Existing `NodeSystemSurface` и Card types остаются compatibility API до
   отдельной migration. Новая библиотека не маскирует Card под generic proof.
9. Dev-only component playground показывает поля standalone и те же экземпляры
   внутри Node; package не должен иметь отдельную копию field renderer.

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
   импортирует только `@nodes/layout/fixed`; этот import не проходит через
   renderer surface entrypoint.
5. `@nodes/ui/fixed-card-layout` и `@nodes/ui/adaptive-card-layout` являются
   независимыми тонкими policy adapters над общими Card measurement,
   identity/row projection и result materialization. Каждый импортирует только
   собственный public layout entrypoint и не копирует общий adapter.

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
