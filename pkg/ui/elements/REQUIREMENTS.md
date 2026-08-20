# Требования @ui/elements

`@ui/elements` владеет UI primitives, FlexBox и его browser-like declarative
adapter. Этот документ задаёт обязательный layout law для всего UI репозитория.

Система вёрстки называется FlexBox: parent описывает flow и ограничения, общий
FlexBox единолично вычисляет local child slots, а child только рисует в
переданном `x/y/w/h` и не знает geometry siblings. CSS-style `%`, `fr`, `grow`
и `auto` являются привычной декларативной формой описания того же FlexBox, а не
отдельной системой layout.

## Глобальная визуальная форма

1. Blender 4.5.5 LTS является обязательным reference для состава, формы,
   плотности, группировки и положения visible UI всего проекта: Elements,
   Components, Fields, dev Workbench и Node consumers. Это не ограничивается
   Node Editor и не является свободной стилизацией по терминологии Blender.
2. Blender 4.5.5 LTS задаёт также base UI palette и material states: canvas,
   panels, inputs, borders, text, hover, active, selected и disabled. Project
   font сохраняется MetaFor. Type/Socket/status colors получают явное
   Blender-role mapping там, где такой role существует; старую MetaFor palette
   нельзя использовать как неявный fallback после migration.
3. Visible controls по умолчанию компактные прямоугольные low-radius элементы,
   собранные в плотные rows/groups с тонкими borders/separators. Pill silhouette,
   oversized rounded card и большие пустые интервалы запрещены, если exact
   Blender reference не показывает такую форму.
4. Screen-space hit target может быть больше visible geometry, но не увеличивает
   control radius, row height, gap, icon или text. Accessibility не является
   основанием менять видимую Blender-пропорцию.
5. Control height/radius/gap/border, row rhythm, panel/header metrics и
   separators имеют одного shared Elements owner. Components и Workbench не
   вводят собственные несовместимые regular/compact shape tokens.
6. Заранее разрешены ровно два project divergence: project font и
   ортогональная route geometry Links. Switcher, округлённая Node header и иные
   прежние отличия автоматически не сохраняются. Link thickness/colors,
   hover/selected/invalid, socket attachment и interaction следуют Blender.
7. Каждый visual migration slice сравнивается side-by-side с exact local
   Blender catalog/reference при сопоставимом масштабе. Unit tests и isolated
   PNG не заменяют это сравнение или owner acceptance.
8. `select` принадлежит Elements: primitive владеет dense chrome, выбранной
   либо placeholder-подписью, chevron, visual states и caller hit geometry.
   Components-владелец enum задаёт options/value/cycle semantics, но не рисует
   выбор значения через Button и не повторяет его shape policy.
9. Public Elements vocabulary следует простейшим HTML-аналогам: `div`, `span`,
   `button`, `input`, `select`, `popover`, `img`, `ul/li` и layout primitives.
   `IconButton`, `ControlGroup`, `ColorInput`, picker popup composition и другие составные controls не
   публикуются как Elements; они принадлежат `@ui/components`.
10. `popover` владеет только generic disclosure lifecycle: controlled либо
    uncontrolled open, stable key, одна active root chain на `UiRuntime`,
    outside/Escape dismissal и viewport-bounded bottom-to-top placement.
    Trigger/content рисуются caller-ом из обычных Elements; Component semantics
    в `popover` запрещены. Detached Surface остаётся отдельным safe scope.
11. Low-level `UiSurface`/Engine drawing capability может иметь не-HTML имя,
    когда реализует analytical shader, clip, shadow либо marker. Такая функция
    не становится semantic Element или самостоятельным public control:
    Component использует её только как rendering primitive внутри композиции
    Elements.
12. Blender theme owner хранит raw RGBA и roundness отдельно для widget classes
    `regular`, `text`, `number`, `numberSlider`, `option`, `toggle`, `tool`,
    `toolbarItem`, `tab`, `menu`, `menuBack`, `menuItem`, `box`, `listItem`,
    `scroll`, а также namespaces `state` и `spaceNode`.
    Alpha source fields сохраняется; классы нельзя схлопнуть в один flat
    `bgInput/bgHot/cyan` state law.
