# @boundary/monad

Минимальный конечный автомат (модуль).

## API

### `createMonad(config: MonadConfig): string`

```typescript
import { createMonad } from "@boundary/monad"

const id = createMonad({
  fields: { hp: { type: "number" } },
  params: { hp: 100 },
  state: "IDLE",
  superposition: {
    IDLE: { PATROL: { hp: { gt: 50 } } },
    PATROL: null,
  },
  actions: {
    PATROL: () => console.log("Patrol"),
  },
})
```

### `updateBoundary(): Promise<void>`

```typescript
import { updateBoundary } from "@boundary/monad"

await updateBoundary()
```

### `updateMonads(updates: MonadUpdate[]): Promise<void>`

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

// Разблокировать без изменений
await updateMonads([{ id, fields: {} }])
```

### `onStateChange(callback): void`

```typescript
import { onStateChange } from "@boundary/monad"

onStateChange((monadId, old, current) => {
  console.log(`${old} → ${current}`)
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

// Снять блокировку
await updateMonads([{ id, fields: {} }])
```

## Тесты

```bash
bun test
```
