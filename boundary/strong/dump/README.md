# @boundary/strong/dump

Dump-проекция сериализации и восстановления boundary-снимков внутри `Boundary × Strong`.

Канонический пакет:

```ts
import { serializeBoundaryState, restoreBoundaryState } from "@boundary/strong"
```

Публичный вход dump-проекции:

```ts
import { serializeBoundarySnapshot, deserializeBoundarySnapshot } from "@boundary/strong/dump"
```

Для нового кода владельцем снимка остаётся `@boundary/strong`, а `dump` здесь является его dump-проекцией.
