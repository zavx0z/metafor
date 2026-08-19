# NODES-010 — Артефакты

Эта директория хранит воспроизводимые доказательства итогового среза до
независимой closing review. Все measurements относятся к isolated package и
dev-only SVG playground; они не являются WebGPU или Hamiltonian acceptance.

## Benchmark

* Источник: `benchmark.ts` и отдельный fresh-process `benchmark-cold.ts`.
* Версия проекта: source checkpoint будет записан в
  `benchmark-current.json`.
* Ожидание: fixed/adaptive `RIGHT`/`DOWN` возвращают стабильные result hashes;
  warm и cold-import/layout samples содержат min/median/p95/max, а adaptive —
  фактические candidate counts.
* Фактическое наблюдение: все четыре cases сохранили frozen result hashes;
  adaptive рассмотрел два assignments из hard budget `16`.
* Чувствительные сведения: отсутствуют.

```bash
bun project/artifacts/NODES-010/benchmark.ts
```

Финальный запуск выполнен на implementation baseline
`d8563124b8f4c28ad0b80d9f9c3b039b70469c80`, Bun `1.3.14`, macOS
`22.6.0 x64`, Intel Core i7-7820HQ. Pure layout source SHA-256:
`1f77c6e97dfa31db2e234cef668a07ab18659f7522f030bd0effd0f563e92443`.

| Policy / direction | Warm median / p95 | Cold import+layout median / p95 | Candidates |
| --- | ---: | ---: | ---: |
| fixed RIGHT | 5.32 / 9.39 ms | 45.28 / 45.91 ms | 1 |
| fixed DOWN | 25.03 / 32.32 ms | 117.20 / 118.02 ms | 1 |
| adaptive RIGHT | 3.78 / 5.85 ms | 45.88 / 47.28 ms | 2 attempted / 16 budget |
| adaptive DOWN | 15.89 / 17.90 ms | 85.62 / 86.09 ms | 2 attempted / 16 budget |

Все `20` warm и `5` fresh-process cold samples, min/median/p95/max, exact
input/result hashes и adaptive diagnostics находятся в
`benchmark-current.json`. SHA-256 artifact:
`447f3b34f8e1e50bab6075f86a639a389977cb4a8db31f2b0b16d33f99ec9d2d`.

## Browser bundles

* Источник: `bundles.ts`, public consumer fixtures `pkg/nodes/fixtures`.
* Ожидание: core, fixed/adaptive layout, fixed/adaptive Card, custom Surface и
  оба Worker executors/clients собираются независимо; forbidden policy/UI/GPU
  symbols отсутствуют.
* Фактическое наблюдение: все десять builds успешны; каждый required symbol
  найден, каждый forbidden symbol отсутствует.
* Чувствительные сведения: отсутствуют.

```bash
bun project/artifacts/NODES-010/bundles.ts
```

| Consumer | Raw | Gzip |
| --- | ---: | ---: |
| core | 2,381 B | 874 B |
| fixed layout | 75,622 B | 23,715 B |
| adaptive layout | 81,119 B | 25,569 B |
| fixed Card | 101,188 B | 31,744 B |
| adaptive Card | 106,546 B | 33,439 B |
| custom Surface | 293,578 B | 81,967 B |
| fixed Worker executor | 75,979 B | 23,867 B |
| adaptive Worker executor | 81,563 B | 25,729 B |
| fixed Worker client | 1,527 B | 694 B |
| adaptive Worker client | 1,530 B | 696 B |

`bundles-current.json` дополнительно хранит SHA-256 каждого entrypoint и
готового bundle. SHA-256 artifact:
`4a6b5ed1b59608261aba88aefebf722ac574c8f889d85487efa09dd783a18e55`.

## SVG fixed/adaptive RIGHT/DOWN

* Источник: `generate-svg-evidence.ts`, public playground registry и frozen
  fixtures.
* Ожидание: четыре inspectable SVG показывают bounds, nodes/compounds, exact
  ports с resolved sides, edges, bends и gateways.
