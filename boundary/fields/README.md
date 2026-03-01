# @boundary/fields

Оркестрация данных для GPU-эволюции суперпозиций.

## API

### `write(data: Data): Promise<[number, number][]>`

```typescript
import { write, FieldType } from "@boundary/fields"

const initialStates = await write({
  fields: [{ type: FieldType.F32 }],
  branes: [{
    params: [[0, 100]],
    state: 0,
    collapses: [[[1, { 0: { gt: 50 } }]], [null]],
  }],
})
```

### `update(updates, lockedBranes?): Promise<[number, number][]>`

```typescript
import { update } from "@boundary/fields"

// Обновление полей
await update([[0, [{ fieldIndex: 0, value: 100 }]]])

// С блокировкой переходов
await update([[0, [{ fieldIndex: 0, value: 100 }]]], [0])
```

## Блокировка переходов

```typescript
// Заблокировать браны на один update()
await update(updates, [0, 2])

// Блокировка снимается автоматически
await update(updates)
```

## Тесты

```bash
bun test
```
