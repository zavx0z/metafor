# NODES-007 — Артефакты

## Исходные снимки владельца

Оба снимка сделаны 11 августа 2026 года из одного открытого Hamiltonian contour
на `http://127.0.0.1:4400/` после восстановления MF-424.3, commit
`6f1a512540a4b44b114cfa1496b8da37181c90ae`. Они содержат только локальные
runtime UUID и loopback URL; секретов нет.

### `Снимок экрана 2026-08-11 в 22.22.50.png`

* Внешний оригинал: temporary screencapture attachment владельца.
* Размер: `3840 × 2400` px.
* Ожидание: одинаковая topology в одном portrait viewport имеет одну geometry.
* Наблюдение: до reload scene вытянута в одну высокую колонку.
* SHA-256: `afcb2e0e7343b59305711dd0638c87a5c914c55ef409460ff25136b58e94a8c5`.

### `Снимок экрана 2026-08-11 в 22.23.29.png`

* Внешний оригинал: temporary screencapture attachment владельца.
* Размер: `1474 × 2360` px.
* Ожидание: обычный reload не меняет layout при том же viewport и topology.
* Наблюдение: после reload scene стала двухколоночной и заметно ниже.
* SHA-256: `fe59af9c2e8f91709333a29b6ff50c4b51cf46610e208722c7f8259c0dabbd07`.

## Live diagnostic baseline

Точный CDP target `2BFEEBD05B85882BABA5131E3D46AACE`, content viewport
`722 × 1088`, DPR `2`.

* До reload: `DOWN`, generation `10`, `15/13`, bounds `1192 × 4544`, canvas
  SHA-256 `85dc216efdd3723c536dd9b3629eb3c9eb7998a5b6f6ac748594a97e9d6dc693`.
* После обычного reload: `DOWN`, generation `5`, `15/13`, bounds
  `1846.25 × 2786`, canvas SHA-256
  `7c8146f56b7f10109a33bc29950bc9384c9565c433e7ccaf73ba6798d471842c`.
* Изменились UUID одной page и её Dedicated Worker; viewport, direction и
  cardinality не изменились.

## Диагноз

Pure layout детерминирован для одного semantic input. Расхождение появлялось
раньше этой границы: Hamiltonian использовал UUID runtime incarnation как ID
минимального layout graph. После reload менялись node/edge IDs и стабильный
ID-tie-break закономерно выбирал другую, тоже legal geometry. Исправление
вводит в `NodeSystemDocument` отдельный стабильный visual-slot `layoutId`, не
подменяя им domain identity.

Owner check после этого proof выявил второй независимый дефект: resize-path
использовал в structural key только направление. Во время drag успевал
закоммититься layout для промежуточного узкого portrait viewport, а финальный
resize той же ориентации выполнял только auto-fit.

## Resize defect и исправление

* [`resize-single-column-before.png`](resize-single-column-before.png) — owner
  screenshot `3840 × 2400`, SHA-256
  `7fb4e0bc218ca9d0c794072e84f2b01c08dce3fcf440284d45ca9e1871535a81`;
  exact live state: `722 × 1088`, `DOWN`, `15/13`, bounds `1192 × 4600`,
  geometry SHA-256 `788c8309804afc9d6f0d9bde037149e3ba6390d70429d913ed9d341e74043440`.
* После исправления без reload выполнен exact переход `1088 × 722 RIGHT`
  (`generation 38`, bounds `2613.5 × 1900`) → `722 × 1088 DOWN`
  (`generation 40`, bounds `1846.25 × 2842`).
* [`resize-portrait-after.png`](resize-portrait-after.png) — live result
  `1444 × 2176`, SHA-256
  `983947b93267266129c0f8fe06c5d8a2a25f26986465c2bfecff3f293575492f`;
  geometry SHA-256
  `54a87d4de35492fa84374b8512fb717971125ced4f1a71da714184ac16dfb660`.
* После обычного reload packing остался двухколоночным, bounds
  `1846.25 × 2786`. Разница высоты `56 px` соответствует одной реально
  отсутствующей lifecycle-строке, а не другому placement class.

Финальная read-only live-сверка после полного offline-прогона сохранила exact
viewport `722 × 1088 @2`: Worker `ready`, pending `0`, `15` нод, `13` рёбер,
все `15` rectangles и `13` routes опубликованы, bounds `1846.25 × 2814`.
Runtime не перезапускался; отличие высоты от reload proof соответствует
текущему lifecycle content.

## Промежуточный reload proof

После auto-update обычный reload выполнен дважды в exact target
`2BFEEBD05B85882BABA5131E3D46AACE`, без перезапуска runtime. Оба settled
состояния имели `DOWN`, viewport `722 × 1088 @2`, `15` нод, `13` рёбер и bounds
`1846.25 × 2786`. Bootstrap page incarnation изменилась
`6ce23834…` → `98e70f84…`, но нормализованные rectangles, parent slots и все
exact routes совпали: SHA-256
`3adbe651935818e49a1f2c62e9267be629579674b27e91003cc7626763117db2`.

* [`live-reload-proof.json`](live-reload-proof.json) — machine-readable
  сопоставление;
* [`live-after-reload-1.png`](live-after-reload-1.png) — `1444 × 2176`, SHA-256
  `4806cf653f85ce85ec485e5e86836d4c0ac8fb369daf52645967394bbb287953`;
* [`live-after-reload-2.png`](live-after-reload-2.png) — `1444 × 2176`, SHA-256
  `850608db79db5e4274af89358045c9b6c78ecda0eea773a81f8edfc1451506e9`.

## Benchmark

[`benchmark-current.json`](benchmark-current.json) использует byte-identical
NODES-006 fixture и тот же Bun/macOS/Intel contour. Geometry hashes и
`layoutSourceSha256` совпали с NODES-006, потому что pure layout core не
менялся. Final median: `RIGHT 195.81 ms`, `DOWN 424.73 ms`; предыдущий
совместимый замер: `216.37 ms` и `472.95 ms`. Текущий замер быстрее на `9.5%`
и `10.2%` соответственно. Это контроль отсутствия regression, а не заявление
об отдельной оптимизации: pure core и geometry остались byte-identical.
