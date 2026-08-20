# NODES-017 — Визуально воспроизвести Blender Node Editor

## Коротко

Переделать внешний вид node component library по настоящему Blender 4.5.5 LTS,
чтобы ноды, сокеты, поля, связи, фон и frame читались как единая профессиональная
система, а не как приблизительный технический стенд.

## История и решение владельца

* NODES-016 создала независимые `NodeTree → Node → Socket → Link`, universal
  fields, Flexbox composition и component playground. Result — `7aab6269a`,
  closing — `8cacf8d37`.
* Закрывающая оценка агента была неверной: screenshot уже показывал наложения
  Socket labels, несогласованный ритм, чрезмерные controls, слабую иерархию и
  непохожую на Blender scene, но результат был ошибочно назван качественным.
* Владелец явно не принял визуальный результат и потребовал брать реальные
  Blender Nodes как reference, сравнивать и пытаться воспроизвести их один в
  один.
* После получения реального reference владелец уточнил допустимые расхождения:
  ортогональные Link routes с углами и проектный шрифт сохраняются. Обязательны
  Blender-подобная визуальная дисциплина, первый класс `Frame` для вложенности
  Node и полноценное использование на мобильном устройстве.
* Владелец уточнил technical extension относительно Blender: component Node
  имеет только стороны `left/right`, но один Parameter может владеть Socket с
  каждой стороны одновременно. `direction` endpoint не определяется стороной;
  fixed/adaptive placement остаётся законом layout.
* Владелец отдельно подтвердил Boolean presentation: `Normalize` и другие
  Boolean Field сохраняют общий `Switcher`, даже когда Blender reference
  показывает checkbox. Это project divergence, а не visual defect.
* Владелец предпочёл принятую MetaFor-форму header, скруглённую со всех четырёх
  сторон, и поручил её сохранить. Blender-подобными должны стать форма collapse
  chevron, его отступы и оптическое выравнивание с title, но не углы header.
* Владелец задал собственный selection law: Node имеет нейтральную тень со всех
  четырёх сторон; selection не рисует отдельный border, а окрашивает эту тень в
  оттенок header конкретной Node.
* Владелец уточнил терминологию layout: система называется `FlexBox`; CSS —
  только привычная декларативная форма описания её размеров и flow. `FlexCss`
  не является отдельной системой или допустимым архитектурным термином.
* Владелец потребовал разделить перегруженный playground на отдельный component
  catalog. Независимая dev-only задача
  [`NODES-019 — Разделить playground Node System на каталог компонентов`](NODES-019.md)
  выполняется параллельно retained prerequisite NODES-018. Socket section не
  содержит Parameter/input controls. Universal inputs принадлежат отдельной
  [`UI-001 — Создать playground универсальных UI Components`](UI-001.md) в
  `pkg/ui/components/playground`, а Node playground только импортирует их.
* Следующее owner-решение заморозило Node/Parameter/Field и UI Elements/
  Components до интеграции NODES-018. Принятый UI-002 result `efbad1689`
  создал общий `@ui/playground`; NODES-019 собирает Node playground как
  consumer без изменения Blender-style Node.
* Автоматические browser captures больше не имеют права фокусировать Chrome.
  UI-003 переносит node-system-dev в общий `pkg/ui` skill, добавляет dispatcher
  по образцу metafor-dev и background visual/performance profiling; прежний
  skill-author чат выполняет это независимо.
* На машине установлен Blender `4.5.5 LTS`. Создан изолированный reference
  `/tmp/blender-node-reference.blend` с Texture Coordinate, Mapping, Noise
  Texture, Color Ramp, Principled BSDF, Material Output, Links и Frame.
  Пользовательские `.blend` не изменяются.
* Visual acceptance владельца является обязательным gate. Automated tests,
  DOM, console и screenshot сами по себе больше не закрывают задачу.

## Подзадачи

### NODES-017.1 — Зафиксировать настоящий Blender reference