13. Pure `resolveWidgetColors(kind, state)` повторяет class-specific Blender
    transitions. Generic hover использует Blender HSL transform, menu rows и
    numeric zones — свои algorithms, generic disabled/search-no-match — свои
    alpha factors. Compatibility palette aliases допустимы только после
    resolver и не становятся владельцем поведения.
14. Material owner отдельно хранит widget emboss, menu shadow, editor
    border/outline, checker colors/size и class roundness. Standard radius
    вычисляется из `.2 × widget unit/actual rect`; scroll/panel/popup не получают
    тот же radius без собственного source law.
15. Resolver precedence детерминирован и повторяет source order. Generic class
    сначала получает list-item override и alpha, затем selected/pressed либо
    active-default/hover; menu item использует собственную mutually-exclusive
    chain. Numeric zone является отдельным secondary draw result поверх base.
    Raw и resolved tuples/namespaces deep-frozen; HSL/alpha math проверяется
    exact byte/clamp tests.

## Retained UI-закон

1. FlexBox заново планирует local child slots только при dirty-изменении
   content, доступного size или style соответствующего component subtree.
2. Изменённый subtree материализуется в локальных координатах под retained
   engine `Object3D` parent. Параллельный UI scene graph и ручное повторение
   parent scale/translation в каждом visual child запрещены.
3. Pan, zoom и другое transform-only изменение чистого parent обновляют его
   transform и inherited `matrixWorld` children без нового FlexBox plan и без
   materialization неизменённого subtree.
4. Любой visual child, включая text, icon, Socket, stroke, border, radius,
   padding и gap, непрерывно наследует transform parent. Screen-space minimum
   разрешён только отдельному невидимому hit target и не меняет visual child.
5. `UiSurface` владеет retained component parent как точным engine `Object3D`:
   parent может быть вложен только в другой принадлежащий Surface retained
   parent, а drawing primitives материализуются в выбранном parent в локальных
   координатах. Dirty-rematerialization сначала целиком строит новый subtree и
   только затем атомарно заменяет прежних children; ошибка построения оставляет
   действующий subtree без изменений.
6. Transform-only presentation сохраняет identity parent, children и geometry.
   Remove, повторная materialization и `dispose()` рекурсивно отсоединяют весь
   принадлежащий subtree и освобождают каждую некэшированную geometry ровно один
   раз. Разделяемая geometry `CachedText` остаётся в renderer cache до
   действующего LRU-вытеснения.
7. Retained hit и local clip evidence принадлежат точному retained parent и
   staging lifecycle его materialization: успешная materialization атомарно
   заменяет subtree и records, ошибка сохраняет оба прежних, а remove/dispose
   не оставляют hover, press, tooltip, wheel либо material clip старого target.
   Обычные public `hit()` и `wheel()`, вызванные component-ом внутри retained
   materialization, автоматически становятся records exact parent; component
   не выбирает отдельный input API. Его hovered pointer возвращается в local
   coordinates того же parent. Hover/press/wheel transition и отложенный
   keyed visual render сообщают Surface-subclass тот же exact parent, чтобы
   изменить только его interaction presentation.
8. Surface point/rect переводится в retained local space и обратно только через
   actual `matrixWorld`/inverse chain тех же engine parents. Hit testing
   уважает ancestor visibility и фактический порядок `Object3D.children`.
   Screen-space minimum остаётся отдельной невидимой hit policy.
9. Fixed viewport clip принадлежит Surface или её retained clip-owner и
   пересекается с matrix-projected local clip material-а. Move, resize и
   transform-only frame обновляют framebuffer clip и visibility без нового
   FlexBox plan либо materialization.
10. Function-based Elements не создают component tree. Вызов внутри
    materialization автоматически stage-ит visual children, hit, wheel и
    clip под exact engine parent текущей transaction. Тот же вызов на
    standalone Surface остаётся плоским immediate content и может
    перестраиваться целиком.
