# NODES-006 — Артефакты

## `lower-route-when-upper-shorter-landscape.png`

* Источник: снимок экрана, переданный владельцем в текущей сессии.
* Дата: 11 августа 2026 года.
* Версия проекта: canonical `main`, исходный HEAD
  `535bc6db7d075662c5b73a8599120bc4aea87f76`.
* Ожидание: при одинаковой hard validity и отсутствии crossings router выбирает
  более короткий коридор по полному лексикографическому порядку.
* Фактическое наблюдение: длинные зелёные рёбра огибают compound снизу; верхний
  путь визуально короче, но его полную допустимость снимок не доказывает.
* Размер: 1738×1212 px.
* Чувствительные сведения: отсутствуют.
* Внешний оригинал: `/Users/zavx0z/Desktop/Снимок экрана 2026-08-11 в 20.15.10.png`.
* SHA-256: `6604c1988be5d28a4f1332f63044fb231d2d5433126f998bd53e38ee1f8e0488`.

## Manifest первой итерации

* Defect: первый schedule с `crossings=0` завершает bounded search до сравнения
  turns/Manhattan/detour.
* Hypothesis: удаление только этого early return позволяет существующему
  comparator выбрать лучший из тех же трёх стабильных schedules.
* Hard laws: без изменений; exact sockets, EAST→WEST, containment, hierarchy,
  orthogonality и полный clearance обязательны.
* Budget: один алгоритмический patch и один regression fixture до полного
  offline gate; runtime не трогается.

## Frozen compound proof

* `two-tab-layout-portrait.json` — прежний принятый 15-node Hamiltonian input,
  сохранённый без изменений; SHA-256
  `27c0155999cec911e1479a3418f0b462c1d03a74f65da2fa36b19155b14be78d`.
* `verify-fixture.ts` проверяет RIGHT/DOWN, три повтора, две устойчивые
  перестановки массивов, cardinality и geometry hashes.
* `benchmark.ts` запускается один раз перед `REVIEW` и сохраняет полный набор
  samples в `benchmark-current.json`.

`verification.json` подтверждает:

| Режим | Повторы | Перестановки | Geometry SHA-256 |
|---|---:|---:|---|
| RIGHT | 3 | 3 | `b845bae5cd1f8087c943519c78a27d91c22bcf7156340bb67ea61974d2d45292` |
| DOWN | 3 | 3 | `cd8cfd53f36a2518886396cd7391595aeca09665c91a31def95bcfce44a89037` |

## Live proof

Hamiltonian был запущен из canonical checkout штатной командой package после
полного offline proof; MetaFor contour 4000–4005 не затрагивался. Source-watch
собрал свежий layout Worker, а открытые CDP targets использовали exact
`targetId`.

* `live-landscape-final.png` — первоначальный 11-node RIGHT graph, 3840×2176,
  SHA-256 `d07040c57636c88897b3c3bcfee7d64e3b2c081a4a1f0bae89762507258d3a37`;
  Worker `ready`, generation `297`, 11 нод, 8 edges, bounds 2245.9×1092.
* `live-landscape-two-tab-final.png` — двухвкладочный RIGHT graph, 3840×2002,
  SHA-256 `f65a7608ab4dddfaa0c18ae6279edc95fddea33ec91a3b14daaf5eb2e394e07e`;
  Worker `ready`, 15 нод, 13 edges, bounds 2613.5×1898. Длинный нижний U
  соединяет нижние RTC endpoints и при обязательных EAST→WEST stubs короче
  верхнего обхода; он не является ложным выбором первого schedule.
* `live-portrait-two-tab-final.png` — тот же target в DOWN, 1444×2176,
  SHA-256 `b950a8d36126f9c3658e887ad074ad0f41ba8449e157f4aa20d60b583feaf4d5`;
  Worker `ready`, generation `11`, 15 нод, 13 edges, bounds 1192×4460.
* `live-portrait-final.png` — первоначальный 11-node DOWN graph, 1444×2176,
  SHA-256 `8b23d9f319bc8c605f49d509a5b0afe5b05e262e5f3b9bb9f0ac1cc6f7e675dd`.

Обе вкладки materialized разные retained lifecycle snapshots (`15/13` и
`16/12`). Это отдельная MF-424.3 синхронизация, поэтому ни одна из них не
выдаётся за доказательство взаимной сходимости вкладок.

## Финальный benchmark

`benchmark-current.json` содержит два warmup и десять samples на неизменённом
frozen input. Environment совпадает с NODES-005: Bun 1.3.14, macOS 22.6.0 x64,
Intel Core i7-7820HQ; input hashes и geometry hashes одинаковы.

| Режим | NODES-006 median | NODES-005 median | Изменение |
|---|---:|---:|---:|
| RIGHT | 216.37 ms | 196.41 ms | +10.2% |
| DOWN | 472.95 ms | 426.99 ms | +10.8% |

Layout source SHA-256:
`58891578269d629b68011760f51e04756a5af66656101795cb082ab59505434e`.