Получить owner-visible Blender 4.5.5 screenshot через `ai-macos`, измерить
визуальные токены и сохранить side-by-side defect matrix с текущим playground.
До этого не менять renderer на глаз.

`COMPLETE`: owner screenshot Blender 4.5.5 и rejected playground сохранены в
`project/artifacts/NODES-017`. Official Blender 4.5 source sparse checkout,
rendered Manual/API и bounded offline Manual snapshot исследованы; source
revisions, node families/inventory, UI constants, Socket types/shapes/states,
Frame laws, project divergences и defect matrix записаны в
`blender-research.md`.

### NODES-017.2 — Реализовать Frame и настоящую вложенность Node

Добавить отдельные public `Frame` contract/renderer/positioned geometry.
`parentId` Node обязан ссылаться на Frame, а не на обычную Node. Frame рисует
полупрозрачную область, label и border, владеет child clipping/selection order,
но не притворяется Node с header/body/sockets. Вся child-композиция остаётся на
общем Flex.

`COMPLETE`: public `Frame`, `PositionedFrame`, `FrameRenderer`, typed selection
и `frames[]` добавлены отдельно от Node. Nested cycles, unknown parent,
out-of-bounds descendants и Node/Frame ID collision отклоняются validation.
Paint order: Frame backgrounds → Links → Frame foregrounds → Nodes. Focused
tests 12/12, UI/playground typechecks и package-boundary 4/4 зелёные; exact
Frame canvas сохранён в artifacts.

### NODES-017.3 — Разделить Parameter и двусторонние Socket

Добавить first-class Parameter с одним universal Field и ссылками Socket через
`parameterId`. Одна Flex row поддерживает left Socket, center Field/label,
right Socket или оба endpoint одновременно. `top/bottom` удалить из component
API. Затем согласовать row rhythm, connected/disabled states, Socket
sizes/shapes и controls. Если Flex не выражает layout, расширять общий Flex.

`COMPLETE`: generic Node владеет `parameters[]`, Socket ссылается через
`parameterId`, component `SocketSide` ограничен `left/right`. Validation
разрешает разные endpoint одного Parameter с обеих сторон независимо от
`direction`, но отклоняет неизвестный Parameter и два Socket одной стороны.
Blender plan выводит Field один раз и оба centers из одной Flex row. Catalog
расширен с 6 до всех 8 source shapes (`line`, `volume-grid`). Focused tests
15/15, package-boundary 4/4, UI/playground typechecks и browser console зелёные;
exact technical canvas сохранён в artifacts. Visual density ещё не принята.

### NODES-017.4 — Воспроизвести Node и Parameter visual rhythm

Согласовать по reference единые theme tokens, canvas grid, компактный
header/body, one-unit row rhythm, labels, connected/disabled controls,
selection, collapse и shadow. Проектный шрифт сохраняется; вся child geometry
вычисляется Flex.

`COMPLETE`: universal Field получил scale-aware compact density, SliderControl
— общий inline layout. Node использует one-unit row rhythm, compact header,
category color, shadow, connected-state suppression, dot grid и aligned exact
Socket. Добавлены visible nested Frame и collapsed Node. Focused package suite
32/32, components/UI/playground typechecks, package boundary, browser console
и diff check зелёные; exact canvas сохранён в artifacts. Project font и
ортогональные routes сохранены по решению владельца.

### NODES-017.5 — Довести ортогональные Links и interaction states

Сохранить ортогональные route points и скруглённые углы, но согласовать
толщину, contrast, selected/highlight states, слой и точное присоединение к
центрам Socket. Blender Bézier не копируется.

`COMPLETE`: generic selection различает Frame/Node/Link, по готовым route
segments строятся bounded hit corridors, selected Link сортируется последним и
получает отдельные thickness/z. Frame выбирается только header-area и не
перекрывает Link hits внутри. Focused tests/package-boundary 21/21,
UI/playground typechecks, browser DOM/console зелёные; exact selected right-loop
canvas сохранён в artifacts.