11. Element с delayed либо programmatic state регистрирует устойчивый
    render key в той же retained transaction. Успешная materialization
    атомарно заменяет subtree, input records, набор keys и функцию
    его локальной materialization. Поздний keyboard/caret либо
    smooth/programmatic scroll по однозначному key повторяет
    materialization только exact owner; siblings и их geometry сохраняют
    identity. Отсутствующий или неоднозначный key не выбирает
    случайного owner и сохраняет full-Surface fallback.
12. Pure FlexBox/style helpers, screen-space tooltip overlay и статические
    decorative helpers остаются flat: у них нет собственного
    transform, dirty lifecycle или пользы от partial rematerialization.

## Dev playground boundary

1. Standalone Elements playground является desktop consumer общего Workbench
   `@ui/playground`. Package-owned typed stories владеют metadata, concrete
   component/section/variant routes, lazy exact public imports, preview, source
   и controls; package не копирует общий shell и не передаёт ему Elements
   vocabulary.
2. Catalog явно разделяет primitives, layout, style и events. Вторая панель
   выбирает реальные sections одного Element, dock — его variants, а справа
   постоянно видны exact TypeScript/copy и controls/events. Статический Info и
   aggregate inventory не заменяют detail story.
3. Consumer preview владеет одним устойчивым retained parent. Выбранная story,
   её args, production rendering и копируемый TypeScript являются одним
   состоянием; изменение args не перестраивает Workbench shell.
4. Видимые catalog, sections, variants и controls пишутся по-русски; public API
   identifiers, exact subpaths, pathname routes и TypeScript не переводятся.
   Исторические public playground paths нормализуются в действующие detail
   routes, а не открывают параллельный старый interface.

## Мягкая rounded shadow

1. `UiSurface` предоставляет один low-level rounded shadow primitive поверх
   Engine SDF material. Он принимает local rect/radius, blur, spread, color,
   opacity и z, но не знает Node, selection либо Component vocabulary.
2. Shadow рисуется одним quad/draw без texture blur, offscreen pass и набора
   отдельных полос. Его fade одинаково окружает все четыре стороны и углы.
3. В retained materialization shadow становится обычным visual child exact
   parent. Transform-only изменение наследуется через `matrixWorld` без новой
   materialization; screen-space blur floor запрещён.

## Обязательный Flex-закон

1. Любая композиция двух и более дочерних UI slots строится только через
   `flexRow`, `flexColumn`, `flexRowCss` или `flexColumnCss`.
2. Прикладному UI запрещено заменять недостающую возможность Flex ручными
   cursor loops, вычислением column/row offsets, процентной арифметикой rects
   или fixture-specific координатами.
3. Если действующий Flex не выражает нужную композицию, сначала расширяется его
   общий API и pure layout implementation, затем добавляются unit tests и
   документация, и только после этого возможность используется component-ом.
4. Flex extension обязана оставаться deterministic pure math без renderer,
   domain и component vocabulary.
5. Низкоуровневые primitive drawing operations могут получать точные x/y/w/h
   после Flex callback. Ручные coordinates также допустимы для внешней scene
   geometry: positioned Nodes, exact Socket centers, Link routes, mesh vertices.
   Эти данные не являются UI child-layout.
6. Surface-to-display placement также планируется единым FlexBox flow;
   responsive constraints задаются его CSS-style declarative form, если
   одновременно размещается несколько UI surfaces.
7. Structural tests каждой новой UI-системы доказывают использование Flex на
   уровне page/region, component и вложенных controls.
8. Surface, которая осознанно владеет touch canvas, объявляет
   `capturesTouchNavigation()`. Только такая Surface перехватывает single-touch
   у virtual display; остальные сохраняют общий display navigation.
9. Multi-touch передаётся Surface одной typed последовательностью
   `start/move/end`, а не несколькими несвязанными mouse emulation events.

## Выбор primitive

* `flexRow`/`flexColumn` — pixel-precise controls и заранее измеренные slots.
* `flexRowCss`/`flexColumnCss` — responsive regions, `%`, `fr`, `grow`, `auto`.
* Nested composition выражается nested Flex callbacks, а не вычислением offsets
  между соседними children.

Подробная форма browser-like API находится в [`docs/flex-css.md`](docs/flex-css.md).
