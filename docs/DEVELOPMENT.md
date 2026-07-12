# Разработка MetaFor

Этот документ описывает только активное ядро и его воспроизводимый запуск.
Исторические product shells не участвуют в сборке и runtime.

## Домены

| Domain   | Default port | Entry                |
| -------- | ------------ | -------------------- |
| Force    | 4000         | `force/server.ts`    |
| Boundary | 4001         | `boundary/server.ts` |
| Dark     | 4002         | `dark/server.ts`     |
| Matrix   | 4003         | `matrix/server.ts`   |
| Bulk     | 4004         | `bulk/server.ts`     |
| Energy   | 4005         | `energy/server.ts`   |

Основной причинный контур:

```text
Dark → Inflaton → Force → Boundary
Boundary → Matrix / Energy / Bulk consequences
Matrix gravity → strong → weak
Matrix → Photon
Energy ↔ Z claim/copy
Energy → W proposal
Boundary → canonical commit → Gluon/Higgs → W acknowledgment
Boundary consequence → Reaction → Energy → Boundary
```

Boundary является единственной canonical materialized persistence. Matrix,
Energy и Bulk не читают Boundary SQLite напрямую.

## One-command launcher

Основной запуск:

```bash
bun start
```

или:

```bash
bun run runtime
```

`runtime/start.ts` выполняет последовательность:

1. запускает Force;
2. ждёт Force health;
3. запускает Boundary, Matrix, Energy и Dark;
4. ждёт health каждого домена;
5. ждёт их регистрации в Force;
6. отправляет `inflaton/test` для `METAFOR_ROOT`;
7. оставляет runtime работающим до `SIGINT` или `SIGTERM`;
8. завершает дочерние процессы в обратном порядке.

Launcher не является новым доменом и не владеет world state. Это минимальный
операционный lifecycle существующих доменов.

### Настройки

```text
METAFOR_ROOT            default: test/runtime-universe
BOUNDARY_PATH            default: boundary/tmp/runtime.sqlite
METAFOR_AUTO_ACTIVATE    default: 1; 0 отключает activation
METAFOR_WEAK_BACKEND     auto | cpu | gpu
METAFOR_FORCE_PORT       default: 4000
METAFOR_BOUNDARY_PORT    default: 4001
METAFOR_DARK_PORT        default: 4002
METAFOR_MATRIX_PORT      default: 4003
METAFOR_ENERGY_PORT      default: 4005
```

Пример:

```bash
METAFOR_ROOT=owner/project \
BOUNDARY_PATH=./data/boundary.sqlite \
METAFOR_LOG_IMPULSES=full \
bun start
```

`runtime:gpu` является строгим режимом и завершается ошибкой без WebGPU:

```bash
bun run runtime:cpu
bun run runtime:gpu
```

Для ручного запуска доменов без launcher lifecycle:

```bash
bun run runtime:domains
```

Полный контур с Bulk остаётся отдельной командой:

```bash
bun run force
```

## Force health

`GET /health` Force возвращает зарегистрированные clients:

```json
{
  "ok": true,
  "domain": "force",
  "clients": [
    {"domain": "boundary", "id": "boundary-local"},
    {"domain": "dark", "id": "dark-local"},
    {"domain": "energy", "id": "energy-local"},
    {"domain": "matrix", "id": "matrix-local"}
  ]
}
```

Launcher использует это как registration barrier. Фиксированный `sleep` не
считается доказательством готовности.

## Canonical external input

Uncommitted external `Gluon/Higgs` без `from` Force направляет только Boundary.
Matrix не видит mutation до commit.

```text
external Field mutation
→ Force boundary-only routing
→ Boundary validation and atomic commit
→ boundary:* Gluon/Higgs consequence
→ Matrix Weak
```

Если Boundary недоступен, HTTP `/force` возвращает `503`, а input не
рассылается другим доменам.

Пример после materialization нужного Actor:

```bash
curl -sS -X POST http://127.0.0.1:4000/force \
  -H 'content-type: application/json' \
  -d '{"parts":[{"part":"gluon","op":"replace","path":1,"value":{"fields":{"101":1}}}]}'
```

Actor и Field IDs являются адресами materialized мира; production-клиент должен
получать их из общей среды, а не угадывать.

## Ручная загрузка Meta

При `METAFOR_AUTO_ACTIVATE=0`:

```bash
curl -sS -X POST http://127.0.0.1:4000/force \
  -H 'content-type: application/json' \
  -d '{"parts":[{"part":"inflaton","op":"test","path":"test/runtime-universe"}]}'
```

Ожидаемый порядок:

1. Dark загружает DSL и выпускает поштучные Inflaton.
2. Boundary коммитит declaration и materialization.
3. Boundary выпускает Actor/Process consequences и `runtime/matrix` bootstrap.
4. Matrix строит packed `gravity/strong/weak` и выпускает начальный Photon.
5. External Field mutation проходит canonical Boundary path.
6. Process-bound State выпускает Photon с `processExecutionId`.
7. Energy claim-ит Process через Z и получает frozen fields.
8. Energy возвращает W proposal.
9. Boundary валидирует execution identity и declared write set.
10. Только после atomic commit Boundary выпускает consequences и W acknowledgment.
11. Matrix снимает lock и повторно выполняет Weak.
12. Активные Reaction проходят через Energy и тот же canonical world writer.

## Наблюдаемость

```text
METAFOR_LOG_IMPULSES=0
METAFOR_LOG_IMPULSES=compact
METAFOR_LOG_IMPULSES=full
```

Фильтры:

```text
METAFOR_LOG_DOMAINS=force,boundary,matrix,energy
METAFOR_LOG_PARTS=inflaton,graviton,gluon,higgs,photon,z,w+,w-
```

Логи являются наблюдаемостью transport, но не заменяют будущую нативную
эволюционную Летопись.

## Проверка

```bash
bun run test:runtime-launch
bun run test:runtime-universe
bun test boundary/runtime/matrix.spec.ts
bun test boundary/input.spec.ts
bun test boundary/execution.spec.ts
bun test boundary/reaction.spec.ts
bun test matrix/matrix.spec.ts
bun test matrix/runtime.parity.spec.ts
bun test matrix/weak/tests/weak.cpu.test.ts
bun test matrix/weak/tests/weak.gpu.test.ts
bun test matrix/weak/tests/weak.parity.test.ts
bun test energy/energy.spec.ts
bun test energy/reaction.spec.ts
bun run tsc --noEmit
```

GitHub Actions выполняет CPU reference/typecheck отдельно от строгого WebGPU job.
Оба backend должны давать одинаковую последовательность State, lock, frozen
fields и Photon.

## Изоляция

Production domains общаются только через Force. Сквозные tests запускают новые
processes и временную Boundary database. Test-only чтение SQLite допустимо только
для assertions и не становится runtime API.

Исторический код до очистки сохранён в ветке:

```text
archive/pre-core-split-2026-07-11
```