### NODES-017.6 — Сделать Node Editor пригодным для mobile

Добавить responsive component layout, touch pan, two-pointer pinch zoom,
selection и mobile-sized hit targets без изменения scene geometry. Проверить
минимум `390×844` в high-DPR viewport, portrait/landscape и отсутствие
horizontal UI overflow.

`IMPLEMENTED`: общий UiRuntime получил opt-in touch capture и typed multi-touch
sequence; NodeEditor — single-touch pan и pure anchor-preserving pinch.
Responsive FlexBox с CSS-style описанием показывает только editor при width
≤720 либо height ≤500,
mobile fit/LOD сохраняют полный scene overview. Portrait `390×844` и landscape
`844×390` имеют exact `scrollWidth=innerWidth`, console 0; synthetic browser
sequence доказала pan (`x≈42,y≈340`) и pinch (`scale 0.3125→0.5529`). Chrome
service фактически применил DPR 2, несмотря на запрос 3. Android service имеет
`devices: []`, поэтому physical-device acceptance остаётся открытым gate.

### NODES-017.7 — Создать versioned skill разработки Node System

В отдельной пользовательской задаче создать
`pkg/nodes/.agents/skills/node-system-dev`: узкий skill для lifecycle component
playground, exact CDP targeting, DOM/console/canvas evidence, atomic synthetic
touch sequences, desktop/mobile viewport restore и Blender reference research.
Включить только полезные maintained references/assets, проверить scripts и
`quick_validate.py`. Skill не заменяет `$metafor-dev` для Hamiltonian и не
выдаёт emulation/screenshot за physical-device либо owner acceptance.

`COMPLETE`: отдельная пользовательская задача создала result commit
`7fd390923` и ровно шесть versioned files в
`pkg/nodes/.agents/skills/node-system-dev`: entrypoint/metadata, Blender и
browser references, ownership-safe lifecycle helper и exact-target browser
helper. `quick_validate.py`, Bash/Python syntax, focused UI/package checks,
isolated lifecycle, desktop/portrait/landscape captures и atomic pan/pinch
прошли. Независимая проверка `/root` повторно запустила skill: owned PID 61329,
exact target `1E982…`, touch и native restore зелёные. Production Node/UI не
менялись; physical-device и owner acceptance не подменены.

#### NODES-017.7.1 — Удерживать playground в long-lived PTY

Независимая следующая проверка обнаружила, что `nohup` child уничтожается
вместе с завершением Codex tool process group: target остаётся, но listener
4016 исчезает. Заменить ложный background lifecycle на foreground `serve`,
который запускается в unified long-lived PTY; `status/health/stop` продолжают
проверять точный checkout-owned PID. Повторить cross-command status, reload,
touch и viewport matrix, не называя helper persistent между отдельными задачами.

`COMPLETE`: `nohup start` удалён; foreground `serve` запускается только в
long-lived PTY, exact child PID записывается для `status/health/stop`, EXIT trap
привязан к literal PID. Изолированный port 4117 доказал cross-command ownership,
stop и чистое закрытие исходной PTY без stale state. Реальный 4016 работает в
PTY session `39297`, owned PID `64921`; reload и полный viewport matrix прошли,
native metrics восстановлены. Skill прямо запрещает обещать persistence между
отдельными Codex tasks.

### NODES-017.8 — Side-by-side playground и owner acceptance

Playground показывает одну сопоставимую Blender scene при одинаковом масштабе,
а catalog остаётся отдельной областью. Зафиксировать reference/current кадры,
console, DOM и visual matrix, затем оставить contour владельцу. Задача не
закрывается без явного принятия владельца.

