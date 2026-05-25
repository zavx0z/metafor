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
* HTML-like примитивы живут в `@metafor/elements`: `div`, `span`, `button`, `input`, `img`.
* MUI-like компоненты живут в `@metafor/components`: `Pane`, `Button`, `TextField`, `Badge` и следующие компоненты.
* `@metafor/elements` отвечает за низкоуровневые HTML-like примитивы и общие runtime-типы. Это не дизайн-система и не слой готовых MUI-like компонентов.
* `@metafor/components` отвечает за готовые переиспользуемые компоненты дизайн-системы. Он обязан собирать поведение из `@metafor/elements`, а не дублировать базовые primitives.
* Render target (`UIDisplay`, `HUD`, `UITexture`) не должен протекать в semantic API элементов и компонентов. Элементы работают с `UiSurface`, а не с конкретным способом размещения UI в XR.
* `UIDisplay`, `HUD` и `UITexture` живут в `ui/elements/targets`. Engine не должен импортировать UI target-классы; renderer принимает generic overlay/object layer.
* В `@metafor/elements` не должно быть semantic элемента `Pane`. `Pane` — только компонентный surface-контейнер в `@metafor/components`.
* `UiSurface` не должен владеть button-семантикой: `disabled`, задержка pressed visual и click blocking принадлежат primitive `button`.
* `div` не должен принимать `disabled` и `tooltip`; это generic box/surface primitive. `disabled` принадлежит интерактивным контролам.
* Элементы и компоненты сейчас пишутся immediate-mode функциями, а не классами. Классы допустимы для runtime/display/surface lifecycle и stateful экранов.
* Будущий декларативный DSL и CSS-подобные стили должны садиться поверх этой вертикали, не смешивая render target и semantic element.
* Предпочтительный публичный API элементов: `import {UiRuntime, UiSurface, UIDisplay, HUD, UITexture, div, span, button, input, img} from "@metafor/elements"`.
* Нельзя импортировать `Pane` из `@metafor/elements`: такого semantic primitive больше не существует.

## Правила компонентов

Компоненты в `ui/components` строятся поверх примитивов из `@metafor/elements`.

Обязательные правила:

* Компонент должен расширять, объединять и стилизовать примитивы элементов через свой публичный API.
* Нельзя заново реализовывать локально базовое поведение, если подходящий примитив уже есть в `@metafor/elements`.
* Если в `ui/components` не хватает привычного HTML/CSS-поведения, его нужно добавлять в `@metafor/elements` как системную возможность, а не обходить проблему локальными костылями в компоненте.
* CSS-подобные возможности, которые переиспользуются больше одного раза, должны оформляться как стандартный API `@metafor/elements`: стиль, layout-примитив, текстовое выравнивание, поведение поверхности или интерактивность.
* Общая интерактивность должна приходить из `@metafor/elements`: зоны попадания, состояния указателя, фокус, подсказки и базовая поверхность контрола.
* Контрольная интерактивность вроде `disabled` должна принадлежать конкретному primitive (`button`, `input`), а не generic `div` или `UiSurface`.
* Scroll-поведение принадлежит только `@metafor/elements`: состояние прокрутки, wheel-routing, drag thumb, overflow и scrollbar-геометрия должны жить в `div` или другом системном element primitive. В `ui/components` и playground нельзя заводить локальный `ScrollListState`, wrapper `Scrollbar`, собственные wheel-обработчики прокрутки или рисовать scrollbar напрямую.
* Компонентам и примерам, которым нужна прокрутка, нужно компоновать `Pane`/`div` с `overflowX`/`overflowY` и scroll-контекстом `div`, а не наследовать scroll от кастомного компонента.
* Компоненты `Button` обязаны брать за основу `button` из `@metafor/elements`.
* Компонентный слой может добавлять иконки, варианты, сопоставление API и стили.
* Компонентный слой не должен обходить базовый `button` из `@metafor/elements` для поверхности кнопки и интерактивности.
* Компонент `Pane` обязан брать за основу `div` из `@metafor/elements`.

## Правила playground и роутов

Роуты в `ui/components/playground` и `ui/elements/playground` должны быть устроены однообразно.

Обязательные правила:

* Компонентные страницы в playground должны иметь одинаковый каркас как у `Button`: `catalog` -> `section panel` -> `preview` + `dock` -> `props`.
* В playground всегда две левые панели: первая `catalog` выбирает компонент или группу, вторая `section panel` выбирает section внутри выбранного компонента или группы.
* Нельзя превращать вложенные route в плоские подписи первого каталога. Пункты вида `layout / flex` или `style / css` в первой панели запрещены.
* Для `ui/elements/playground` первая панель показывает группы `Primitives`, `Layout`, `Style`, `Events`, а вторая панель показывает разделы выбранной группы.
* Element playground должен быть каталогом primitive API: `div`, `span`, `button`, `input`, `img`, `layout/flex`, `layout/flex-css`, `style/css`, `style/theme`, `events`.
* В element playground не должно быть route `pane`: surface/runtime показываются как инфраструктура, а не как HTML-like элемент.
* `Button` в `ui/components/playground` считается каноническим шаблоном структуры для всех остальных компонентов. `Pane`, `Badge`, `TextField` и следующие компоненты должны повторять именно этот scaffold, а не приблизительно похожую локальную версию.
* Базовый route раздела показывает обзорный сценарий, а не частный подвариант. Если у состояния есть несколько направлений или режимов, базовый route должен показывать смешанный или обобщённый пример.
* Дочерние route используются для конкретных детальных состояний: например отдельный вариант, размер, цвет, положение иконки или другой один параметр.
* Route имеет ровно два смысловых уровня внутри компонента: `component/section` и, если нужно, `component/section/detail`. Второй сегмент URL всегда означает реальный section компонента, а третий сегмент — detail внутри этого section. Нельзя класть detail прямо во второй сегмент.
* Примеры правильной структуры: `button/sizes` -> `button/sizes/small`, `pane/variants` -> `pane/variants/glass`, `editor/highlighting` -> `editor/highlighting/css`, `editor/selection` -> `editor/selection/menu`. Неправильно: `editor/css`, `editor/typescript`, `editor/copied`.
* Для single-section компонентов route должен быть семантическим, например `pane/variants` и `pane/variants/glass`, а не временным `pane/basic`.
* Переключатели в dock, secondary-nav и других route-driven контролах должны менять URL через виртуальный роутер, а не только локальный state.
* Структура route для одинаковых паттернов должна быть одинаковой во всех playground: сначала обзорный route, потом детальные подroute того же раздела.
* Если поведение уже принято в одном playground как системный паттерн, его нужно повторять в остальных `components` и `elements`, а не придумывать локальное исключение.
* Overview-route не должен содержать code block внизу. Code block допускается только на detail-route, где показывается конкретное состояние API.
* В `catalog` реализованный компонент не должен оставаться disabled. Disabled-состояние допустимо только для действительно не реализованных компонентов.
