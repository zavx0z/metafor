# Аудит Процессного Протокола

Дата: 2026-06-30.
Ветка: `main`.

## Статус

Обычный рантайм-поток Force уже очищен:

- `gluon`: `path = actor ID`, `value.fields[fieldId]`
- `higgs`: `path = actor ID | WIMP SRC`, `value.fields[fieldId]`
- `photon`: `path = actor ID`

Оставшийся legacy-остров:

- `z`
- `w+`
- `w-`
- `applyWeakResultPacket`
- `collectWeakResultPackets`
- поток блокировки и результата процесса
- устаревшая адресация полей в процессе

## Что Нельзя Переносить В Новый Процессный Протокол

- `/field/...`
- `/wimp/.../process/...`
- `wimpId` как имя идентичности actor
- `fieldParticleId` как Force-адрес
- адресация по key/order

## Текущий Долг

Проверить и мигрировать протокол результатов процесса так, чтобы:

- `path = actor ID`
- `processId` остаётся отдельным ID процесса
- набор записываемых результатов использует `value.fields[fieldId]`
- Matrix проверяет блокировку по actor/brane и активному process-bound state
- Matrix не читает Boundary/SQLite
- `Energy` исполняет process и испускает `w+`/`w-`; текущий пакет пока является
  bridge/protocol shell

## Целевая Форма

Matrix принимает и проверяет результат процесса. `Energy` является
распределённым исполнителем: он слушает photons/process tasks Matrix, проверяет
`env`/`mass`, claim-ит процесс через `z`, исполняет action и возвращает
`w+`/`w-`. Текущий пакет `energy/` пока фиксирует server bridge и целевые
result helpers, но не исполняет реальные DSL actions.
В server-dev контуре Matrix уже живёт отдельным process `matrix/server.ts` и
получает snapshot/Force через AppWeb bridge `/matrix/ws`.

Захват/управление процессом:

```json
{
  "part": "z",
  "op": "test",
  "path": 17,
  "value": {
    "kind": "claim",
    "processId": 42,
    "token": "run-1"
  }
}
```

Успешное завершение процесса:

```json
{
  "part": "w+",
  "op": "replace",
  "path": 17,
  "processId": 42,
  "value": {
    "fields": {
      "2": "done"
    }
  }
}
```

Ошибка процесса:

```json
{
  "part": "w-",
  "op": "replace",
  "path": 17,
  "processId": 42,
  "value": {
    "error": "failed"
  }
}
```

## Файлы Для Следующего Аудита

- `matrix/matrix.ts`
- `matrix/weak/*`
- `energy/server.ts`
- `energy/server-bridge.ts`
- `app/web/energy-bridge.ts`
- `bulk/weak/*`
- `bulk/em/index.ts`
- `app/web/runtime/bulk.process.ts`
- `app/web/runtime/bulk.process.spec.ts`
- `docs/proto/weak.md`
- `docs/FORCE.md`
