# Правила UI

## XR-ограничения

UI делается для XR-рантайма. Код интерфейса не должен зависеть от браузерной layout-системы как от источника истины.

Обязательные правила:

* Все правила, комментарии и проектные инструкции внутри `ui` пишутся на русском языке.
* Геометрия, размеры, выравнивание и bounding box считаются собственной математикой или локальными утилитами проекта.
* Нельзя использовать браузерные layout API как источник истины: `getBBox()`, `getBoundingClientRect()`, `getComputedStyle()`, `offsetWidth`, `offsetHeight`, `clientWidth`, `clientHeight`.
* SVG обрабатывается как данные: XML, атрибуты, `path`, `transform` и bbox парсятся собственной тулзой без зависимости от DOM layout.
* Компоненты не должны требовать HTML/CSS layout для корректной работы в XR.
* Рендер выполняется строго по запросу: изменение состояния, входное событие, загрузка ассета или явный `requestRender`/invalidate.
* Постоянный render loop по умолчанию запрещён.
* Анимации допускаются только как явное поведение с жизненным циклом, условием остановки и точечной инвалидцией кадров.
* Визуальная логика должна быть детерминированной: одинаковые входные данные дают одинаковые координаты и размеры без зависимости от состояния браузерного layout.

## Архитектурные слои

UI строится как XR-рендер, а не как DOM. Слои должны оставаться разделёнными.

Обязательные правила:

* `UiRuntime` — runtime одного WebGPU canvas: renderer, resize, input routing, render-on-demand, `Space`, HUD-слой и список `UiSurface`.
* `UIDisplay` — world-space UI-дисплей в 3D-сцене с фиксированным физическим размером в mm и логической pixel-сеткой.
* `HUD` — существующий head-locked UI target перед камерой/головой. Не создавать внутри него дополнительный `UiHud`.
* `UITexture` — offscreen target для UI как текстуры/материала на 3D-поверхности; GPU render-to-texture backend развивается отдельно от semantic elements.
* `UiSurface` — локальная поверхность рисования поверх target/runtime: `drawText`, `drawRoundedRect`, `drawImage`, `measureText`, clip, hit zones, локальный rect и `requestRender`.
* HTML-like примитивы живут в `@ui/elements`: `div`, `span`, `button`, `input`, `img`, `ul`, `ol`, `li` и следующие primitives.
* MUI-like компоненты живут в `@ui/components`: `Pane`, `Button`, `TextField`, `Badge`, `List` и следующие компоненты.
* Крупные переиспользуемые поверхности живут в `@ui/panes`: `EditorPane`, `TerminalPane`, `NotiStack` и следующие panes.
* HUD/window chrome живет в `@ui/hud`: `HudWindow`, `HudWindowTitleBar`, dock/side-tab и следующие HUD-specific компоненты.
* `@ui/elements` отвечает за низкоуровневые HTML-like примитивы и общие runtime-типы. Это не дизайн-система и не слой готовых MUI-like компонентов.
* `@ui/components` отвечает за готовые переиспользуемые компоненты дизайн-системы. Он обязан собирать поведение из `@ui/elements`, а не дублировать базовые primitives.
* `@ui/panes` отвечает за stateful panes и overlay-контроллеры уровня приложения. Он может собирать UI из `@ui/elements` и `@ui/components`, но не должен зависеть от конкретного сервера, транспорта или приложения.
* Render target (`UIDisplay`, `HUD`, `UITexture`) не должен протекать в semantic API элементов и компонентов. Элементы работают с `UiSurface`, а не с конкретным способом размещения UI в XR.
* `UIDisplay`, `HUD` и `UITexture` живут в `ui/elements/targets`. Engine не должен импортировать UI target-классы; renderer принимает generic overlay/object layer.
* В `@ui/elements` не должно быть semantic элемента `Pane`. `Pane` — только компонентный surface-контейнер в `@ui/components`.
* Имена primitives в `@ui/elements` должны соответствовать реальным HTML-тегам или уже принятому системному primitive. Нельзя добавлять generic semantic alias вроде `list`, если в HTML есть точные primitives `ul`/`ol`/`li`.
* `List`, `ListItem`, `ListItemButton`, `ListItemText`, `ListItemIcon`, `ListSubheader` и аналогичные MUI-like сущности живут только в `@ui/components`. В `@ui/elements` допускаются только `ul`/`ol`/`li` как низкоуровневые primitives без component API.
* `ul`/`ol` отвечают за контейнер списка, row geometry, padding, gap и scroll-контекст на базе `div`. `li` отвечает за базовую строку, hit-state и children. `selected`, `selectedKey`, `disabled`, `dense` как компонентная плотность, иконки, secondary action, subheader и визуальные варианты списка принадлежат `@ui/components`.
* `UiSurface` не должен владеть button-семантикой: `disabled`, задержка pressed visual и click blocking принадлежат primitive `button`.
* `div` не должен принимать `disabled` и `tooltip`; это generic box/surface primitive. `disabled` принадлежит интерактивным контролам.
* Scrollbar, `overflow`, clip, wheel-scroll и drag thumb принадлежат `@ui/elements` (`div` + `scrollbar`). В `@ui/components` не должно быть standalone `Scrollbar` компонента или собственного renderer scrollbar.
* Элементы и компоненты сейчас пишутся immediate-mode функциями, а не классами. Классы допустимы для runtime/display/surface lifecycle и stateful экранов.
* Будущий декларативный DSL и CSS-подобные стили должны садиться поверх этой вертикали, не смешивая render target и semantic element.
* Предпочтительный публичный API элементов: `import {UiRuntime, UiSurface, UIDisplay, HUD, UITexture, div, span, button, input, img, ul, ol, li} from "@ui/elements"`.
* Нельзя импортировать `Pane` из `@ui/elements`: такого semantic primitive больше не существует.

