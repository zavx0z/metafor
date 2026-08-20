# Требования @ui/elements

`@ui/elements` владеет UI primitives, FlexBox и его browser-like declarative
adapter. Этот документ задаёт обязательный layout law для всего UI репозитория.

Система вёрстки называется FlexBox: parent описывает flow и ограничения, общий
FlexBox единолично вычисляет local child slots, а child только рисует в
переданном `x/y/w/h` и не знает geometry siblings. CSS-style `%`, `fr`, `grow`
и `auto` являются привычной декларативной формой описания того же FlexBox, а не
отдельной системой layout.

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
