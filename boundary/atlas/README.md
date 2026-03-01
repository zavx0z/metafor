# @boundary/atlas

Система интернирования строк для GPU.

## API

### `getStringAtlas(): StringAtlas`

```typescript
import { getStringAtlas } from "@boundary/atlas"

const atlas = getStringAtlas()
const { id, hash } = atlas.intern("example")
```

### `resetStringAtlas(): void`

```typescript
import { resetStringAtlas } from "@boundary/atlas"

resetStringAtlas()
```

## Тесты

```bash
bun test
```