`READY_FOR_OWNER`: corrected skill на `e29d374fd` поднял long-lived PTY server
PID 64921 и создал exact desktop/portrait/landscape captures в
`project/artifacts/NODES-017/final-captures`. `visual-comparison.md` содержит
per-area matrix: Canvas/Frame/Node/Parameter/Socket/Controls совпадают с
принятыми Blender constraints; project font, two-sided Parameter и rounded
orthogonal Links записаны как явные divergences/extensions. Mobile emulation
проходит без overflow и с pan/pinch, но physical Android отсутствует. Full
relevant suite: 154 tests / 1239 assertions, четыре typechecks, TypeDoc, skill
validation и diff check зелёные. Root gate неизменен: 240 cascades в прежних
8 Hamiltonian Card-consumer files. Exact target `1E982…` сфокусирован,
`visibility=visible`, `focused=true`. Owner acceptance ещё не выдан.

Live correction на текущем срезе добавила dev-only `ReferenceSurface` и
maintained owner screenshot в skill assets. Desktop playground теперь сам
показывает крупный Blender Node crop и live NodeEditor в одной Flex row; DOM
marker `comparison=blender-reference-live-editor`, console 0. Mobile сохраняет
только editor. Повторная визуальная сверка владельцем выявила, что comparison
несопоставим: reference показывает одну крупную Noise Texture, а live panel —
всю уменьшенную Frame-сцену. Такой кадр не доказывает похожесть Node. Exact
comparison capture сохранён как evidence дефекта; текущий long-lived PTY PID
68355, target сфокусирован. Owner acceptance ещё не выдан.

#### NODES-017.8.1 — Сравнить одну representative Node в одинаковом масштабе

Заменить live половину верхнего comparison на отдельный interactive NodeEditor
с Noise-подобной Node, теми же видами controls и подключённым Vector Socket,
что видны на Blender reference. Обе верхние панели получают одинаковый Flex
slot и сопоставимый видимый масштаб. Полная Frame-сцена и Socket catalog
остаются отдельными нижними Flex regions, чтобы проверка одной Node не подменяла
демонстрацию всей component system. На mobile все вспомогательные regions
скрываются и остаётся прежний полный NodeEditor.

`COMPLETE`: result commit `aa15737e9` добавил отдельную live Noise-подобную Node
в равном Flex slot рядом с reference; полная Frame-сцена и Socket catalog
остались отдельными нижними regions, а mobile по-прежнему показывает только
полный NodeEditor. Focused tests 8/8 и UI/playground typechecks зелёные.
Сопоставимый кадр впервые позволил увидеть три самостоятельных renderer-дефекта,
которые вынесены в следующий correction.

#### NODES-017.8.2 — Исправить выявленные отличия representative Node

Сопоставимый кадр NODES-017.8.1 показал, что live Texture Node получает
бирюзовый fallback header вместо Blender texture-brown; loose output Socket
`Fac`/`Color` оказываются после inputs вместо верхней части body; enum controls
`3D`/`fBM` занимают только часть строки из-за лишнего видимого label. Исправить
общий Blender renderer и universal compact Field presentation, затем повторить
кадр. `Switcher` для `Normalize` сохранить по прямому решению владельца.

`COMPLETE`: result commit `3c2a955d3` ввёл общий порядок right-side loose Socket,
Properties, Parameters, left-side loose Socket без связи side с `direction`.
Universal compact Field сохраняет semantic label, но может отдать control всю
row; `3D`/`fBM` теперь полноширинные. Texture header получил brown preset.
Focused tests 16/16, три typechecks и exact live canvas зелёные.

#### NODES-017.8.3 — Согласовать размер и положение Socket с reference

Owner-visible equal-scale кадр показал отдельный дефект Socket: live circles
меньше reference, а их вертикальные centers не совпадают с соответствующими
reference rows. После NODES-017.8.2 измерить исправленный кадр и согласовать
общую Blender Socket size/border policy. Каждый Socket center остаётся exact
результатом своей Parameter либо loose Socket Flex row и лежит на border Node,
чтобы половина shape находилась снаружи. Fixture-specific offsets запрещены.

