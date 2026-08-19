# NODES-019 — Разделить playground Node System на каталог компонентов

## Коротко

Standalone playground Node System должен показывать один понятный раздел за
раз, как component catalog, а не складывать universal inputs, Blender reference,
полный editor и Socket catalog на один экран. Навигация разделяет редактор нод,
Socket и visual comparison. Universal inputs полностью удаляются в owner-local
playground `@ui/components`.

## Зачем

Owner-visible playground NODES-017 оказался перегруженным: четыре разные цели
проверки одновременно конкурируют за viewport, уменьшают Node scene и создают
ложное впечатление одной смешанной component category. Владелец отдельно
уточнил, что input-компоненты используются не только в Node и не должны
представляться как `Parameter` внутри Socket catalog.

## Связанные задачи и история

* NODES-016 создала component playground, NODES-017 добавила Blender reference,
  mobile path и equal-scale comparison.
* Result `aa15737e9` разложил comparison/full scene внутри одной страницы, но
  owner review отверг сам принцип одновременной свалки всех catalog regions.
* В текущем репозитории нет отдельного готового playground UI Elements или UI
  Components, который можно переиспользовать побайтно. Применяется их
  компонентная граница: один catalog section — одна ответственность.
* UI-001 создаёт `pkg/ui/components/playground` и принимает standalone input
  catalog; Node playground только импортирует production components внутри Node.
* NODES-018 параллельно переводит engine/UI на retained hierarchy в отдельном
  worktree. NODES-019 не меняет engine, `UiSurface`, `NodeCanvas`, renderer API
  или production component code; затрагивается только dev playground shell.

## Решения владельца

1. Playground имеет отдельные разделы, а не одну общую страницу.
2. Раздел Socket содержит типы, формы и состояния Socket, но не Parameters или
   input controls.
3. Text/number/boolean/enum/color/vector/rotation/matrix/reference/read-only
   удаляются из Node playground и показываются только в UI-001 владельца
   `@ui/components`.
4. `Parameter` не является названием catalog component. До отдельного изменения
   public structure playground не рекламирует внутреннюю row identity как UI
   component.
5. Система layout называется FlexBox; CSS является формой описания shell и
   responsive rules.

## Целевая информационная архитектура

* `Редактор нод` — одна полная Frame/Node/Socket/Link scene.
* `Сокеты` — только Socket type/shape catalog.
* `Сравнение с Blender` — reference и одна representative live Node в равных
  slots; full scene и catalogs сюда не примешиваются.

Навигация хранит выбранный раздел в URL hash и DOM dataset, поэтому exact
browser proof может открыть и проверить конкретный catalog route.

## Границы

* Менять только `pkg/nodes/ui/playground/**`, project files и task artifacts.
* Не править `pkg/engine`, `pkg/ui/elements`, `pkg/ui/components`, NodeCanvas,
  Blender renderers, semantic NodeTree или layout solver.
* Не брать visual corrections Socket/header/shadow/LOD/alignment NODES-017 —
  они ждут retained prerequisite NODES-018.
* Не создавать отдельные реализации universal fields или sockets для catalog.

## Критерии готовности

1. На desktop одновременно виден ровно один catalog section, кроме двух равных
   panels внутри специального comparison section.
2. Навигация полностью русская, keyboard/click доступна и отражает active hash.
3. Socket section не содержит Fields, Parameters или Node scene.
4. Node playground не содержит standalone input section; её owner — UI-001.
5. Editor section сохраняет полную Frame scene, selection и pan/zoom.
6. Comparison section показывает только maintained Blender reference и одну
   representative live Node в равных FlexBox slots.
7. Portrait/landscape не имеют horizontal overflow; выбранный section получает
   весь content viewport.
8. Focused tests, playground typecheck, exact DOM/console и четыре route
   captures проходят; existing NODES-017 playground process не присваивается
   другому worktree.

## Состояние

`IN_PROGRESS`: задача выполняется в `/Users/zavx0z/repozitarium/metafor-node-layot`
параллельно NODES-018, с dev-playground-only file boundary.
