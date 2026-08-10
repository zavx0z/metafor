# NODES-002 — Артефакты

Исходные снимки предоставлены владельцем 2026-08-10 из одной живой
Hamiltonian-сцены на `http://127.0.0.1:4400/`. Версия checkout на момент
регистрации задачи:
`49627122e6ba7d5b61ce9640b025574adbd525a8` (`main`). Снимки содержат только
локальные runtime IDs, PID и loopback URL; секретов нет.

## `overview-crossings.png`

* Размер: 1208 × 1166 px.
* Ожидание владельца: параллельные связи поворачивают без пересечений.
* Фактическое наблюдение: длинные зелёные lanes пересекаются на поворотах вокруг
  общего graph corridor.
* SHA-256: `2d3d7f92a4844368e1743919700ce564bce727625a89c6724a69332eccea4b8f`.

## `corner-northwest.png`

* Размер: 106 × 108 px.
* Происхождение: увеличенный фрагмент `overview-crossings.png`.
* Фактическое наблюдение: входной и выходной порядок зелёных lanes инвертирован
  на северо-западном повороте.
* SHA-256: `10b5d82d43931bc7025a2e0b711bf10ccdad1ef75caa587878a026f928cbbe65`.

## `corner-southwest.png`

* Размер: 130 × 108 px.
* Происхождение: увеличенный фрагмент `overview-crossings.png`.
* Фактическое наблюдение: горизонталь одной lane пересекает вертикаль другой на
  юго-западном повороте.
* SHA-256: `d5079caa483e72bf4257b7a0070051dd5ac5c81c8afb793af50eb3ee5d0b84cd`.

## `corner-east.png`

* Размер: 88 × 240 px.
* Происхождение: увеличенный фрагмент `overview-crossings.png`.
* Фактическое наблюдение: повторная инверсия зелёных lanes и дополнительное
  пересечение с голубым edge на восточной стороне corridor.
* SHA-256: `ac4f72b0e3a28f5115b895c0b4a2545587f21e23e3276e74b99d2d2abf37e660`.

## `service-worker-row-order.png`

* Размер: 458 × 756 px.
* Ожидание владельца: crossing устраняется без перемещения карточки.
* Фактическое наблюдение: строки `MessagePort` и `WS` расположены так, что
  зелёный вертикальный участок пересекает голубой горизонтальный; перестановки
  этих двух связанных строк достаточно для непересекающегося выхода.
* SHA-256: `675058cec8daf912f449edb92c9dbd10b864b6b98ca1cec37a091fb2ee900af1`.

## Machine-readable baseline

`layout-request-landscape.json` и `layout-request-portrait.json` — exact
минимальные `LayoutGraph`, соответствующие той же 12-node/18-port/9-edge
Hamiltonian topology для viewport 1200 × 800 и 390 × 844.

* Landscape SHA-256:
  `e1a0b66c3bea30cfba400ae68f34da0861a1725e2a12b2b5c33152a2c7672abd`.
* Portrait SHA-256:
  `61cba3028e0266c59b433637e2aab6d904c9ec7611ad4930bfe63ed45edbb181`.
* Baseline `RIGHT`: total crossings 10, max crossings одного edge 5.
* Baseline `DOWN`: total crossings 10, max crossings одного edge 6.
* Оба запуска: три повтора и reversed input arrays дали identical geometry.

Подсчёт воспроизводится прямой командой:

```bash
bun project/artifacts/NODES-002/prove-crossings.ts \
  project/artifacts/NODES-002/layout-request-landscape.json
bun project/artifacts/NODES-002/prove-crossings.ts \
  project/artifacts/NODES-002/layout-request-portrait.json
```

## Результат offline

`proof-landscape.json` и `proof-portrait.json` содержат полную выбранную
геометрию и machine-readable список оставшихся proper perpendicular crossings.

* `RIGHT`: total crossings `10 → 4`, max crossings `5 → 3`; SHA-256
  `3753f4c3f3743949259aa330eec94911a6a6cd15b30bd880b36d0187fc54de24`.
* `DOWN`: total crossings `10 → 6`, max crossings `6 → 3`; SHA-256
  `96126e3e6aeac00d0c0810e5f7754c7e21aed83efbc17cc6bda1fb6358ce4b79`.
* В обоих режимах три повтора и reversed arrays дают identical geometry.
* Две data-channel связи больше не пересекают друг друга ни на одном из
  четырёх U-поворотов. Микрофикстура подтверждает тот же закон для двух и трёх
  lanes.

Оставшиеся crossings в frozen `LayoutGraph` не являются разрешением layout
менять `ports[].y`: запрос намеренно фиксирует baseline offsets до presentation
row-order pass. Отдельный nodes-test доказывает, что связанный row swap
сохраняет обычную строку на месте и даёт `0` crossings на двух-edge fixture.

## Результат live

Проверка выполнена в уже открытом clean CDP target
`6B9ABE69BA42A93A8481B5D5F1676D7A`, без запуска или перезапуска runtime.
Worker bundle содержал новый bundle-uncross код; scene имела 12 нод и 9 рёбер.