## Правила компонентов

Компоненты в `ui/components` строятся поверх примитивов из `@ui/elements`.

Обязательные правила:

* Компонент должен расширять, объединять и стилизовать примитивы элементов через свой публичный API.
* Нельзя заново реализовывать локально базовое поведение, если подходящий примитив уже есть в `@ui/elements`.
* Если в `ui/components` не хватает привычного HTML/CSS-поведения, его нужно добавлять в `@ui/elements` как системную возможность, а не обходить проблему локальными костылями в компоненте.
* CSS-подобные возможности, которые переиспользуются больше одного раза, должны оформляться как стандартный API `@ui/elements`: стиль, layout-примитив, текстовое выравнивание, поведение поверхности или интерактивность.
* Общая интерактивность должна приходить из `@ui/elements`: зоны попадания, состояния указателя, фокус, подсказки и базовая поверхность контрола.
* Контрольная интерактивность вроде `disabled` должна принадлежать конкретному primitive (`button`, `input`), а не generic `div` или `UiSurface`.
* Scroll-поведение принадлежит только `@ui/elements`: состояние прокрутки, wheel-routing, drag thumb, overflow и scrollbar-геометрия должны жить в `div` или другом системном element primitive. В `ui/components` и playground нельзя заводить локальный `ScrollListState`, wrapper `Scrollbar`, собственные wheel-обработчики прокрутки или рисовать scrollbar напрямую.
* Компонентам и примерам, которым нужна прокрутка, нужно компоновать `Pane`/`div` с `overflowX`/`overflowY` и scroll-контекстом `div`, а не наследовать scroll от кастомного компонента.
* Компоненты `Button` обязаны брать за основу `button` из `@ui/elements`.
* Компонентный слой может добавлять иконки, варианты, сопоставление API и стили.
* Компонентный слой не должен обходить базовый `button` из `@ui/elements` для поверхности кнопки и интерактивности.
* Компонент `Pane` обязан брать за основу `div` из `@ui/elements`.
* Компонент `List` обязан брать за основу `ul`/`li` из `@ui/elements`; он не должен требовать primitive с именем `list` и не должен переносить MUI-like API в `@ui/elements`.
* Если компоненту или debug/editor слою нужен scrollbar renderer, он импортирует `scrollbar` напрямую из `@ui/elements`. Компонентный слой не должен реэкспортировать его как компонент.

## Правила panes

Panes в `ui/panes` — это крупные переиспользуемые UI-поверхности и контроллеры.

Обязательные правила:

* `EditorPane`, `TerminalPane`, `NotiStack` и будущие крупные поверхности импортируются только из `@ui/panes`.
* `@ui/components` не должен экспортировать panes или syntax API редактора.
* Pane API не должен зависеть от конкретного сервера, WebSocket, PTY или interpreter. Транспорт подключается внешним adapter-слоем через callbacks и методы pane.
* Повторяемая геометрия pane chrome (`header` height, header text inset, separator rule, body viewport inset, top gap, bottom inset) должна жить в общем модуле `ui/panes/pane-frame.ts`. Новые panes не должны заводить локальные magic constants для тех же отступов.
* Стандартные panes должны использовать общий `PANE_FRAME.headerHeight`, чтобы divider заголовка был на одном уровне. Исключения допустимы только для отдельного нестандартного surface с явной причиной в коде, но body/rule/scroll viewport всё равно должны выравниваться через `pane-frame`.
* HUD/window panes считаются как единая flex-раскладка: title/header slot сверху и content slot внутри окна. Если повторяется chrome/layout окна, используй или расширяй `HudWindow` из `@ui/hud` и общую геометрию из `ui/panes/pane-frame.ts`, а не заводи локальную параллельную геометрию рядом с конкретной pane.
* Содержимое окна должно получать rect из общего pane-frame/flex layout. Отдельная sibling `UiSurface` допустима только для самостоятельного окна/оверлея или для существующего low-level content surface; в этом случае parent и sibling обязаны использовать один общий rect, рассчитанный от `pane-frame`, без ручных offset-ов.
* Составное HUD/window окно регистрируется в `UiRuntime` с одним общим `windowId`. Порядок между окнами задаёт runtime через `windowOrder`/active state, внешний coarse-слой задаётся `windowZIndex`, а обычный `zIndex` используется только как локальный порядок поверхностей внутри того же окна. Нельзя давать frame и content одного окна независимые глобальные z-слои.
* Стандартное HUD/window окно должно идти через общий `HudWindow`: frame, фон, active border, title bar и content slot считаются одним путем. Локальный frame/body layout допустим только для нестандартной surface с явной причиной.
* Header/title стандартных panes должен идти через общий window path (`HudWindow`; низкоуровневый `HudWindowTitleBar` только для custom chrome), чтобы слева были minimize/actions, центрированный title/subtitle и правые actions. Локальный header допустим только для нестандартной surface с явной причиной.
* Playground для panes живёт в `ui/panes/playground` и повторяет общий scaffold: `catalog` -> `section panel` -> `preview` + `dock` -> `props`.
* Во второй левой панели panes/playground показываются возможности pane (`Wrap`, `Scroll`, `Selection`, `Actions`), а не конкретные варианты этих возможностей.
* Конкретные варианты выбранной возможности показываются в `dock`: например `Wrap` / `No wrap`, `Scroll vertical` / `Scroll horizontal` / `No vertical` / `No horizontal`.
* Если вариант меняет публичный API pane, правая `props`-панель должна показывать актуальные значения параметров, включая дефолтные значения для текущей возможности.

