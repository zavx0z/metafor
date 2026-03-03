# @boundary/monad

Минимальный конечный автомат (модуль).

## API

### `createMonad(config: MonadConfig): string`

```typescript
import { createMonad } from "@boundary/monad"

const id = createMonad({
  fields: { hp: { type: "number" } },
  params: { hp: 100 },
  superposition: {
    IDLE: { PATROL: { hp: { gt: 50 } } },
    PATROL: null,
  },
  intentions: {
    PATROL: "patrolProcess",
  },
})
```

**Важно:** Параметр `state` **не требуется**. Монада рождается в неопределённом состоянии (`undefined`). При первом вызове `updateBoundary()` происходит переход из `undefined` в первое состояние суперпозиции.

### `updateBoundary(): Promise<BraneStateChange[]>`

```typescript
import { updateBoundary } from "@boundary/monad"

const changes = await updateBoundary()
// changes = [{ monadId, oldState: undefined, newState: "IDLE", intention: null }]
```

Возвращает массив изменений состояний. При первой инициализации `oldState === undefined`.

### `updateMonads(updates: MonadUpdate[]): Promise<BraneStateChange[]>`

```typescript
import { updateMonads } from "@boundary/monad"

// Обновить одну монаду
await updateMonads([{ id, fields: { hp: 80 } }])

// Обновить несколько
await updateMonads([
  { id: id1, fields: { hp: 80 } },
  { id: id2, fields: { mana: 50 } },
])

// С блокировкой переходов
await updateMonads([{ id, fields: { hp: 80 }, lock: true }])

// Разблокировать
await updateMonads([{ id, fields: { hp: 80 }, lock: false } }])
```

### `onStateChange(callback): void`

```typescript
import { onStateChange } from "@boundary/monad"

onStateChange((changes) => {
  for (const { monadId, oldState, newState, intention, params } of changes) {
    if (oldState === undefined) {
      console.log(`[INIT] ${monadId} → ${newState}`)
    } else {
      console.log(`${monadId}: ${oldState} → ${newState}`)
    }
  }
})
```

### `deleteMonad(id): void`

```typescript
import { deleteMonad } from "@boundary/monad"

deleteMonad(id)
```

## Блокировка переходов

```typescript
// Блокировать на один вызов
await updateMonads([{ id, fields: { hp: 80 }, lock: true }])

// Lock флаг сохраняется до явной смены
await updateMonads([{ id, fields: { hp: 80 } }])  // Всё ещё заблокирована

// Разблокировать
await updateMonads([{ id, fields: { hp: 80 }, lock: false }])
```

## Тесты

```bash
bun test
```
