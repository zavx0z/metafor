# NODES-003 — Раскладывать несколько вкладок без потери сцены

## Коротко

Когда несколько вкладок одного Chrome используют общий Service Worker, все их
карточки и связи должны получать законные координаты. Ошибка раскладки не должна
оставлять на экране старую сцену без новой вкладки.

## Зачем

Двухвкладочный Hamiltonian document доходит до layout, но pure engine завершает
вычисление ошибкой `NO_LEGAL_LAYOUT`. Presentation поэтому сохраняет последнюю
успешную geometry и визуально скрывает уже существующую вторую страницу.

## Связь с дорожной картой

Дефект обнаружен в `MF-424.3`, но принадлежит общему пакету `@nodes/layout` и
полезен независимо от Hamiltonian. Симметричная lifecycle-сходимость вкладок
остаётся отдельной частью `MF-424.3` и этой задачей не исправляется.

## Подтверждённые факты

* В документе находятся две разные page realm одного Chrome, их Window children,
  общий Service Worker и по одной паре Controller/MessagePort на страницу.
* На viewport `722 × 1088` engine генерирует `46` placement candidates.
* Исходный bounded search проверял `32/46` и не находил legal route graph.
* Полный диагностический проход проверил `46/46`: до исправления routable
  placements не было. Следовательно, поисковый бюджет и выбор fallback не были
  причиной.
* Placement сначала вычислял занятый межрядный corridor по числу проходящих
  связей, но следующий compaction-pass заменял этот отступ обычным `nodeSpacing`.
  Это уничтожало lanes для fan-out общего IPC socket и пар
  Page↔Service Worker.
* Исправленный compaction повторно применяет вычисленный corridor только между
  соседними рядами, которые действительно пересекают semantic edges. На exact
  frozen input routable `4/46` placements; hard laws и clearance `28 px`
  сохранены.

## Границы

* Не скрывать semantic edges и не менять exact parameter sockets.
* Не ослаблять clearance, containment или разрешённые стороны compound gateway.
* Не добавлять ручные coordinates, lanes, bends или fixture-specific offsets.
* Не исправлять lifecycle/BroadcastChannel convergence и не менять renderer.
* Незакоммиченный fallback-эксперимент не является решением и оценивается только
  как опровергнутая диагностическая гипотеза.

## Критерии готовности

* Exact numeric fixture сохранён вместе с SHA-256 и исходным provenance.
* Все 46 generated placements классифицированы machine-readable evidence.
* Причина отнесена к search budget, candidate generation, router или
  несовместимому входному договору без предположений.
* Исправление, если оно требуется, сохраняет общие hard laws, детерминизм и
  permutation stability; соответствующие RIGHT/DOWN сценарии проверены.
* Перед `REVIEW` выполнен final benchmark по правилам `@nodes/layout`.

## Проверка результата

* Frozen input: SHA-256
  `27c0155999cec911e1479a3418f0b462c1d03a74f65da2fa36b19155b14be78d`.
* `RIGHT 1088×722`: geometry SHA-256
  `e44d8456ab393df43db3a0b6ea6619cedd6aaf91e28ef0c4868d7e10f600dd29`.
* `DOWN 722×1088`: geometry SHA-256
  `0341cfbdf1e032e9d89951c9efecd85b8dabdb2ae468de16bb6f1add3d9f0eed`.
* В обоих режимах совпадают три повтора и три устойчивые перестановки входных
  массивов; сохранены `14` нод, `20` портов и `12` рёбер.
* Final benchmark на том же frozen input, Bun `1.3.14`, Intel x64, по `10`
  samples после двух warmups: `RIGHT` min/median/max
  `150.59/179.80/222.92 ms`; `DOWN` — `368.79/403.38/509.55 ms`.
  Это новый двухвкладочный baseline; прежние одно-вкладочные inputs не являются
  прямой базой сравнения.
* Отдельная lifecycle/BroadcastChannel сходимость двух вкладок остаётся в
  `MF-424.3`; layout-доказательство её не подменяет.

## Артефакты

Диагностика и frozen fixture находятся в
[`project/artifacts/NODES-003`](../artifacts/NODES-003/README.md).
Machine-readable benchmark: [`benchmark-current.json`](../artifacts/NODES-003/benchmark-current.json).
