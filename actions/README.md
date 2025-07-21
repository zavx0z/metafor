# @metafor/actions

Chain API для описания действий автомата и вспомогательные типы.

## Пример использования

```ts
import { ActionType, createActionsConfig } from "@metafor/actions"

const actionsConfig = createActionsConfig((action) => ({
  guest: action(({ context }) => ({ name: context.name }))
    .success(({ update, data }) => update({ name: data.name }))
    .error(({ update, error }) => update({ name: error.message })),
}))
```

## Документация

См. JSDoc/TypeDoc в исходном коде.
