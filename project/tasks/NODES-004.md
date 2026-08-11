# NODES-004 — Подсвечивать все связи под курсором

## Коротко

При наведении на связь пользователь должен видеть её целиком. Если несколько
связей проходят в одном месте, подсвечиваются все они, а не случайная последняя.

## Зачем

Текущий hit-test хранит один hovered target. На совпадающих интерактивных
коридорах порядок рисования оставляет выделенным только один semantic edge и
скрывает остальные связи под курсором.

## Решение владельца

Владелец подтвердил, что такое поведение недопустимо. Исправление принадлежит
`@nodes/ui`; layout geometry, semantic topology, Worker и Hamiltonian lifecycle
не меняются.

## Критерии готовности

1. Наведение на любой сегмент выделяет полный stroke этого semantic edge.
2. Совпадающие hit-коридоры выделяют все проходящие там semantic edges.
3. Leaf-card foreground не активирует скрытые под ним edges.
4. Результат не зависит от порядка edges во входном массиве.
5. Проверки `@nodes/ui`, typecheck и live-сценарий в открытом Hamiltonian
   проходят.

## Проверка результата

* `bun test pkg/nodes/ui pkg/ui/elements` — 85/85 PASS.
* `bun run --cwd pkg/nodes typecheck` — PASS.
* `bun run typecheck` — PASS.
* `git diff --check` — PASS.
* Focused test возвращает оба overlapping edge ID в одном порядке для прямого
  и обратного порядка входа.
* Live Hamiltonian: 14 нод, 10 edges, viewport 1920×1088 CSS px. Внутри
  compound вертикальный semantic edge при наведении расширился с 4 до 6
  device-px и после ухода вернулся к 4 device-px.

Изменение не касается `@nodes/layout`, поэтому обязательный layout benchmark
не применяется.

## Closing handoff

Result commit: `3be6c99681ffb1e4c66749a6742f0262f9a7eeaf`.

Затронуты `@nodes/ui` и технический surface primitive `@ui/elements`:
долговечный пользовательский закон принадлежит
`pkg/nodes/ui/REQUIREMENTS.md`, а accessor `UiSurface.hoveredPointer()`
документирован TypeDoc рядом с кодом. Layout, Worker и Hamiltonian topology не
изменены.

Проверяющему нужно независимо подтвердить: совпадающие коридоры возвращают все
stable edge ID; пустое тело compound не блокирует видимый edge, а leaf-card
продолжает его перекрывать; focused tests, typechecks, live hashes и pixel
evidence воспроизводимы.

## Артефакты

[`project/artifacts/NODES-004/`](../artifacts/NODES-004/README.md)
