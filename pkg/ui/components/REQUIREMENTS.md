# Требования @ui/components

`@ui/components` владеет универсальными WebGPU-controls поверх `@ui/elements`.
Они не знают о Node, Socket, Link, Card, Hamiltonian или layout.

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
   обычной панели и scale-aware compact для плотных embedded surfaces. Compact
   не является Node-specific renderer и доступен любому consumer.
10. Inline Slider является общим layout `SliderControl`, а не локальной
    имитацией внутри Node. Vector/rotation/matrix compact rows также планируются
    nested Flex.

## Источник терминов

Blender используется как проверенная терминологическая и UX-основа, но код и
assets не копируются. Reference:

* <https://docs.blender.org/manual/en/latest/interface/controls/nodes/parts.html>
* <https://docs.blender.org/api/current/bpy.types.NodeSocketStandard.html>
* <https://docs.blender.org/manual/en/latest/interface/controls/buttons/fields.html>
