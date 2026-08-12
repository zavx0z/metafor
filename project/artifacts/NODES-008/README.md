# NODES-008 — Артефакты

## `compound-empty-bottom-before.png`

* Источник: снимок экрана, переданный владельцем.
* Дата: 12 августа 2026 года.
* Версия проекта: canonical `main`, HEAD
  `3403e11f24647d67106ddde5eb3acd6b84de0ccf`.
* Ожидание: от последнего child до нижней внутренней границы compound остаётся
  один socket pitch, если corridor не занят маршрутом.
* Фактическое наблюдение: под `Service Worker` оставлено пять pitch, хотя
  дополнительные четыре pitch снизу маршрутами не заняты.
* Размер: `870 × 496` px.
* Чувствительные сведения: локальные runtime IDs и loopback-контур; секретов
  нет.
* Внешний оригинал: temporary screencapture attachment владельца.
* SHA-256: `e56a0dd5bf4e27f536bb972298fd1a22722a71d7ec0c0e20f90f9a8ff98c566c`.

## Live baseline

Точный CDP target `92F54A46F9AACB1CC5376F1C8963B41F`, viewport
`722 × 1088 @2`, `DOWN`, Worker `ready`, pending `0`, `15` нод и `13` рёбер.

* `Chrome`: `x=196, y=112, w=800, h=2534`.
* `Service Worker`: `x=336, y=2150, w=520, h=356`.
* Bottom gap: `140 px = 5 pitch` при `pitch=28 px`.
* Side gaps: по `140 px`; lanes на `x=280` и `x=308` подтверждают занятый
  боковой corridor.
* В нижних дополнительных `112 px` semantic route segments отсутствуют.

## Manifest первой итерации

* Defect: боковой reverse-flow reserve безусловно дублируется снизу compound.
* Hypothesis: компактный portrait placement без нижней копии side reserve
  остаётся routable для side-lane случая; вариант с нижним резервом сохраняется
  только как bounded fallback для contour, которому он действительно нужен.
* Hard laws: без изменений — exact sockets, EAST/WEST, hierarchy,
  containment, orthogonality и полный clearance обязательны.
* Budget: один placement patch, один regression patch, offline proof до live.

## `live-portrait-after.png`

* Источник: точный CDP target `92F54A46F9AACB1CC5376F1C8963B41F` уже
  открытой Hamiltonian-вкладки; runtime не перезапускался.
* Viewport: `722 × 1088 @2`, направление `DOWN`.
* Сцена: Worker `ready`, pending `0`, `15` нод, `13` рёбер.
* Bounds: `1846.25 × 2674`.
* `Chrome`: `x=196, y=112, w=800, h=2450`.
* `Service Worker`: `x=336, y=2150, w=520, h=384`.
* Bottom gap: `28 px = 1 pitch`; занятые боковые lanes сохранены.
* Размер PNG: `1444 × 2176`.
* SHA-256:
  `aed2e29ab6184d97befc00f4ce80cc6d3a828d0e40f7551c55e6607fff33ae98`.

## `landscape-vertical-gap-before.png`

* Источник: второй снимок владельца при owner review частичного результата.
* Наблюдение: ближайший occupied trunk и ближайший внешний horizontal route
  находятся в `56 px` от compound boundary вместо одного pitch `28 px`.
* Размер: `260 × 1954`.
* SHA-256:
  `7fe91100663c35aa58344e12e1feb6ae9a03f5cb1bdac2bdea953dd1e62270f7`.

## Live landscape after owner review

Точный target `8CDFADB480F89CA2A70E52EB706719F5`, viewport
`1920 × 1088 @2`, Worker ready, pending `0`. На момент замера lifecycle
содержал `13` нод и `8` рёбер, bounds `2245.9 × 1440`.

Для всех пяти compound machine-readable bottom clearance равен `28 px`.
У Browser последний child заканчивается на `y=1328`, occupied trunk находится
на `y=1356`, нижняя граница — `y=1384`. Runtime не перезапускался.
WebGPU `canvas.toDataURL` вернул чёрный buffer, поэтому ложный after-PNG удалён
и visual acceptance им не заявляется.

## Frozen proof

`verification.json` получен из `two-tab-layout-portrait.json` с SHA-256
`27c0155999cec911e1479a3418f0b462c1d03a74f65da2fa36b19155b14be78d`.

* RIGHT: geometry SHA-256
  `2188e8017abb9e416091663dfb3dd880db2ad310c4e8d584fee07c8b672a5904`,
  bounds `2365.25 × 1658`.
* DOWN: geometry SHA-256
  `cd8cfd53f36a2518886396cd7391595aeca09665c91a31def95bcfce44a89037`,
  bounds `1146.45 × 4242`.
* В обоих режимах: `14` нод, `20` портов, `12` рёбер, x3 repeats и
  три stable permutations идентичны.
* SHA-256 `verification.json`:
  `85780c6d75061655185359fe8fd58db8f98a450a8186684b82d2a5b5c1810ece`.

## Final benchmark

`benchmark-current.json` измерен один раз после всех функциональных проверок
на том же frozen input и том же Mac/Bun `1.3.14`.

| Режим | NODES-007 median | NODES-008 median | Изменение |
| --- | ---: | ---: | ---: |
| RIGHT | 195.81 ms | 180.60 ms | -7.8% |
| DOWN | 424.73 ms | 479.27 ms | +12.8% |

Input SHA-256 совпадает с NODES-007. DOWN geometry SHA-256 совпадает; RIGHT
изменён целевым исправлением. Pure layout source SHA-256:
`77ca77cea9e289bc8eea73d7ca843c26ef8c05e3fcb5a2b2634720c3faf7220f`.
SHA-256 `benchmark-current.json`:
`a174d68e17ab1a52fb48d0ae0fc86faf4c700c9648d1cdac0a0f4ed2fce6e121`.
