# @boundary/dump

Сериализация и десериализация состояния Matrix.

## API

### `serializeMatrix(state): Uint8Array`

```typescript
import { serializeMatrix } from "@boundary/dump"

const data = serializeMatrix(state)
```

### `deserializeMatrix(data): MatrixState`

```typescript
import { deserializeMatrix } from "@boundary/dump"

const state = deserializeMatrix(data)
```

## Пример

```typescript
import { serializeMatrix, deserializeMatrix } from "@boundary/dump"

// Сохранение
const data = serializeMatrix(state)

// Восстановление (lock флаги восстанавливаются автоматически)
const restored = deserializeMatrix(data)
```

## Тесты

```bash
bun test
```
