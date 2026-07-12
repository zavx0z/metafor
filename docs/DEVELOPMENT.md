# Разработка MetaFor

Этот документ описывает только активное ядро и его воспроизводимую проверку.
Исторические product shells не участвуют в сборке и запуске.

## Домены

| Domain   | Port | Entry                |
| -------- | ---- | -------------------- |
| Force    | 4000 | `force/server.ts`    |
| Boundary | 4001 | `boundary/server.ts` |
| Dark     | 4002 | `dark/server.ts`     |
| Matrix   | 4003 | `matrix/server.ts`   |
| Bulk     | 4004 | `bulk/server.ts`     |
| Energy   | 4005 | `energy/server.ts`   |

Основной причинный контур:

```text
Dark → Inflaton → Force → Boundary
Boundary → Matrix / Energy / Bulk consequences
Matrix gravity → strong → weak
Matrix → Photon
Energy ↔ Z claim/copy
Energy → W proposal
Boundary → canonical commit → Gluon/Higgs → W acknowledgment
```

Boundary является единственной канонической materialized persistence. Matrix,
Energy и Bulk не читают Boundary SQLite напрямую.

## Запуск

Минимальный runtime без Bulk:

```bash
bun run runtime
```

С полными Impulse logs:

```bash
bun run runtime:logs
```

Backend Matrix:

```bash
bun run runtime:cpu
bun run runtime:gpu
```

`runtime:gpu` является строгим режимом и завершается ошибкой без WebGPU. Default
режим `auto` предпочитает WebGPU и использует CPU только как fallback.

Полный контур с Bulk:

```bash
bun run force
```

## Загрузка Meta

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
5. Gluon/Higgs обновляют packed heap.
6. Process-bound State выпускает Photon с `processExecutionId`.
7. Energy claim-ит Process через Z и получает frozen fields.
8. Energy возвращает W proposal.
9. Boundary валидирует execution identity и declared write set.
10. Только после atomic commit Boundary выпускает field consequences и W acknowledgment.
11. Matrix снимает lock и повторно выполняет Weak.

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
bun run test:runtime-universe
bun test boundary/runtime/matrix.spec.ts
bun test matrix/matrix.spec.ts
bun test matrix/runtime.parity.spec.ts
bun test matrix/weak/tests/weak.cpu.test.ts
bun test matrix/weak/tests/weak.gpu.test.ts
bun test matrix/weak/tests/weak.parity.test.ts
bun test energy/energy.spec.ts
bun run tsc --noEmit
```

GitHub Actions выполняет CPU reference/typecheck отдельно от строгого WebGPU job.
Оба backend должны давать одинаковую последовательность State, lock, frozen
fields и Photon.

## Изоляция

Production domains общаются только через Force. Сквозные tests запускают новые
processes и временную Boundary database. Test-only чтение SQLite допустимо только
для assertions и не становится runtime API.

Исторический код до очистки сохранён в ветке
`archive/pre-core-split-2026-07-11`.
