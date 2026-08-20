# Требования @ui/components

`@ui/components` владеет универсальными WebGPU-controls поверх `@ui/elements`.
Они не знают о Node, Socket, Link, Card, Hamiltonian или layout.

## Retained parent boundary

1. Components остаются function-based композициями Elements и не создают
   собственные классы component, `Object3D` parents либо параллельный scene
   graph. Consumer создаёт один устойчивый retained parent для самостоятельно
   изменяемого component subtree и materialize-ит вызов Component внутри него;
   все visual children, hit, wheel и clip автоматически stage-ятся под exact
   parent действующей transaction.
2. Content, available size, style и controlled interaction делают dirty только
   consumer-owned parent этого Component. Consumer повторяет его local FlexBox
   plan и атомарную materialization; соседние parents не перестраиваются.
   Keyboard/caret TextField и programmatic/smooth List/Table scroll используют
   тот же keyed render path Elements, а не отдельный Component-механизм.
3. Pure transform общего или component parent меняет только inherited
   `matrixWorld`: local plan/materialization counters, children и geometry
   identities сохраняются. Regular и compact Field, вложенные TextField,
   Checkbox и Switcher наследуют один и тот же parent transform без локального
   scale floor.
4. Component, вызванный напрямую на standalone immediate Surface, остаётся
   flat и может перестраиваться вместе с Surface. Это допустимый fallback для
   subtree без независимого transform и dirty lifecycle; missing либо
   неоднозначный render key не выбирает случайный retained owner.

## Dev playground boundary

1. Standalone Components playground является desktop consumer общего Workbench
   `@ui/playground`. Package-owned typed stories владеют metadata, concrete
   component/section/variant routes, lazy exact production imports, preview,
   source и controls; package не копирует общий shell.
2. Consumer preview владеет одним устойчивым retained root. Каждый независимо
   изменяемый controlled Field материализуется под устойчивым parent с ключом
   его `id`; изменение одного value не перестраивает shell или соседние Fields.
3. Одноразовые Button и Pane fragments могут оставаться flat внутри exact
   preview parent: у них нет отдельного transform или recurring local dirty
   lifecycle. Справа постоянно видны exact TypeScript/copy и controls/events,
   dock показывает variants; статический Info не заменяет code panel.
4. Catalog и controls пишутся по-русски; API identifiers, exact public subpaths,
   pathname routes и копируемый TypeScript не переводятся. Все действующие
   Components и universal Field kinds представлены явно; отсутствующий
   production export показывается честным status, а не ложным import.

## Универсальные поля

1. `Field` является discriminated union с устойчивым `id`, `label`, optional
   description/disabled state и точным value contract.
2. Первый набор содержит text, number, boolean, enum, color, vector, rotation,
   matrix, reference и read-only fields. Slider является presentation mode
   number field, а не отдельным типом значения.
3. `NumberField` различает integer/float, min/max/step/unit и не публикует
   нечисловое значение. `VectorField` использует 2–4 подписанных numeric axes;
   Rotation использует тот же control с отдельным semantic kind.
4. `ColorField` хранит нормализованный RGBA, `EnumField` — stable option value,
   `ReferenceField` — opaque consumer ID и display label. Компонент не загружает
   resource и не знает его domain.
5. Field renderer вызывается одинаково на обычной Surface и внутри Node
   renderer. Node package может выбирать field по socket type, но не копирует
   field implementation.
6. Controlled callbacks передают новое immutable value. Read-only и disabled
   состояния не регистрируют mutating hit target.
7. Числовая нормализация, enum selection, color conversion, vector dimensions
   и field measurement являются pure helpers с отдельными tests.
8. Вся внутренняя композиция Field и его controls выполняется только через
   существующие `@ui/elements` `flexRow`/`flexColumn`. Ручные cursor/column/row
   offsets для размещения дочерних UI-компонентов запрещены.
9. Field имеет один semantic contract и два presentation density: regular для
   обычной панели и intrinsic compact для плотных embedded surfaces. Compact
   не принимает scene/canvas scale: внешний retained parent одинаково
   преобразует Field и соседние visual children. Compact не является
   Node-specific renderer и доступен любому consumer.
10. Inline Slider является общим layout `SliderControl`, а не локальной
    имитацией внутри Node. Vector/rotation/matrix compact rows также планируются
    nested Flex.
11. Semantic `label` Field остаётся обязательным независимо от presentation.
    Compact presentation может явно скрыть visual label и отдать control всю
    строку; это универсальная возможность Field, а не специальная Node-имитация.

## Целевой состав control library

Принятая UI-010 расширяет первый набор без параллельной Node-реализации:

1. `Field` остаётся единым semantic facade с устойчивым value contract, а
   конкретные input, slider, select, color picker/ramp, curve editor,
   reference picker и collection editor становятся самостоятельными public
   Components. Монолитный renderer не является владельцем всех interactions.
2. Один и тот же public control используется standalone, внутри Field и внутри
   Node Parameter. `@nodes/ui` не копирует control, не меняет его value contract
   и не вводит Node-specific вариант.
3. Blender задаёт проверяемое поведение, состояния и compact-пропорции controls.
   Материалы, проектный шрифт и общая тема остаются MetaFor. Boolean сохраняет
   принятый `Switcher` вместо Blender checkbox.
4. Размеры, padding, row rhythm и положение частей сверяются по точному Blender
   4.5.5 reference при сопоставимом масштабе, а не подбираются по fixture.
5. Context search, external picker actions и изменение collection передаются
   immutable callbacks владельцу данных. Перестройка Socket и Node topology
   остаётся ответственностью Node consumer, а не универсального Component.

## Источник терминов

Blender используется как проверенная терминологическая и UX-основа, но код и
assets не копируются. Reference:

* <https://docs.blender.org/manual/en/latest/interface/controls/nodes/parts.html>
* <https://docs.blender.org/api/current/bpy.types.NodeSocketStandard.html>
* <https://docs.blender.org/manual/en/latest/interface/controls/buttons/fields.html>