Статус и исполнитель: `COMPLETE`, внутренний исполнитель текущей задачи.

Классификация: отдельное уже зарегистрированное visual-расхождение того же
родителя. Срез изменяет только общую Socket presentation policy; Field controls,
Node header, shadow и playground остаются за соседними срезами и владельцами.

Причина: retained scale foundation NODES-018 уже интегрирована, но Blender
renderer по-прежнему передаёт в `drawSocketShape` fixture-independent, однако
не откалиброванный literal size `8`. Border/radius policy и reference
`NODE_SOCKSIZE` не связаны regression; поэтому видимый диаметр расходится с
Blender, хотя center правильно выводится из exact Flex row.

Разрешённое изменение одного механизма: измерить maintained Blender 4.5.5
reference при сопоставимом масштабе, ввести одну общую Socket size/border policy
в production `@nodes/ui` и сохранить center на border соответствующей row.
Field, Node layout и route fixtures не подгоняются offsets.

Regression: все восемь shapes используют одну calibrated bounding policy;
left/right Parameter и loose Socket centers остаются exact row centers,
половина обычной shape находится снаружи Node border, а retained parent scale
меняет visual diameter непрерывно без screen-space floor.

Среда и приёмка: package tests/typecheck, затем exact `node-ui` target на route,
которую публикует UI-011. Blender/live сравниваются при записанном viewport и
масштабе; automated canvas не является owner acceptance.

Подготовительный commit: записывается до production patch. NODES-017.8.8 уже
завершена и больше не блокирует calibration.

Фактические действия и результат: Blender source закрепляет
`NODE_SOCKSIZE = 0.25 × widget_unit`, то есть ordinary diameter равен половине
widget unit. Commit `574de1db6` ввёл единую intrinsic policy: diameter `10`,
outline/corner `1`, stroke `2`, inner dot `3`; diamond учитывает фактический
miter, line использует полный envelope. Все восемь shapes ограничены одной
bounding policy. Flex row centers, точные left/right Node borders и независимый
`direction` не менялись.

Regression и проверки: focused Node tests `20/20` (`1133` assertions), Node
package boundary `4/4`, UI delivery `8/8`, `pkg/nodes/ui` typecheck и diff-check
прошли повторно руководителем. Restricted sandbox не использовался для
Bun.build verdict.

Live evidence: UI-011 через `$ui-dev` перезапустила exact Node selector на PID
`24430`, сохранила target `809BF08D88E4582CA819EFE847FE1450` и explicit reload
`/socket/boolean/input`. DOM ready, `19` concrete sections, `3` variants,
console `0`, native `1920×1088 @2`, backing canvas `3840×2176`. Exact capture
[`node-socket-boolean-input.png`](../artifacts/UI-011/node-socket-boolean-input.png)
имеет `619169` bytes и SHA-256
`0dc325a31a98eae001e31b11439417cc762d64e83f24103f089653e14c8c723f`.
Outer Socket около `20` physical px против примерно `19` reference px; center
не смещён, нового visual defect не обнаружено. Это automated evidence, не
owner acceptance.

#### NODES-017.8.4 — Согласовать collapse chevron и title в header

Сохранить выбранный владельцем rounded header со всеми четырьмя скруглёнными
углами. Заменить текстовый glyph `⌄`/`›` на общий геометрический chevron,
согласовать его размер, stroke, left padding и оптический vertical center с
Blender reference, а title выровнять с ним в одной Flex row. Изменение действует
для expanded и collapsed Node и не вводит fixture-specific offsets.

Статус и исполнитель: `COMPLETE`, внутренний исполнитель текущей задачи.

Классификация: следующее самостоятельное visual-расхождение того же parent.
Socket policy уже завершена; новый механизм ограничен геометрией collapse
chevron и header-row alignment.

