# Разработка MetaFor

## Установка

Активный workspace задан явным списком корневого `package.json`. Его установка
не обходит весь репозиторий: архивные исходники, templates и внешние репозитории
`cluster/` не становятся участниками автоматически.

Текущие библиотеки визуальной среды принадлежат canonical checkout Immersive.
Публичные package dependencies и корневые overrides связывают их с уже
зарегистрированными локальными Bun links. Глобальные регистрации и исходники
соседних проектов при установке MetaFor не изменяются.

Из корня репозитория:

```bash
bun install --frozen-lockfile --omit peer
```

## Архив Bulk

[Сохранённая реализация Bulk](../quantum/bulk/README.md#архивная-реализация)
архивирована на месте. Из активного workspace исключены:

* `quantum/bulk` вместе с `types`, `gravity`, `strong`, `weak`;
* связанный `pkg/visual`;
* старый server-package `quantum/dark`, чей browser-gateway импортирует Bulk;
* старый Universe launcher `cosmos/internal/supervisor`.

Их manifests и реализация остаются в репозитории. Отдельные packages
`quantum/dark/types` и `quantum/dark/gravity`, остальные библиотеки и проверки
Quantum сохраняют участие в активном составе. Архив не переносится во внешний
Production и не получает новых служебных полей `kind` или `status`.

Стандартные тесты и TypeScript discovery пропускают Bulk, его visual package,
старый supervisor, Dark server entrypoint и принадлежащий ему server test.
Интеграционные проверки Boundary, checkpoint, агентной сессии и Graph,
напрямую импортирующие Bulk, также относятся к сохранённому архивному контуру.
Остальные доменные тесты остаются активными.
Глобальный preload старого Bulk TSX больше не подключается. Проверки архива
сохраняются, но не объявляются пройденными в текущем окружении.

Команды `runtime:universe`, `runtime:universe:once`, `runtime:universe:logs` и
`visual:playground` сняты с рабочего корневого manifest. Восстановление этого
сохранённого контура требует отдельного согласования состава и зависимостей.

## Запуск Cosmos

Рабочий запуск и управление видимым контуром принадлежат
[штатному lifecycle MetaFor](../.agents/skills/metafor-dev/SKILL.md#lifecycle).
Из корня репозитория:

```bash
.agents/skills/metafor-dev/scripts/metafor-dev.sh status "$PWD"
.agents/skills/metafor-dev/scripts/metafor-dev.sh start "$PWD"
```

Cosmos запускает startup, выбранный release и internal Visual. Архив Bulk и
старый Universe не участвуют в этой цепочке. Выпуск, его проверка и обновление
следуют [порядку разработки Cosmos](../.agents/skills/metafor-dev/references/development.md).

## Boundary persistence

Development database по умолчанию:

```text
.metafor/dev.sqlite
```

Нестандартный путь Boundary задаёт `BOUNDARY_PATH`. Эти параметры сохранённого
Quantum-контура не запускают его вместе с Cosmos.

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

Сохранённый Universe launcher использовал `METAFOR_LOG_IMPULSES=full`;
его запуск исключён из текущего рабочего состава.

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
исключает `cluster/**` и перечисленный выше архив из test discovery, чтобы случайно запущенный development
contour и тесты внешних Atom-репозиториев не влияли на suites MetaFor.

Домены можно проверять отдельно без перечисления внутренних файлов:

```bash
bun test create-metafor
bun test boundary
bun test matrix
bun test energy
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
