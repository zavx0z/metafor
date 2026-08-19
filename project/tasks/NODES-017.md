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
Responsive FlexCss показывает только editor при width ≤720 либо height ≤500,
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
7. Внутренняя UI-композиция строится только `flexRow`/`flexColumn`/FlexCss.
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

`IN_PROGRESS`, исполнитель `/root`; physical mobile gate открыт; текущий срез
NODES-017.8 — side-by-side и owner acceptance.
