# NODES-008 — Артефакты

## Owner rejection для NODES-008.3

Два crop-снимка `11.34.38` и `11.34.44` от 12 августа 2026 года показывают
пустой боковой pitch между child envelope и внутренней границей двух page
compounds. Оригиналы переданы как temporary screencapture attachments и пока
не копировались в Git.

* Правый crop: `102 × 394`, SHA-256
  `bae0a01597359e49db40a3feb8b0cf381213380101e150b1632aa81458982e9d`.
* Левый crop: `96 × 670`, SHA-256
  `64a6ba5de4b7536643b267ceeb4ea062e86a2c417ca6fcc80996b1e5bb847bd3`.
* Exact witness: два portful page compounds имеют по одному пустому gap
  `56 px` при `clearance=28`; противоположная сторона каждого compound занята
  правильной последовательностью `boundary → track → child = 28/28`.
* Чувствительные сведения: локальные runtime IDs; секретов нет.

После исправления тот же exact Worker input (`15` нод, `22` порта, `13`
рёбер) даёт пустой список parent-level side-rhythm violations. Regression и
полный пакет `86/86` проходят.

Владелец визуально принял результат 12 августа 2026 года. Две уже открытые
Hamiltonian-вкладки подхватили исправление без reload и без restart runtime:

* `live-portful-sides-after-a.png`: `1462 × 2176`, SHA-256
  `18dbc5979023cb82987f500661c37261d04ea38d4e454ead9e764a6155dad97c`;
* `live-portful-sides-after-b.png`: `1462 × 2176`, SHA-256
  `b9fb593c96d8ecc98701b95b648679a530804f47c412598bbb5beaa48f1bd7c7`.

## Owner rejection для NODES-008.2

Crop-снимок `11.17.24` от 12 августа 2026 года показывает пустой нижний остаток
внешнего Server compound после визуально правильного внутреннего отступа
`RTCPeerConnection → Peer process boundary`. Оригинал передан владельцем как
temporary screencapture attachment и пока не копировался в Git.

* Размер: `508 × 460`.
* SHA-256: `a1ec2b01f03c78a5e7f7cc34fcb4958cd98b972a1a2f6a408b495aebff258229`.
* Ожидание: без нижнего horizontal route последний child отделён от внутренней
  границы одним socket pitch.
* Exact witness: `server-contour` child bottom `1338`, boundary bottom `1506`,
  bottom tracks отсутствуют, gap `168 px` при `clearance=28`.
* Чувствительные сведения: локальные runtime IDs; секретов нет.

После исправления exact witness даёт boundary bottom `1366`, gap `28 px` и
пустой список нарушений. Две уже открытые Hamiltonian-вкладки проверены через
точные CDP target IDs без reload/restart:

* portrait: `live-portrait-bottom-after.png`, `1462 × 2176`, SHA-256
  `ed7691d755801c2cf4fcb2ba8455990161351d708ec22e75fcaaa9beb0970937`;
* landscape: `live-landscape-bottom-after.png`, `1462 × 2176`, SHA-256
  `89b38a9d05fb9b91a14b6a9f1746c98e45b9f7bb1420e864ca95482b4a288981`.

На обеих геометриях нижняя граница Server compound следует на один pitch после
последнего вложенного compound; соседние placements и routes сохранены.

## Owner rejection для NODES-008.1

Три crop-снимка от 12 августа 2026 года показывают лишние вертикальные
интервалы между рядом, horizontal route и следующим рядом в `DOWN`. Оригиналы
переданы владельцем как temporary screencapture attachments и пока не
копировались в Git; точное machine-readable воспроизведение записано в карточке
`NODES-008.1` по сохранённому Worker input.

| Снимок | Размер | SHA-256 |
| --- | ---: | --- |
| `11.01.16` | `476 × 148` | `0ead5a25d1034ec569e9a2b572d19ea2838250b15ae2e9eec0cf566404a19bd3` |
| `11.01.23` | `710 × 152` | `dab591e7d425b6f66df421cb214ad50a0abbaa8cfdcb4290a20707a7fdc55e35` |
| `11.01.46` | `572 × 148` | `36ec593acd6dd7792795c3f0f3b5268af6d20f00c300488a843f94d45859ae42` |

Ожидание: каждый незанятый промежуток равен одному socket pitch; corridor с
одним horizontal route содержит по одному pitch с обеих сторон линии.
Фактический результат до исправления: точный `15/22/13` input даёт интервалы
`84`, `84` и `56 px` при `clearance=28`. После NODES-008.1 тот же
machine-readable witness возвращает `violations: []`; владелец визуально
подтвердил устранение показанных дефектов.

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

* Источник: точный CDP target `8CDFADB480F89CA2A70E52EB706719F5` уже
  открытой Hamiltonian-вкладки; runtime не перезапускался.
* Viewport: `731 × 1088 @2`, направление `DOWN`.
* Сцена: Worker `ready`, pending `0`, `15` нод, `13` рёбер.
* Bounds: `1846.25 × 2646`.
* `Chrome`: `x=224, y=112, w=718.05, h=2422`.
* `Service Worker`: `x=336, y=2150, w=520, h=356`.
* Bottom gap: `28 px = 1 pitch`.
* Side rhythm: boundary `224`, lanes `252/280/308`, первый child `336`;
  четыре соседних gap равны `28 px`.
* Размер PNG: `1462 × 2176`.
* SHA-256:
  `744eafcf05acd76dae0260bdebb8c80c26d5f3986e1d380ddd4eff93b12e6198`.

## `portrait-side-gap-before.png`

* Источник: последний owner-rejection предыдущего `REVIEW`.
* Наблюдение: между compound boundary и ближайшей vertical lane визуально
  оставалась дополнительная пустая полоса.
* Machine-readable live geometry предыдущего результата: boundary `196`,
  lanes `280/308`, child `336`; gaps `84/28/28`, то есть первый gap содержал
  лишние `56 px`.
* Размер: `130 × 450` px.
* SHA-256:
  `fb6ffc8d742cb0c06b9e921e074391fd8d8bf8df4adae1ba3f544541a5bd98e6`.

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
  `9870e1a96195a17bd849730d9081ac3b381c2e940135c46bde9aaa06b8616404`,
  bounds `782.45 × 3570`.
* В обоих режимах: `14` нод, `20` портов, `12` рёбер, x3 repeats и
  три stable permutations идентичны.
* SHA-256 `verification.json`:
  `f545e77882b28cbe2cb98a8c027976f8c06c55b4b1f050797718e6f9e90780d5`.

## Benchmark текущего checkpoint

`benchmark-current.json` содержит один актуальный результат выбранного
checkpoint на том же frozen input и том же Mac/Bun `1.3.14`; промежуточные
замеры не накапливаются.

| Режим | Отклонённый NODES-008 | Текущий checkpoint | Изменение |
| --- | ---: | ---: | ---: |
| RIGHT | 180.60 ms | 195.90 ms | +8.5% |
| DOWN | 479.27 ms | 581.17 ms | +21.3% |

Input SHA-256 совпадает с предыдущим замером; RIGHT geometry сохранена, DOWN
изменена целевым route-aware side compaction. Pure layout source SHA-256:
`68d7951fe076526a08ffc2607d536f5623d811a2e5429f9fa72c88d3ad892eed`.
SHA-256 `benchmark-current.json`:
`2af39532dd10f9042401399618d9ab2942196c5ab8a9739a925fb0f0201eab6b`.