Причина: production header рисует текстовые glyph `⌄`/`›` через Typography.
Их форма, baseline и оптический центр зависят от шрифта и не совпадают с
Blender geometric arrow; title получает соседний slot без измеренного общего
icon/padding law.

Разрешённое изменение одного механизма: заменить glyph на geometric chevron
через существующий low-level polyline primitive, зафиксировать один размер,
stroke, left padding, gap и optical center для expanded/collapsed Node. Rounded
header, body, Socket, shadow и playground не меняются.

Regression: expanded/down и collapsed/right chevron имеют одинаковый envelope
и stroke, title начинается после одного общего icon slot, обе части центрированы
в той же Flex row, per-fixture offsets отсутствуют. Project font и четыре
rounded header corner сохраняются.

Среда и приёмка: focused production tests/typecheck, затем representative Node
и collapsed Mapping на exact route UI-011.2. Automated capture не является
owner acceptance.

Подготовительный commit: записывается до production patch.

Фактические действия и результат: commit `860076720` заменил glyph одним
geometric `drawPolyline`. Общий intrinsic envelope `8×8`, depth `5`, stroke
`1.5`, left padding `8`, icon slot `12`, gap `4`; title начинается на `left+24`.
Одна miter-компенсация удерживает painted optical center expanded/down и
collapsed/right в центре header. Rounded radius `6`, body, Socket, shadow, LOD
и project font не менялись.

Source и regression: Blender 4.5 задаёт `NODE_DY = 1 × widget_unit`,
`NODE_MARGIN_X = 1.2 × widget_unit`, icon start `0.4 × unit` и title start
`1.2 × unit`. Production regression проверяет actual polyline geometry,
Typography slot, одинаковый envelope/stroke двух orientation и intrinsic scale.
Руководитель повторно получил focused `21/21` (`1179` assertions), Node
typecheck, boundary `4/4`, delivery `9/9` и clean diff.

Live evidence: UI-011 выполнила один `$ui-dev` restart, новый PID `38236`,
сохранила target `809BF08D88E4582CA819EFE847FE1450`, native `1920×1088 @2`,
backing `3840×2176`, console `0`. Expanded scene capture
[`node-editor-story.png`](../artifacts/UI-011/node-editor-story.png) — `479576`
bytes, SHA-256
`20b49ef06dc095b59cc3f3a09312cde0a1c7127ecd5ab3a9a817512256441a08`;
geometric headers/title выровнены. Та же scene содержит collapsed `Compact Mix`
на общем renderer, но exact collapsed `Mapping` fixture отсутствует и не
подменяется переименованием. Comparison capture
[`node-comparison-story.png`](../artifacts/UI-011/node-comparison-story.png) —
`1888116` bytes, SHA-256
`458e0f54f78cd75abf10c313631074f21a4730053478adb67a36fcb4a6469d54`.
Reference/live scale difference остаётся owner visual gate; automated capture
не является owner acceptance.

#### NODES-017.8.5 — Сделать четырёхстороннюю Node shadow носителем selection

Заменить смещённую вправо-вниз Node shadow на общий симметричный shadow halo со
всех четырёх сторон. В обычном состоянии halo нейтральный. При selection border
Node не меняется, а halo получает прозрачный оттенок фактического header color.
Одинаковый закон действует для expanded и collapsed Node и не зависит от fixture.

Статус и исполнитель: `IN_PROGRESS`, внутренний исполнитель текущей задачи.

Классификация: следующий visual mechanism того же parent. Общий SDF primitive
завершён UI-012.1; этот срез меняет только его Node presentation inputs.

Причина: production Node по-прежнему рисует hard shadow вторым rounded rect со
смещением `(+3,+5)`, поэтому глубина находится справа/снизу. Selection меняет
border на orange, хотя owner law назначает носителем selection только тень.

Разрешённое изменение одного механизма: заменить offset rect одним
`UiSurface.drawRoundedShadow()` exact Node rect/radius. Ordinary shadow
нейтральна; selected получает transparent actual header color. Node border
остаётся одинаковым. Общий blur/spread опирается на Blender
`shadow_width = 0.6 × widget_unit` и equal-scale capture, но не получает
fixture-specific offsets.

