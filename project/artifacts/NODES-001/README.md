# NODES-001 — Артефакты

Набор получен 2026-08-10 из уже открытой Hamiltonian-сцены на
`http://127.0.0.1:4400/`. Версия checkout при фиксации входов:
`49627122e6ba7d5b61ce9640b025574adbd525a8` (`main`). Секретов нет; runtime IDs,
PID и loopback URL являются локальными диагностическими значениями.

## Exact layout inputs

* `live-layout-request-landscape.json`: 12 nodes, 18 ports, 9 edges, viewport
  1200 × 800; SHA-256
  `e1a0b66c3bea30cfba400ae68f34da0861a1725e2a12b2b5c33152a2c7672abd`.
* `live-layout-request-portrait.json`: та же topology, viewport 390 × 844;
  SHA-256
  `61cba3028e0266c59b433637e2aab6d904c9ec7611ad4930bfe63ed45edbb181`.

## Machine proof

`prove-live.ts` проверяет три повтора, reversed arrays, exact endpoints,
orthogonality, inflated unrelated-node obstacles и horizontal/vertical
edge-edge clearance. Его SHA-256:
`d1438c66466c8deda72566d8bbe582e5908a11c1801cb4833499cfe17caa11e3`.

* `live-proof-landscape.json`: `RIGHT`, 9/9 exact endpoints, 0 unrelated
  obstacle violations, minimum H/V clearance 28 px; SHA-256
  `58909de5520af4f0708d16bfb925f856822fa54afc1c51a155a65e942cbf303a`.
* `live-proof-portrait.json`: `DOWN`, те же hard результаты; SHA-256
  `bde7fcd3d748bc517ef5dea60aa8f2202fadb4a10aeb675b7a099144fdd6532d`.
* `diagnose-live.ts` и `live-diagnostic-*.json` сохраняют candidate-level
  routability evidence; это диагностические, а не acceptance results.

## Live screenshots

Ожидание до захвата: единый 28 px socket rhythm, отсутствие прохода edge через
постороннюю ноду, корректные RIGHT/DOWN containment и фактические corridors.

* `live-landscape.png`: 2400 × 1600, ожидание выполнено; SHA-256
  `fdc08587cea2ce85e5198d5fe9b76354a4ac9fc894fbfb74c36e2b845aa5e0ff`.
* `live-portrait.png`: 780 × 1688, ожидание выполнено; SHA-256
  `f2966b2fc13f613e9404395fb4cd1ec66a2eeaa29879df70717255681b0302ff`.

`live-landscape.json` и `live-portrait.json` содержат соответствующие
browser-observation snapshots; machine geometry принадлежит `live-proof-*`.
