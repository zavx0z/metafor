# NODES-005 — Артефакты

## Исходные наблюдения

Три снимка владельца показывают один дефект на разных участках сцены:
связанные зелёные semantic edges строятся отдельными U-маршрутами возле уже
существующего совместимого trunk. Ожидается один общий generated trunk с
отдельными exact terminal stubs и без объединения semantic IDs.

* `stacked-targets-u-loop.png` — 468×572 px, SHA-256
  `02114c00013ccd322d21ad7f0d8cf6d83dbe6d89f714b05f4cf776595784132c`;
* `avoidable-u-junction.png` — 308×134 px, SHA-256
  `87b8bf94116bae592097ca8ad04b0e9e0cb9f04fe9c507bb729e99d02c65045d`;
* `branch-junction.png` — 156×92 px, SHA-256
  `cbd15c39cf85cedfd753464b699ba6ee60bbc60334baa528875f63a18ff90961`;
* `different-port-overlap-landscape.png` — 422×602 px, SHA-256
  `84fbc5bb853c5620adeb22ba4d9074cbef93e543fa6f11baa5fd6bcfce6c6c69`:
  landscape-регрессия, где рёбра `IPC` и `Web Push` разных exact sockets одной
  карточки ошибочно совпали на общем вертикальном track. Этот снимок уточняет
  границу bundle: общая нода без общего exact port не разрешает overlap.

## Воспроизводимый offline proof

* frozen fixture `two-tab-layout-portrait.json` — SHA-256
  `27c0155999cec911e1479a3418f0b462c1d03a74f65da2fa36b19155b14be78d`;
* `bun verify-fixture.ts` — RIGHT и DOWN, по три повтора и три стабильные
  перестановки входных массивов, exact endpoints и полный validator;
* RIGHT geometry SHA-256
  `b845bae5cd1f8087c943519c78a27d91c22bcf7156340bb67ea61974d2d45292`;
* DOWN geometry SHA-256
  `cd8cfd53f36a2518886396cd7391595aeca09665c91a31def95bcfce44a89037`;
* microfixtures отдельно доказывают общий trunk для одного exact source socket
  и полный horizontal/vertical clearance для разных sockets одной ноды;
* `bun test pkg/nodes` — 79/79; package и root `typecheck`, а также
  `git diff --check` — PASS.

Полные входы, sections и machine-readable результаты находятся в
`two-tab-layout-portrait.json`, `verify-fixture.ts` и `verification.json`.

## Live proof

Host работает из canonical checkout. До принятия результата проверялся exact
served Worker: stale bundle имел SHA-256
`7ffe58c56f989d5c3eaf4e3da788ba5c86a0feec51b60313ddbf51703c2a2b6f` и
содержал ошибочное сравнение по `nodeId`. После штатного source-watch update
served `/layout-worker.js` получил SHA-256
`0818d162f05df6fec7a6442d63ed1ef1b45596f152ebcc0313b45f556c09e4ba` и exact
predicate `sourcePortId/targetPortId`; обе уже открытые вкладки автоматически
получили новый Worker.

* `live-landscape-final.png` — 3840×2176 px, SHA-256
  `2a6fbf17f06e2e3b77fd812e945be2daf9ea3267d4708cca7558f8eca89f3d9e`.
  CSS viewport 1920×1088, RIGHT, Worker `ready`, 12 нод, 8 edges, bounds
  2116.85×1426. IPC fanout использует общий exact-port trunk, а `Web Push`
  остаётся на отдельной lane без общего segment;
* `live-portrait-final.png` — 1444×2176 px, SHA-256
  `cea67ff3811484c41f8dd48a13f4d3f10691d1279ca46e6956552004d6fe0eda`.
  CSS viewport 722×1088, DOWN, Worker `ready`, 15 нод, 13 edges, bounds
  1846.25×2842.

## Финальный benchmark

`benchmark.ts` выполняет два warmup и десять samples на том же frozen input.
Environment: Bun 1.3.14, macOS 22.6.0 x64, Intel Core i7-7820HQ. Layout source
SHA-256: `db4ebffe2b943630743110e9903096d96e9809ced1aa02c85b454440dd45059a`.

| Режим | NODES-005 median | Последний NODES-003 median | Изменение |
|---|---:|---:|---:|
| RIGHT | 196.41 ms | 179.80 ms | +9.2% |
| DOWN | 426.99 ms | 403.38 ms | +5.9% |

Функциональные hard laws проходят, но benchmark-регрессия зафиксирована для
решения после независимого review; она не скрыта под визуальной приёмкой.

Result commit: `611283e776ac350764cf392603913bbc91b4185f`.