Regression: ordinary/selected expanded и collapsed Node используют один shadow
Mesh/policy, border не меняется, selected shadow выводится из header color,
fade симметрично расширен на четыре стороны. Retained pan/zoom сохраняет
geometry/materialization identity; отдельный Node shader/blur запрещён.

Среда и приёмка: production tests/typecheck/boundaries, затем UI-011 exact
NodeEditor/comparison captures ordinary/selected и bounded clean-target profile.
Automated capture/profile не являются owner acceptance.

Подготовительный commit: записывается до production patch; prerequisite
UI-012.1 — commit `e5d484ddc`.

#### NODES-017.8.6 — Убрать пустые Node при overview zoom

Owner-visible zoom-out показал пустые bodies: Flex продолжает правильно
вычислять все row rects, но renderer жёстко не рисует fields/labels при
`scale < 0.38`, сохраняя полную измеренную высоту Node. Заменить бинарный LOD на
progressive presentation в тех же Flex rows: полноценные controls на рабочем
масштабе, компактные row silhouettes на overview и только затем header-only на
предельном масштабе. Не создавать вторую Node model, reflow geometry или
fixture-specific размеры.

`READY`: выполнять после NODES-017.8.5. Regression должен доказать три LOD
уровня, отсутствие пустого body на overview и неизменные Socket centers/routes.

#### NODES-017.8.7 — Выровнять connected Parameter label слева

Owner-visible representative Node показала, что connected `Vector` Parameter,
у которого default Field скрыт, ошибочно центрирует label по всей строке.
Parameter label должен начинаться слева с внутренним отступом после left Socket,
как в reference. Он остаётся в той же Flex row; Socket center и скрытие
connected Field не меняются. Center alignment для такого состояния запрещён.

`READY`: выполнять после NODES-017.8.6 и проверить одновременно left-only и
двусторонний Parameter, не выводя text alignment из `direction` Socket.

#### NODES-017.8.8 — Ввести единый inherited scale для Node subtree

Повторяющаяся ошибка zoom исследована до причины. `NodeEditor` уже преобразует
Node/Socket/Link geometry общим canvas transform, но Node, Frame и universal
Field затем вручную пересчитывают visual metrics и вводят независимые floors:
Node text не меньше 6 px, Field text не меньше 7 px, Socket/stroke/radius имеют
другие minima. Поэтому parent продолжает уменьшаться, а children после порога —
нет. FlexBox slots при этом вычисляются правильно.

Закрепить один закон: scene child непрерывно наследует scale parent для visual
geometry, текста, gap, radius, stroke и Socket. Screen-space minimum разрешён
только невидимому hit target и должен быть отделён от visual metrics. Удалить
локальные visual floors, собрать общие Node scale metrics и доказать одинаковое
отношение parent/child на нескольких scales. Одновременно исключить двойное
планирование одной Node в background/foreground passes: intrinsic FlexBox plan
вычисляется один раз на render cycle и переиспользуется обоими passes.

По прямому решению владельца это не локальное правило Node system, а глобальный
закон всего UI. Владельцем становится `@ui/elements`: любой visual scale parent
непрерывно наследуется текстом, icon, padding, gap, radius, border и другими
visual children. CSS-style description является только синтаксисом FlexBox и
не создаёт второго scale path. Node system служит первым полным regression.

`COMPLETE_RESEARCH`: простые умножения scale сами по себе дёшевы; performance-риск
создают повторный viewport projection, двойной `planBlenderNode` и повторная
materialization draw operations при pan/zoom. Срез не вводит DOM/CSS transform
и не переносит scene geometry в layout. Structural regression охватывает весь
UI и запрещает новые скрытые visual floors; screen-min остаётся только у явно
названных hit-target helpers. Владелец вынес engine-level реализацию в закрытую
NODES-018; её принятый retained результат интегрирован в `main` закрытой UI-004
и является текущим основанием NODES-017.

