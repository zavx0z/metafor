# NODES-002 — Артефакты

Все снимки предоставлены владельцем 2026-08-10 из одной живой Hamiltonian-сцены
на `http://127.0.0.1:4400/`. Версия checkout на момент регистрации задачи:
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

* `live-portrait.png`: `DOWN`, generation `94`, canvas 1458 × 2176; SHA-256
  `18f46950c714aff1796fbec6b7d14b16e1f995f62f3d721cdedd9443eae2d89f`.
* `live-landscape.png`: временный viewport 1200 × 800, `RIGHT`, generation
  `140`, canvas 2400 × 1600; SHA-256
  `3e915e328d0cc16e4ea3ebc550165147ab2d9671888fa11236204a6902864988`.
* На обоих снимках исчезли три класса показанных дефектов: взаимные crossings
  длинных data-channel lanes на поворотах, crossing `MessagePort/WS` у Service
  Worker и crossing IPC fan-out.
* После proof вкладка возвращена к исходному content viewport 729 × 1088:
  `DOWN`, Worker `ready`, transition `complete`, generation `186`.
