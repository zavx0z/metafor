# @boundary/dump

Сериализация и десериализация состояния Matrix.

## API

### `serializeMatrix(state): string`

```typescript
import { serializeMatrix } from "@boundary/dump"

const json = serializeMatrix(state)
```

### `deserializeMatrix(json): MatrixState`

```typescript
import { deserializeMatrix } from "@boundary/dump"

const state = deserializeMatrix(json)
```

## Тесты

```bash
bun test
```
