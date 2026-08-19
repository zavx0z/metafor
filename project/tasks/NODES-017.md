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

### NODES-017.2 — Реализовать Frame и настоящую вложенность Node

Добавить отдельные public `Frame` contract/renderer/positioned geometry.
`parentId` Node обязан ссылаться на Frame, а не на обычную Node. Frame рисует
полупрозрачную область, label и border, владеет child clipping/selection order,
но не притворяется Node с header/body/sockets. Вся child-композиция остаётся на
общем Flex.

### NODES-017.3 — Разделить Parameter и двусторонние Socket

Добавить first-class Parameter с одним universal Field и ссылками Socket через
`parameterId`. Одна Flex row поддерживает left Socket, center Field/label,
right Socket или оба endpoint одновременно. `top/bottom` удалить из component
API. Затем согласовать row rhythm, connected/disabled states, Socket
sizes/shapes и controls. Если Flex не выражает layout, расширять общий Flex.

### NODES-017.4 — Довести ортогональные Links и interaction states

Сохранить ортогональные route points и скруглённые углы, но согласовать
толщину, contrast, selected/highlight states, слой и точное присоединение к
центрам Socket. Blender Bézier не копируется.

### NODES-017.5 — Сделать Node Editor пригодным для mobile

Добавить responsive component layout, touch pan, two-pointer pinch zoom,
selection и mobile-sized hit targets без изменения scene geometry. Проверить
минимум `390×844 @3x`, portrait/landscape и отсутствие horizontal UI overflow.

### NODES-017.6 — Side-by-side playground и owner acceptance

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
6. Browser proof проходит на desktop и mobile `390×844 @3x`.
7. Владелец явно принял визуальный результат.

## Состояние

`IN_PROGRESS`, исполнитель `/root`; текущий срез NODES-017.1. Системный раздел
Accessibility открыт `ai-macos`; reference screenshot ожидает разрешения.
