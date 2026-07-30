# Разработка MetaFor

## Установка

Из корня репозитория:

```bash
bun install --frozen-lockfile
```

Workspace graph задан явным списком в root `package.json`. Рекурсивные globs не
используются, поэтому templates, игнорируемый `cluster/` и внешние Atom-пакеты
не становятся workspace MetaFor автоматически.

## Запуск

| Command                          | Назначение                         |
| -------------------------------- | ---------------------------------- |
| `bun run runtime:universe`       | постоянный полный contour          |
| `bun run runtime:universe:once`  | рождение полного contour и выход   |
| `bun run runtime:universe:logs`  | полный contour с журналом impulses |

Universe launcher рождает Force, затем Boundary, Dark, Energy и Bulk, а Matrix —
последней. Он не загружает Meta автоматически. После изменения кода весь
причинно связанный contour нужно явно остановить и запустить заново; частичная
горячая перезагрузка доменов не поддерживается.

Production default — `auto`:

```bash
bun run runtime:universe
METAFOR_WEAK_BACKEND=gpu bun run runtime:universe
METAFOR_WEAK_BACKEND=cpu bun run runtime:universe
```

Без env используется WebGPU-first выбор с CPU fallback. `gpu` требует WebGPU и
завершает рождение ошибкой при его отсутствии. `cpu` принудительно выбирает
детерминированный reference backend.

## Boundary persistence

Development database по умолчанию:

```text
.metafor/dev.sqlite
```

Явный изолированный путь:

```bash
BOUNDARY_PATH=/absolute/path/boundary.sqlite bun run runtime:universe
```

Изолированный test run может перенаправить flat Mass catalog, не касаясь
canonical live `mass/`:

```bash
METAFOR_MASS_PATH=/absolute/temporary/mass bun run test
```

Первый позиционный аргумент `boundary/server.ts` имеет приоритет над
`BOUNDARY_PATH`. Parent directory создаётся автоматически. Boundary tests
используют отдельные `:memory:` databases и всегда закрывают их; development
database в tests не открывается.

## Логи

```text
METAFOR_LOG_IMPULSES=0
METAFOR_LOG_IMPULSES=compact
METAFOR_LOG_IMPULSES=full
METAFOR_LOG_DOMAINS=force,boundary,matrix,energy
METAFOR_LOG_PARTS=inflaton,graviton,gluon,higgs,photon,z,w+,w-
```

`bun run runtime:universe:logs` включает `METAFOR_LOG_IMPULSES=full`.

## Локальная проверка

Единый воспроизводимый contour:

```bash
bun run typecheck
bun run test
bun run check
```

`bun run test` задаёт недоступный `FORCE_ADDRESS`, отключает reconnect и
исключает `cluster/**` из test discovery, чтобы случайно запущенный development
contour и тесты внешних Atom-репозиториев не влияли на suites MetaFor.

Критические suites можно запускать отдельно:

```bash
bun test create-metafor
bun test matter.spec.ts
bun test boundary/input.spec.ts
bun test boundary/state.spec.ts
bun test boundary/execution.spec.ts
bun test boundary/reaction.spec.ts
bun test matrix/runtime.parity.spec.ts
bun test energy/energy.spec.ts
bun test energy/reaction.spec.ts
bun test bulk/world.spec.ts
bun test pkg/engine/src/renderer/shaders/line.webgpu.spec.ts
```

WebGPU suite запускается отдельно при доступном adapter. Недоступность adapter
должна быть отмечена как `NOT EXECUTED`, а не как успешная проверка.
Line shader suite через настоящий WebGPU device компилирует production WGSL
vertex/fragment stages и создаёт production-shaped render pipeline; обычная
проверка текста или browser bundle не заменяет этот gate.

## Временная Meta

`create-metafor` остаётся active workspace. Генератор можно проверить во
временной директории:

```bash
tmpdir="$(mktemp -d)"
mkdir -p "$tmpdir/cluster/zavx0z"
bun run --filter create-metafor build
bun create-metafor/dist/cli.js capsule --dir "$tmpdir/cluster/zavx0z" --lang en
bun create-metafor/dist/cli.js capsule-profile --dir "$tmpdir/cluster/zavx0z" --lang en
bun build "$tmpdir/cluster/zavx0z/capsule/meta.ts" --outdir "$tmpdir/dist" --target browser --format esm
bun build "$tmpdir/cluster/zavx0z/capsule-profile/meta.ts" --outdir "$tmpdir/dist-profile" --target browser --format esm
rm -rf "$tmpdir"
```

Каталог `cluster/` является локальным resolver root, не входит в WIMP `src`, не
является workspace и игнорируется внешним репозиторием MetaFor. Каждый
`cluster/<owner>/<repository>` является независимым peer Git-репозиторием.
Третьего сегмента и nested Meta repository нет; composition выполняется через
Meta/Matter/Monad references. Оба вызова создают полный template, lockfile,
собственный Git и один `Initial commit`.