Первичные `live-portrait.png` и `live-landscape.png` подтвердили routing после
полной перезагрузки, но не воспроизвели переход Service Worker
`исчез → появился`. Независимая проверка обнаружила на них обратный порядок
`MessagePort`/`WS` и прежнее устранимое пересечение. Это evidence повторно
открыло NODES-002.

* `live-portrait.png`: `DOWN`, generation `94`, canvas 1458 × 2176; SHA-256
  `18f46950c714aff1796fbec6b7d14b16e1f995f62f3d721cdedd9443eae2d89f`.
* `live-landscape.png`: временный viewport 1200 × 800, `RIGHT`, generation
  `140`, canvas 2400 × 1600; SHA-256
  `3e915e328d0cc16e4ea3ebc550165147ab2d9671888fa11236204a6902864988`.
* Эти снимки сохраняются как evidence обнаруженного closing-review дефекта, а
  не как доказательство исправленного auto-reappear path.

Исправление проверено фактической заменой Service Worker в уже работающем
contour: одноразовое изменение комментария `sw.js` вызвало обычное исчезновение
и появление worker, затем комментарий был полностью удалён. Host и runtime не
перезапускались, финальное source tree не содержит диагностического изменения.

* `live-auto-reappear-portrait.png`: `DOWN`, generation `67`, canvas
  1458 × 2176; SHA-256
  `614fe7c99127eb15b3b50fb1a0184e63e17dbbfdae2befb1e357f460db974d9b`.
* `live-auto-reappear-landscape.png`: `RIGHT`, generation `91`, canvas
  2400 × 1600; SHA-256
  `e3c5c1ca4b94230a45216a026e2983bc6c0c8805f7c8297959b4f2dd5aa15ad6`.
* В обоих режимах `WS` расположен выше `MessagePort`; голубой и зелёный
  terminal segments больше не пересекаются. После proof вкладка возвращена к
  исходному content viewport 729 × 1088 (`DOWN`).

## Производительность

`benchmark.ts` измеряет только синхронный вызов `@nodes/layout layout(graph)`:
без nodes-adapter, Worker messaging, renderer и test assertions. Для каждого
frozen request выполняется один прогрев и пять последовательных замеров в одном
Bun-процессе; каждый результат сверяется по SHA-256 geometry. Команда:

```bash
bun project/artifacts/NODES-002/benchmark.ts
```

`benchmark-current.json` хранит среду, exact input hashes, все samples,
min/median/p95/max и geometry hashes текущего `HEAD`.

На `2a1047555f154a3cbd21b55dc343680745a741c6`, Bun `1.3.14`, macOS `13.7.8`,
Intel i7-7820HQ получены:

| Режим | Samples, ms | Min | Median | P95/max |
| --- | --- | ---: | ---: | ---: |
| `RIGHT` | 99.93, 70.48, 52.94, 60.98, 297.97 | 52.94 | 70.48 | 297.97 |
| `DOWN` | 294.44, 454.13, 336.02, 371.37, 278.78 | 278.78 | 336.02 | 454.13 |

При пяти samples `p95` совпадает с максимальным значением и не является
устойчивой tail-latency оценкой; в отчёте он оставлен только как верхняя точка
этой короткой серии.

Для сравнения сохранён `benchmark-historical.json` — последний benchmark старого
product engine на исходном frozen MF-419 graph: 11 нод, 18 портов, 9 рёбер.
Исторический median custom составлял `1216.84 ms` для `RIGHT` и `139.23 ms` для
`DOWN`; зафиксированный в том же trace ELK — `69.5 ms` и `134.7 ms`
соответственно. Исторический runner не записал Git revision, Bun version и CPU,
поэтому эти числа являются session baseline, а не строгим межмашинным
benchmark.

Прямое численное сопоставление snapshots даёт `RIGHT 1216.84 → 70.48 ms`
(`17.3×` меньше времени) и `DOWN 139.23 → 336.02 ms` (`2.41×` больше времени).
Это диагностическое сравнение, а не доказанная скорость изменения алгоритма:
исторический snapshot имел 11 нод, текущий — 12. Наблюдавшийся ранее live
Worker interval около `607.5 ms` также не является чистым solver benchmark:
он включал browser scheduling, Worker transport и применение результата.

Время около `4.15 s` у тяжёлого `layout-engine.test.ts` также исключено из
benchmark. Тест дважды вызывает nodes-adapter — для исходного и reversed graph;
каждый adapter-вызов может выполнить исходный и connected-row layout pass.
Итого один тест запускает pure solver до четырёх раз, затем выполняет
materialization и геометрические assertions. Это полезное время интеграционной
проверки, но не latency одного `layout(graph)`.

Текущие NODES-002 requests содержат 12 нод: к графу добавлен `server-contour`.
Поэтому новый замер сравнивается с историческим по порядку величины и выявляет
изменение performance-профиля, но не доказывает ускорение или замедление на
identical input. Текущая правка находится в nodes-adapter, поэтому чистое ядро
и его geometry hashes не изменились; различие коротких пятиэлементных серий с
предыдущим замером не доказывает регрессию ядра. На текущем snapshot оба median
выше исторического ELK trace, однако утверждение о скорости по разным inputs и
неполностью зафиксированной исторической среде не делается.