* Фактическое наблюдение: все четыре SVG созданы actual public policies и
  визуально содержат ожидаемые слои. Fixed result hashes совпали с frozen
  baselines; adaptive shared port выбран `EAST` в `RIGHT` и `WEST` в `DOWN`.
  Port labels детерминированно упакованы во внешние WEST/EAST gutters: boxes
  не пересекаются между собой или route bounds, один прямой leader начинается
  в exact port center и заканчивается на краю собственной box.
* Чувствительные сведения: отсутствуют.

```bash
bun project/artifacts/NODES-010/generate-svg-evidence.ts
```

| SVG | SHA-256 |
| --- | --- |
| `fixed-right.svg` | `6363afefe16d307a8a65fb8d8aaa5bc7bb03c2b8ee9aa771ce179710726e8ca3` |
| `fixed-down.svg` | `e625b9c548e6bc7a624b381c0b54925a3aa191ca8506ea8c1ea9e32dda7efaf6` |
| `adaptive-right.svg` | `53c8b5424ceadad921425ebcb3fdd9e101db04f7618d2e7a07653a458e0a6667` |
| `adaptive-down.svg` | `59fb7af2fa2af15c49fc6c2a4d3b0826c533f4f45b8e58e390110fe4c575c237` |

Exact input/result/SVG hashes и policy diagnostics находятся в
`svg-evidence.json` (SHA-256
`3be3747e7bea11230d8c61b116a69c848e57f50cd8468f97e0089df7afe9a6f4`).

## Browser screenshot

* Источник: отдельная вкладка существующего managed CDP Chrome, dev-only
  playground `http://127.0.0.1:4015/`.
* Ожидание: fixed и adaptive comparisons показывают по две читаемые панели
  `RIGHT`/`DOWN`, status `Compared RIGHT / DOWN`, без WebGPU/HUD.
* Фактическое наблюдение: ожидание совпало. В отдельном target
  `98AB06197DFBB65604CA247A37CFBB2C` обе fixed и adaptive matrices показали
  `Compared RIGHT / DOWN`; по две SVG-панели были видимы, `canvasCount=0`,
  UI errors отсутствовали. Adaptive DOM evidence подтвердило
  `source/shared: EAST` в `RIGHT` и `WEST` в `DOWN`. Fixed и adaptive DOM
  evidence для каждой панели дали `overlapPairs=[]`,
  `outsideRouteBounds=true`, `exactLeaders=true`. Console capture за `1500 ms`:
  `0` entries.
* Чувствительные сведения: отсутствуют.

| Screenshot | Размер | SHA-256 |
| --- | ---: | --- |
| `fixed-matrix.png` | 2628 × 2176 | `0182f7d97f065f7853381dcf45a9b6006ac75a0d7925aa090aa83977dc979805` |
| `adaptive-matrix.png` | 2628 × 2176 | `7d30ed4c52f6b9775991616232d0b95a724a8551448f6de8043cb597199377ae` |

Machine-readable fixed/adaptive browser results находятся в
`browser-fixed-dom-evidence.json`, `browser-dom-evidence.json` и
`browser-console.json`. Временная вкладка закрыта, dev-only server остановлен;
исходный CDP target `44D16B99D13C1A8B35F293D86AEFE0D5` сохранён.

## Verification gate

* `bun test pkg/nodes`: `126 pass`, `0 fail`.
* Focused package/bundle/playground: `13 pass`, `0 fail`.
* Focused Hamiltonian Card migration/build/host: `94 pass`, `0 fail`.
* Typecheck `nodes`, `@nodes/layout`, `@nodes/ui`, `@nodes/hud`, playground,
  canonical root `bun run typecheck` и direct root `tsc`: PASS.
* TypeDoc и `git diff --check`: PASS.
* Первый полный `bun test hamiltonian`: `292 pass`, `8 fail`, `3 errors`.
  Первичная одинаковая причина четырёх release failures — отсутствующий в
  новом Git worktree ignored immutable artifact
  `@hamiltonian/release:main@0.1.9`; browser failures затем получили `500` и
  detached frames. Layout/Card regressions в этом прогоне прошли. Release test
  setup и immutable publication принадлежат другому механизму, поэтому этот
  срез не создаёт artifact вручную и не изменяет Hamiltonian release code.
