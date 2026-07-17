# Разработка MetaFor

## Установка

Из корня репозитория:

```bash
bun install --frozen-lockfile
```

Workspace graph задан явным списком в root `package.json`. Рекурсивные globs не
используются, поэтому templates, `github/` и случайные package files не
становятся workspace автоматически.

## Запуск

| Command               | Состав                 | Режим                   |
| --------------------- | ---------------------- | ----------------------- |
| `bun run dev:core`    | Force + 4 core domains | Bun `--hot`             |
| `bun run dev:world`   | core + Bulk            | Bun `--hot`             |
| `bun run start:core`  | Force + 4 core domains | обычный                 |
| `bun run start:world` | core + Bulk            | обычный                 |
| `bun run logs:core`   | core                   | hot + full impulse logs |

Core domains: Boundary, Dark, Matrix и Energy. Все команды запускаются
параллельно одним Bun workspace runner и не загружают Meta автоматически.

Matrix backend задаётся явно при необходимости:

```bash
METAFOR_WEAK_BACKEND=cpu bun run start:core
METAFOR_WEAK_BACKEND=gpu bun run start:core
```

Default `auto` использует доступный WebGPU adapter и сохраняет реализованный
fallback runtime.

## Boundary persistence

Development database по умолчанию:

```text
.metafor/dev.sqlite
```

Явный изолированный путь:

```bash
BOUNDARY_PATH=/absolute/path/boundary.sqlite bun run start:core
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

`bun run logs:core` включает `METAFOR_LOG_IMPULSES=full`.

## Локальная проверка

Единый воспроизводимый contour:

```bash
bun run typecheck
bun run test
bun run check
```

`bun run test` задаёт недоступный `FORCE_ADDRESS` и отключает reconnect, чтобы
случайно запущенный development contour не влиял на suites.

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
```

WebGPU suite запускается отдельно при доступном adapter. Недоступность adapter
должна быть отмечена как `NOT EXECUTED`, а не как успешная проверка.

## Временная Meta

`create-metafor` остаётся active workspace. Генератор можно проверить во
временной директории:

```bash
tmpdir="$(mktemp -d)"
bun run --filter create-metafor build
bun create-metafor/dist/cli.js smoke-meta --dir "$tmpdir" --lang en
bun build "$tmpdir/smoke-meta/meta.ts" --outdir "$tmpdir/smoke-meta/dist" --target browser --format esm
rm -rf "$tmpdir"
```

Каталог `github/` остаётся пустой локальной площадкой для следующих
итерационных Meta и не является workspace или submodule.
