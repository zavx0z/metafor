# Разработка MetaFor

## Установка

### Связанные репозитории

Engine, Layout, UI и Node являются соседними публичными репозиториями,
построенными для [MetaFor](https://github.com/zavx0z/metafor). Их internal
package identities не публикуются в npm: Bun links сохраняют одного реального
владельца каждого module и не создают re-export либо TypeScript alias.

Репозитории располагаются рядом:

```text
repozitarium/
├── engine/
├── layout/
├── ui/
├── node/
└── metafor/
```

После клонирования links регистрируются снизу вверх:

```bash
cd ../engine
bun install --frozen-lockfile
cd packages/core && bun link

cd ../../../layout
bun install --frozen-lockfile
cd packages/core && bun link

cd ../../../ui
bun install --frozen-lockfile
for package in elements components hud storybook; do (cd "packages/$package" && bun link); done

cd ../node
bun install --frozen-lockfile
for package in core editor layout worker ui storybook; do (cd "packages/$package" && bun link); done

cd ../metafor
```

Из корня репозитория:

```bash
bun install --frozen-lockfile
```

Workspace graph задан явным списком в root `package.json`. Рекурсивные globs не
используются, поэтому templates, игнорируемый `cluster/` и внешние Atom-пакеты
не становятся workspace MetaFor автоматически.

## Запуск

| Command                          | Назначение                               |
| -------------------------------- | ---------------------------------------- |
| `bun run runtime:universe`       | постоянный полный контур                 |
| `bun run runtime:universe:once`  | рождение полного контура и выход         |
| `bun run runtime:universe:logs`  | полный контур с журналом сообщений Force |

Запуск Вселенной сначала рождает Dark вместе с его Force, затем Boundary,
Energy и Bulk, а Matrix — последней. Meta автоматически не загружается. После
изменения кода весь причинно связанный контур нужно явно остановить и запустить
заново; частичная горячая перезагрузка доменов не поддерживается.

У contour один слушающий порт Dark. Boundary, Energy, Bulk и Matrix открывают к
нему исходящие Oracle и Force WebSocket и не поднимают собственных HTTP servers.
По умолчанию используется `127.0.0.1:4000`; второй независимый contour
запускается на другом единственном порту:

Обычный рабочий режим — `auto`:

```bash
bun run runtime:universe
METAFOR_UNIVERSE_PORT=4100 bun run runtime:universe
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

Первый позиционный аргумент `../quantum/boundary/server.ts` имеет приоритет над
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

Рабочий toolchain закреплён в root manifest: Bun `1.4.0` и TypeScript
`7.0.2`. В проекте нет старого TypeScript compatibility package; проверки,
TSDoc и IDE используют один TS 7 contract.

Единый воспроизводимый contour:

```bash
bun run typecheck
bun run test
bun run check
```

`bun run test` задаёт недоступный `FORCE_ADDRESS`, отключает reconnect и
исключает `cluster/**` из test discovery, чтобы случайно запущенный development
contour и тесты внешних Atom-репозиториев не влияли на suites MetaFor.

Домены можно проверять отдельно без перечисления внутренних файлов:

```bash
bun test create-metafor
bun test boundary
bun test matrix
bun test energy
bun test bulk
```

Проверки Matrix с WebGPU требуют устройства, способного выполнить настоящий
вычислительный проход. Его недоступность является невыполненной проверкой, а не
успешным результатом. TSDoc рядом с public contracts содержит ссылки на
конкретные сценарии, подтверждающие технические этапы жизненного цикла.

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
Meta/Matter/Oracle references. Оба вызова создают полный template, lockfile,
собственный Git и один `Initial commit`.
