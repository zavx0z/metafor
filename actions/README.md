# @metafor/actions

Chain API для описания действий автомата и вспомогательные типы.

## Как работает Action Chain (алгоритм)

Action Chain реализует декларативный и типобезопасный способ описания действий автомата. Алгоритм работы следующий:

1. **action** — точка входа. Ты передаёшь функцию, которая принимает context и возвращает результат (или промис). Эта функция сохраняется как основной обработчик действия.
2. **success** — опционально добавляешь обработчик успешного завершения. Каждый вызов success перезаписывает предыдущий handler. Handler получает update (функция для обновления контекста) и data (результат action).
3. **error** — опционально добавляешь обработчик ошибки. Каждый вызов error перезаписывает предыдущий handler. Handler получает update и error (Error).
4. **Цепочка** — каждый вызов success/error возвращает тот же chain-объект, что позволяет строить цепочку вызовов (action(...).success(...).error(...)).
5. **getResult** — возвращает итоговый объект с action, success, error (если они были заданы). Обычно вызывается автоматически внутри createActionsConfig для каждого действия.
6. **createActionsConfig** — принимает builder-функцию, в которую передаётся фабрика action. Для каждого ключа builder возвращает chain-объект, из которого автоматически вызывается getResult. Итоговый объект содержит action, success, error для каждого действия.

### Внутренняя механика

- Каждый chain-объект хранит ссылки на основной action и текущие success/error handler'ы.
- При каждом вызове success/error соответствующий handler перезаписывается.
- getResult собирает объект с action, success, error (если они были заданы).
- Типизация гарантирует, что data в success соответствует возвращаемому типу action, а update всегда строго типизирован.
- Если success/error не заданы — в итоговом объекте их не будет.

### Пример (пошагово)

```ts
const chain = action(({ context }) => context.name)
  .success(({ update, data }) => update({ name: data }))
  .error(({ update, error }) => update({ name: error.message }))

const result = chain.getResult()
// result: { action, success, error }
```

### Итог

- Ты описываешь только то, что нужно: action, success, error.
- Вся логика построения и типизации — внутри chain API.
- Итоговый объект всегда валиден и типобезопасен.

## Пример использования

```ts
const actionsConfig = createActionsConfig((action) => ({
  guest: action(({ context }) => ({ name: context.name }))
    .success(({ update, data }) => update({ name: data.name }))
    .error(({ update, error }) => update({ name: error.message })),
  loading: action(({ context }) => ({ name: context.name })).error(({ update, error }) =>
    update({ name: error.message })
  ),
  simple: action(({ context }) => context.name), // без обработчиков
}))
```

## Документация

См. JSDoc/TypeDoc в исходном коде.
