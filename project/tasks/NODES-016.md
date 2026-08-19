# NODES-016 — Создать Blender-подобную node component library

## Коротко

`@nodes/ui` становится настоящей компонентной библиотекой Node Editor на
Blender-подобном словаре `NodeTree → Node → Socket → Link`. Generic editor
принимает renderer contracts и не зависит от Card. `@ui/components` получает
универсальные fields, одинаково используемые standalone и внутри нод. Отдельный
WebGPU playground показывает полный component catalog.

## История и решение владельца

* NODES-010 отделила Card presentation от semantic topology, но готовый
  `NodeSystemSurface` остался жёстко типизирован `PositionedNodeSystemCard`.
* Текущий custom-positioned proof меняет только geometry и всё ещё импортирует
  Card; node renderer/measure slots отсутствуют.
* Владелец выбрал Blender Node System как основу публичных имён и поручил
  построить компонентную библиотеку с собственным playground.
* `Visual` в renderer names признан лишним; `Fact` не является универсальным
  термином. Generic key/value row называется Property, настоящий вычислительный
  вход — Parameter.
* После начала NODES-016 владелец отдельно запретил backward compatibility и
  адаптацию к существующему верхнеуровневому коду. Card/HUD/NodeSystemSurface
  удаляются; новый layout format и consumer integration принадлежат следующему
  этапу.

## Источники Blender

* Node parts: title, sockets, properties —
  <https://docs.blender.org/manual/en/latest/interface/controls/nodes/parts.html>
* Socket API, types, shapes and state —
  <https://docs.blender.org/api/current/bpy.types.NodeSocketStandard.html>
* Generic input fields —
  <https://docs.blender.org/manual/en/latest/interface/controls/buttons/fields.html>

## Подзадачи

### NODES-016.1 — Универсальные fields

Добавить в `@ui/components` controlled text, number/slider, boolean, enum,
color, vector/rotation, matrix, reference и read-only fields с pure helpers и
tests. Ни один type/import не содержит node vocabulary.

`COMPLETE`: checkpoint `316a16e37`; 10 field kinds, shared renderer,
normalization/measurement helpers, 6 tests / 21 assertions и component
typecheck зелёные.

### NODES-016.2 — Generic Node Editor contracts

Добавить typed `Node`, `Socket`, `Link`, positioned NodeTree, renderer contracts
и generic `NodeEditorSurface`. Surface поддерживает fit/pan/zoom, selection,
containment paint order и exact routes, но не импортирует Card.

`COMPLETE`: checkpoint `91bb456d8`; generic positioned NodeTree, renderer
contracts, four-side sockets, validation, fit/pan/zoom, selection and paint
plan; 3 tests / 9 assertions и `@nodes/ui` typecheck зелёные.

### NODES-016.3 — Blender presets

Добавить standard Node renderer, Socket type/color/shape registry и Link
renderer. Node properties/default socket fields используют только
`@ui/components` fields.

### NODES-016.4 — Component playground

Добавить отдельный dev-only WebGPU playground и root script. Catalog показывает
все field kinds standalone, socket types/shapes и несколько разных Node types,
Links и container Node. Layout playground на 4015 остаётся независимым.

### NODES-016.5 — Legacy removal и доказательства

Удалить Card model/layout/surface, Card HUD и их exports/tests без aliases,
добавить настоящий non-Card bundle consumer, package-boundary regressions,
package typechecks/tests, browser DOM, console и visual evidence. Hamiltonian
и другие старые consumers не мигрируются; exact root compile gap фиксируется
как вход следующего layout/integration этапа.

## Границы

* Не мигрировать Hamiltonian или другой верхнеуровневый consumer в этой задаче.
* Не адаптировать новые компоненты к старому layout/document format.
* Не менять layout algorithms и Worker: весь их новый format принадлежит
  следующему этапу.
* Не копировать Blender source/assets; используются термины, типовые категории
  и UX-законы.
* Card/HUD/NodeSystemSurface legacy удаляется, а не deprecated/re-exported.
* Generic Surface не импортирует старый NodeSystem, HUD или product code.
* Fields принадлежат `@ui/components`; `@nodes/ui` не создаёт их копии.

## Критерии готовности

1. Non-Card consumer собирает `NodeEditorSurface` без Card symbols в bundle.
2. Renderer contracts generic по Node/Socket/Link и сохраняют exact positioned
   geometry.
3. Catalog содержит не менее 18 socket kinds, 6 shapes и 9 field kinds.
4. Каждый field kind показан standalone и хотя бы один раз внутри Node.
5. Fit/pan/zoom, selection, Link drawing и containment compositing проверены.
6. `@nodes/ui` exports и bundles не содержат Card/Fact/NodeSystemSurface symbols.
7. `@ui/components`, `@nodes/ui`, playground typechecks, package tests, browser
   console и `git diff --check` проходят; старые root consumer errors перечислены
   exact и не маскируются compatibility-кодом.
8. Component playground открыт владельцу через `ai-macos`; Hamiltonian process
   не запускается без отдельной необходимости.

## Состояние

`IN_PROGRESS`, исполнитель `/root`; текущий срез NODES-016.3.