## Правила playground и роутов

Роуты в `ui/components/playground`, `ui/panes/playground` и `ui/elements/playground` должны быть устроены однообразно.

Обязательные правила:

* Компонентные страницы в playground должны иметь одинаковый каркас как у `Button`: `catalog` -> `section panel` -> `preview` + `dock` -> `props`.
* В playground всегда две левые панели: первая `catalog` выбирает компонент или группу, вторая `section panel` выбирает section внутри выбранного компонента или группы.
* Нельзя превращать вложенные route в плоские подписи первого каталога. Пункты вида `layout / flex` или `style / css` в первой панели запрещены.
* Для `ui/elements/playground` первая панель показывает группы `Primitives`, `Layout`, `Style`, `Events`, а вторая панель показывает разделы выбранной группы.
* Element playground должен быть каталогом primitive API: `div`, `span`, `button`, `input`, `img`, `ul`/`ol`/`li`, `layout/flex`, `layout/flex-css`, `style/css`, `style/theme`, `events`.
* В element playground не должно быть route `pane`: surface/runtime показываются как инфраструктура, а не как HTML-like элемент.
* Raw `scrollbar` не является MUI-like компонентом и не должен появляться в `ui/components/playground` как самостоятельный компонент. Демонстрация scrollbar живёт в element playground как `div/scroll`.
* `Button` в `ui/components/playground` считается каноническим шаблоном структуры для всех остальных компонентов. `Pane`, `Badge`, `TextField` и следующие компоненты должны повторять именно этот scaffold, а не приблизительно похожую локальную версию.
* Базовый route раздела показывает обзорный пример возможности, а не частный подвариант. Если у состояния есть несколько направлений или режимов, базовый route должен показывать смешанный или обобщённый пример.
* Дочерние route используются для конкретных детальных состояний: например отдельный вариант, размер, цвет, положение иконки или другой один параметр.
* Route имеет ровно два смысловых уровня внутри компонента: `component/section` и, если нужно, `component/section/detail`. Второй сегмент URL всегда означает реальный section компонента, а третий сегмент — detail внутри этого section. Нельзя класть detail прямо во второй сегмент.
* Примеры правильной структуры: `button/sizes` -> `button/sizes/small`, `pane/variants` -> `pane/variants/glass`, `editor/highlighting` -> `editor/highlighting/css`, `editor/selection` -> `editor/selection/menu`. Неправильно: `editor/css`, `editor/typescript`, `editor/copied`.
* Для single-section компонентов route должен быть семантическим, например `pane/variants` и `pane/variants/glass`, а не временным `pane/basic`.
* Переключатели в dock, secondary-nav и других route-driven контролах должны менять URL через виртуальный роутер, а не только локальный state.
* Dock отвечает за выбор вариантов активной возможности, а не за дублирование пунктов второй левой панели.
* Каждая кнопка в dock должна вести на один однозначный route. Нельзя вычислять следующий route через смешивание старого состояния и частичного patch-объекта, если кнопка визуально представляет конкретный вариант.
* Состояние pane, которое показывается в preview и props, должно вычисляться из текущего route. Активная подсветка кнопок dock и фактически включённый функционал pane обязаны совпадать с этим route.
* `props`-панель показывает текущее состояние API выбранного route; code block в ней должен использовать подсветку синтаксиса, если на странице уже есть кодовый пример.
* Структура route для одинаковых паттернов должна быть одинаковой во всех playground: сначала обзорный route, потом детальные подroute того же раздела.
* Если поведение уже принято в одном playground как системный паттерн, его нужно повторять в остальных `components` и `elements`, а не придумывать локальное исключение.
* Overview-route не должен содержать code block внизу. Code block допускается только на detail-route, где показывается конкретное состояние API.
* В `catalog` реализованный компонент не должен оставаться disabled. Disabled-состояние допустимо только для действительно не реализованных компонентов.
