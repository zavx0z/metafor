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

### NODES-017.2 — Воспроизвести canvas, Node и Frame

Сделать Blender-подобные grid/background, компактные node body/header,
corner radii, shadow, selection, collapse affordance и translucent Frame.
Вся child-композиция остаётся на общем Flex.

### NODES-017.3 — Воспроизвести Socket rows и controls

Согласовать точный row rhythm, label alignment, input default values,
output labels, connected/disabled states, Socket sizes/shapes и UI controls.
Если Flex не выражает нужный layout, расширять общий Flex и его tests.

### NODES-017.4 — Воспроизвести Blender Links и interaction states

Рисовать Blender-подобные smooth Bézier Links, selected/highlight states и
точное присоединение к центрам Socket без ортогонального вида layout router.

### NODES-017.5 — Side-by-side playground и owner acceptance

Playground показывает одну сопоставимую Blender scene при одинаковом масштабе,
а catalog остаётся отдельной областью. Зафиксировать reference/current кадры,
console, DOM и visual matrix, затем оставить contour владельцу. Задача не
закрывается без явного принятия владельца.

## Визуальный контракт

1. Reference — локальный Blender `4.5.5 LTS`, не приблизительный mockup.
2. Сравнение выполняется при сопоставимом viewport и масштабе `100%`.
3. Отдельно проверяются canvas grid, типографика, node geometry, header/body,
   row spacing, Socket, default controls, Links, Frame, selection и collapse.
4. Socket label/control не пересекают друг друга, Node border или соседнюю row.
5. Link приходит в exact Socket center, уходит по горизонтальной tangent и
   проходит под Node body; selected Link поднимается над обычными Links.
6. Input default control показывается только в законном состоянии; output
   label выравнивается к правому Socket внутри Node.
7. Внутренняя UI-композиция строится только `flexRow`/`flexColumn`/FlexCss.
   Scene geometry Socket center и Link curve не является child layout.
8. Визуальная плотность, шрифт, контраст, radii и controls образуют один theme,
   а не набор независимых демонстрационных styles.

## Границы

* Не копировать Blender source или assets; reference задаёт поведение,
  пропорции, состояния и visual tokens.
* Не переписывать layout format и не мигрировать Hamiltonian в этой задаче.
* Не возвращать Card/HUD/NodeSystemSurface.
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
6. Владелец явно принял визуальный результат.

## Состояние

`IN_PROGRESS`, исполнитель `/root`; текущий срез NODES-017.1. Системный раздел
Accessibility открыт `ai-macos`; reference screenshot ожидает разрешения.