#### NODES-017.8.9 — Закрепить имя FlexBox и CSS-style description

Удалить из node/project документации `FlexCss` как имя системы. Единственная
система layout называется `FlexBox`; low-level numeric и CSS-style `%`/`fr`/
`grow` entrypoints являются двумя формами описания одного FlexBox. Технические
имена `flexRowCss`/`flexColumnCss` могут оставаться именами adapter-функций, но
не образуют отдельный public concept.

`MOVED`: глобальная FlexBox/CSS-style терминология входит в NODES-018 вместе с
engine/UI contract, а не исправляется локально в Node renderer.

## Визуальный контракт

1. Reference — локальный Blender `4.5.5 LTS`, не приблизительный mockup.
2. Сравнение выполняется при сопоставимом viewport и масштабе `100%`.
3. Отдельно проверяются canvas grid, node geometry, header/body,
   row spacing, Socket, default controls, Links, Frame, selection и collapse.
4. Socket label/control не пересекают друг друга, Node border или соседнюю row.
5. Ортогональный Link приходит в exact Socket center и проходит под Node body;
   selected Link поднимается над обычными Links.
6. Input default control показывается только в законном состоянии; output
   label выравнивается к правому Socket внутри Node.
7. Внутренняя UI-композиция строится только FlexBox; CSS-style размеры являются
   формой его описания, а не отдельной системой.
   Scene geometry Socket center и Link curve не является child layout.
8. Визуальная плотность, шрифт, контраст, radii и controls образуют один theme,
   а не набор независимых демонстрационных styles.
9. Проектный шрифт является осознанным identity и не заменяется Blender font.
10. `Frame` является отдельным component kind и единственным visual owner
    вложенности Node.
11. Mobile viewport использует тот же component API и Flex composition, а не
    отдельную урезанную Node implementation.
12. Parameter рисуется один раз; его left/right Socket не копируют Field и не
    меняют identity Parameter.

## Границы

* Не копировать Blender source или assets; reference задаёт поведение,
  пропорции, состояния и visual tokens.
* Не переписывать layout format и не мигрировать Hamiltonian в этой задаче.
* Не возвращать Card/HUD/NodeSystemSurface.
* Не выводить `direction` Socket из `left/right` и не переносить layout policy
  внутрь renderer.
* Не закрывать задачу по automated screenshot без визуального сравнения и
  owner acceptance.

## Критерии готовности

1. Сохранены reference, before, after и side-by-side изображения с описанной
   одинаковой областью и масштабом.
2. Defect matrix не содержит unresolved overlap, detached endpoint, broken
   hierarchy или несогласованный control style.
3. Structural Flex regressions и component tests проходят.
4. Browser DOM/console и package typechecks проходят.
5. Playground оставлен владельцу на 4016 в exact CDP target.
6. Browser proof проходит на desktop и mobile `390×844` high-DPR viewport.
7. Physical mobile proof проходит при доступном устройстве либо остаётся явно
   незакрытым owner gate.
8. Владелец явно принял визуальный результат.

## Состояние

`IN_PROGRESS`: row order, texture header и полноширинные enums исправлены;
retained Engine/UI/Node foundation, public Node catalog и owner-local Components
playground интегрированы в main. NODES-017 возвращается к
Socket/header/shadow/LOD/alignment corrections уже без старого flat path.
NODES-017.8.4 сохраняет rounded header, но исправляет collapse chevron и title
alignment. NODES-017.8.5 переносит selection с border на четырёхстороннюю тень
в оттенке header. NODES-017.8.6 устраняет пустые Node при zoom-out без отказа от
Flex rows. NODES-017.8.7 выравнивает connected Parameter label слева. Physical
proof по-прежнему ждёт Android device (`@meta/android devices: []`).
