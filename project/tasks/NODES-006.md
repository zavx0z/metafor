# NODES-006 — Выбирать кратчайший законный маршрут между равными вариантами

## Коротко

Если несколько полностью допустимых раскладок рёбер не имеют пересечений,
движок должен выбирать среди них более прямую и короткую, а не первый найденный
вариант. Длинный обход снизу не должен побеждать более короткий верхний коридор.

## Наблюдение владельца

В landscape-сцене несколько длинных зелёных рёбер проходят под всем compound,
хотя визуально доступный верхний коридор короче. Исходный снимок сохранён в
[`project/artifacts/NODES-006/`](../artifacts/NODES-006/README.md).

## Подтверждённые факты

1. Router проверяет ограниченный детерминированный набор из трёх порядков
   semantic edges.
2. Рёбра внутри одного порядка маршрутизируются последовательно, поэтому раннее
   ребро резервирует lane для последующих.
3. Первый routable порядок возвращается немедленно, если в нём нет crossings.
4. Полный comparator уже умеет после crossings сравнивать turns, Manhattan
   length, max detour, per-edge detour и clearance variance, но остальные
   порядки при этом не вычисляются.
5. Снимок сам по себе не доказывает legal clearance верхнего коридора; это
   должен доказать frozen regression fixture и полный validator.

## Решение владельца

После hard validity нулевое число crossings не завершает bounded global route
search. Все уже определённые стабильные schedules сравниваются по полному
лексикографическому порядку `@nodes/layout`; среди вариантов с одинаковыми
crossings и turns выбирается меньшая Manhattan length и detour.

## Границы

Меняются только алгоритмический закон, чистый router `@nodes/layout` и его
проверки. Placement rectangles, clearance, ports, UI, Worker, renderer,
Hamiltonian lifecycle и runtime не меняются. Не добавляются новые schedules,
не увеличивается search budget и не вводятся fixture-specific координаты.

## Критерии готовности

1. Microfixture имеет законные верхний и нижний варианты без crossings, при
   этом более короткий вариант не является первым canonical schedule.
2. Router выбирает меньшие total/max turns, затем total/max Manhattan и detour
   в действующем лексикографическом порядке.
3. Exact EAST→WEST endpoints, orthogonality, hierarchy, containment, node/edge
   clearance и semantic edge identities проходят полный validator.
4. RIGHT и DOWN повторяются битово одинаково три раза и не меняются при
   устойчивых перестановках nodes, ports и edges.
5. Существующие frozen proofs, package/root typecheck и focused/full tests
   проходят без изменения hard laws.
6. Перед `REVIEW` сохранён один final benchmark на прежнем frozen input и
   сопоставлен с последним совместимым benchmark из Git history.
7. В уже открытом browser contour отдельно проверены landscape и portrait без
   перезапуска чужого runtime.

## Артефакты

[`project/artifacts/NODES-006/`](../artifacts/NODES-006/README.md)

## Результат

Router больше не завершает bounded global search после первого schedule с
нулём crossings. Он вычисляет все три уже существовавших стабильных порядка и
выбирает результат прежним полным comparator. Microfixture доказал реальный
выбор: при одинаковых `0 crossings` и `8 turns` итоговая Manhattan length
уменьшилась с `1880` до `1760`; exact endpoints и validator сохранены в RIGHT и
DOWN, три повтора и перестановки совпадают.

Прежний 14-node frozen input сохранил bit-identical geometry: RIGHT
`b845bae5cd1f8087c943519c78a27d91c22bcf7156340bb67ea61974d2d45292`, DOWN
`cd8cfd53f36a2518886396cd7391595aeca09665c91a31def95bcfce44a89037`.
`bun test pkg/nodes` прошёл `80/80`, package и root typecheck — PASS.

В живом двухвкладочном contour свежий Worker materialized `RIGHT 15/13` и
`DOWN 15/13`. Длинный нижний U у двух нижних RTC endpoints не исчез: при exact
EAST→WEST terminal law он математически короче верхнего и поэтому является
правильным результатом нового comparator, а не дефектом first schedule.
Расхождение lifecycle двух вкладок `15/13` против `16/12` относится к отдельной
MF-424.3 и не использовалось как доказательство layout.

Final benchmark на том же frozen input: RIGHT median `216.37 ms`, DOWN median
`472.95 ms`. Относительно последнего совместимого NODES-005 это соответственно
`+10.2%` и `+10.8%`; geometry hashes и environment совпадают. Регрессия
зафиксирована для решения владельца после review и не скрыта визуальной
приёмкой.

Result commit: `2125e5614e2acb1ca169f4ec4e70e6fffc4bf6d4`.

## Closing handoff

* Граница result commit: только bounded global schedule selection
  `@nodes/layout`, его regression test, постоянные алгоритмические документы и
  evidence NODES-006. Placement, public protocol, Worker, UI, renderer и
  Hamiltonian source не менялись.
* Затронутый пакет: `@nodes/layout`.
* Постоянные владельцы: `pkg/nodes/layout/requirements/COMMON.md` владеет
  обязательным продолжением lexicographic comparison после нулевых crossings;
  `pkg/nodes/layout/requirements/RIGHT.md` уточняет выбор верхнего/нижнего
  обхода; `pkg/nodes/layout/README.md` объясняет поведение пользователю пакета.
* Public contracts: без изменений. Internal router по-прежнему использует те
  же три bounded deterministic schedules и прежний comparator.
* Долговечный вывод: ноль crossings является нижней границей только первой
  soft-координаты, а не разрешением пропустить turns/Manhattan/detour.
* Проверки: `bun test pkg/nodes` — 80/80; package/root typecheck — PASS;
  `verify-fixture.ts` — RIGHT/DOWN, x3 и permutations; live canvas artifacts —
  свежий Worker RIGHT/DOWN; `benchmark-current.json` — полный final sample set.
* Известное ограничение: benchmark стал медленнее на 10.2% RIGHT и 10.8% DOWN;
  порог regression проектом не установлен, решение об отдельной оптимизации
  остаётся владельцу после независимого review.
* Не относящееся к задаче evidence: две live-вкладки расходятся по retained
  lifecycle cardinality. Это MF-424.3 и не должно блокировать либо доказывать
  корректность layout result.
