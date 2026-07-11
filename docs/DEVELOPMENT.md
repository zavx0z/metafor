# Разработка

Этот документ фиксирует локальный режим разработки и проверки динамического ядра MetaFor после восстановления единственного packed Matrix runtime.

Канонические правила реализации находятся в [`../AGENTS.md`](../AGENTS.md). Математическая модель, миссия, runtime-инварианты и планы — в [`zavx0z/concept`](https://github.com/zavx0z/concept).

## Инварианты перед работой

- `Dark → Inflaton → Force → Boundary`;
- Boundary является единственной canonical materialized persistence;
- один `ForceMessage` содержит ровно одну минимальную `Particle`;
- каждый Boundary patch является отдельной transaction;
- derived particles выходят только после commit;
- Matrix, Energy и Bulk не читают Boundary/SQLite напрямую;
- production Matrix имеет один вычислительный pipeline `gravity → strong → weak`;
- WebGPU-backed Weak является основным параллельным backend;
- CPU является fallback/reference backend и обязан сохранять ту же семантику;
- `MatrixProjectionStore` и отдельный TypeScript evaluator State запрещены;
- обычные runtime-изменения передаются локальными Gluon/Higgs/Photon/Z/W particles;
- для cold start и structural Meta-изменения Boundary может передать Matrix производную проекцию `runtime/matrix`;
- `runtime/matrix` не является вторым canonical world snapshot: её можно удалить и полностью восстановить из Boundary;
- запрещены параллельная durable truth, скрытое чтение чужого store и reset, подменяющий причинный поток;
- Dark не импортирует Boundary;
- первый проверочный runtime может работать без Bulk и UI, используя structured Impulse logs.

## Рабочий процесс

Разработка ядра выполняется локально:

- через приложение Codex;
- в обычных Git branches и PR;
- прямым чтением и изменением repository files;
- terminal commands;
- Bun tests;
- structured runtime logs.

Interpreter остаётся историческим прототипом, средой экспериментов и источником reusable UI. Он больше не является обязательным способом разработки core и не должен определять Matrix, package topology или server lifecycle.

## Локальные домены

| Domain   | Port | Entry                |
| -------- | ---- | -------------------- |
| Force    | 4000 | `force/server.ts`    |
| Boundary | 4001 | `boundary/server.ts` |
| Dark     | 4002 | `dark/server.ts`     |
| Matrix   | 4003 | `matrix/server.ts`   |
| Bulk     | 4004 | `bulk/server.ts`     |
| Energy   | 4005 | `energy/server.ts`   |

## Минимальный запуск без Bulk

```bash
bun run runtime
```

Команда запускает:

```text
Force + Boundary + Dark + Matrix + Energy
```

Bulk и interpreter не требуются для первого причинного цикла.

Полный журнал Impulse:

```bash
bun run runtime:logs
```

Явный CPU fallback:

```bash
bun run runtime:cpu
```

Строгий WebGPU режим:

```bash
bun run runtime:gpu
```

`runtime:gpu` обязан завершиться ошибкой, если WebGPU недоступен. Молчаливый переход на CPU разрешён только для `auto`, который используется по умолчанию.

Полный контур с Bulk остаётся доступен:

```bash
bun run force
```

Или домены запускаются по одному:

```bash
bun run --filter force server
bun run --filter boundary server
bun run --filter dark server
bun run --filter matrix server
bun run --filter energy server
bun run --filter bulk server
```

Force clients используют `ws://127.0.0.1:4000/ws`; другой адрес задаётся `FORCE_ADDRESS`. Boundary database задаётся первым аргументом или `BOUNDARY_PATH`.

## Structured Impulse logs

По умолчанию server-side Force transports используют compact mode. Режимы:

```text
METAFOR_LOG_IMPULSES=0
METAFOR_LOG_IMPULSES=compact
METAFOR_LOG_IMPULSES=full
```

Фильтры:

```text
METAFOR_LOG_DOMAINS=force,boundary,matrix,energy
METAFOR_LOG_PARTS=inflaton,graviton,gluon,photon,z,w+,w-
```

Строка compact log содержит:

```text
timestamp sequence domain direction part op path from value-summary
```

Лог фиксирует фактическую отправку или получение Particle, не меняет payload, ограничивает большие значения и скрывает распространённые secret-поля. Это наблюдаемость текущего runtime, а не нативная Летопись MetaFor.

## Declaration flow

После запуска доменов можно инициировать загрузку Meta:

```bash
curl -sS -X POST http://127.0.0.1:4000/force \
  -H 'content-type: application/json' \
  -d '{
    "parts": [{
      "part": "inflaton",
      "op": "test",
      "path": "zavx0z/test-meta"
    }]
  }'
```

Ожидаемый причинный порядок:

1. Force передаёт request Dark и Boundary.
2. Dark загружает Meta и сравнивает её со своей проекцией.
3. Dark отправляет отдельный Inflaton для каждой add/remove/replace entity.
4. Boundary применяет каждую entity отдельной transaction.
5. После каждого commit Boundary отправляет локальные consequences.
6. Dark завершает coherent batch минимальным `inflaton/test` marker.
7. Boundary строит производную `MatrixRuntimeSnapshot` из текущего canonical world.
8. Boundary отправляет одну адресованную `graviton/replace runtime/matrix` Particle.
9. Matrix загружает packed `gravity/strong/weak` и выполняет начальный `UndefinedOnly` step.
10. Следующие Gluon/Higgs изменяют packed fields и запускают Weak без второго evaluator.
11. State с Process выпускает Photon `test`; Energy выполняет `z/test → z/copy → W+/W−` handshake.
12. Все шаги наблюдаются в server logs.

Текущий первый незакрытый causal edge после восстановления Matrix:

```text
W result
→ canonical Boundary/world commit
→ derived Gluon/Higgs
→ unlock/re-evaluate
→ Reaction
```

Пока W result используется Matrix для продолжения process handshake; его нельзя считать уже реализованным canonical world update.

## Replay и Matrix bootstrap

Каждый runtime transport после register отправляет:

```text
z/test force/replay/<domain>/<connection-id>
```

Ответ зависит от домена:

- Matrix получает одну производную `runtime/matrix` projection, которая собирает packed runtime;
- Energy и Bulk получают обычный incremental replay адресуемых declaration/Actor consequences;
- Force server не хранит world state/history;
- Boundary остаётся владельцем materialized world.

Reconnect-проверка должна подтверждать:

- Matrix не читает Boundary database;
- bootstrap полностью воспроизводим из Boundary;
- Actor identity и адреса сохраняются;
- после boot локальные field changes не требуют rebuild;
- startup order доменов не меняет конечный результат;
- Energy/Bulk replay остаётся idempotent;
- ни один домен не создаёт второй durable world store.

## Tests

Полный прогон:

```bash
bun test
bun run tsc --noEmit
```

Критические проверки восстановленной Matrix:

```bash
bun test boundary/runtime/matrix.spec.ts
bun test matrix/matrix.spec.ts
bun test matrix/weak/device.spec.ts
bun test matrix/weak
```

CPU runtime:

```bash
bun run runtime:cpu
```

Фактический WebGPU runtime:

```bash
bun run runtime:gpu
```

Один и тот же fixture должен затем исполняться на CPU и GPU, а наблюдаемые State/lock/Photon traces — совпадать. Компиляция shader или fake `GPUDevice` не является доказательством фактического WebGPU execution.

Точечные доменные проверки:

```bash
bun test force
bun test dark
bun test boundary
bun test matrix
bun test energy
bun test bulk
```

## Обязательные сценарии

1. Dark declaration batch завершается terminal marker.
2. Boundary строит packed Matrix bootstrap из canonical data.
3. Initial undefined State вычисляется Weak.
4. Gluon/Higgs достигают packed heap и не вызывают второй evaluator.
5. WebGPU является default backend при доступности.
6. CPU используется как явный fallback и даёт тот же trace.
7. Process State проходит Photon/Z/W handshake ровно один раз.
8. Reconnect восстанавливает Matrix без чтения SQLite из Matrix.
9. Local field patch сохраняет identity unrelated Actor/subtree.
10. Malformed zero/multi-particle message отвергается Force.
11. `MatrixProjectionStore`, `comparePredicate` и `evaluateIncrementalActor` отсутствуют в production Matrix.
12. Structured logs показывают полный causal order до первого незакрытого edge.

## Test isolation

Production domains общаются только через Force. Test files могут напрямую читать store/SQLite для assertions, но такой import не становится runtime API.

Fixture не должен добавлять production reset/clear surface. Изоляция теста достигается новым instance/process/database. Производная Matrix projection допустима только как rebuildable target-specific bootstrap, а не как test-only оправдание второй world truth.

## После Markdown-изменений

```bash
bun run .qwen/skills/table-format/format.ts <changed-files>
git diff --check -- '*.md'
```

## Test tools

`fixture/tools` содержит scoped read-only actions:

- `filesystem.read`;
- `filesystem.list`;
- `filesystem.metadata`.

Capability root приходит через `mass.filesystemRoot`; caller задаёт только relative path. Эти actions проверяют Energy/tool boundary, но не являются полным внешним Codex-compatible adapter.
