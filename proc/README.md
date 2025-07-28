# Processes

Chain API для описания процессов автомата и вспомогательные функции.

## Обзор

Process Chain реализует декларативный и типобезопасный способ описания процессов автомата. Алгоритм работы следующий:

1. **process** — точка входа. Ты передаёшь опциональные параметры `title` и `description`, а затем вызываешь `action()` для добавления основной функции процесса.
2. **action** — добавляешь основную функцию процесса, которая принимает context и возвращает результат (или промис). Эта функция сохраняется как основной обработчик процесса.
3. **success** — опционально добавляешь обработчик успешного завершения. Каждый вызов success перезаписывает предыдущий handler. Handler получает update (функция для обновления контекста) и data (результат action).
4. **error** — опционально добавляешь обработчик ошибки. Каждый вызов error перезаписывает предыдущий handler. Handler получает update и error (Error).
5. **Цепочка** — каждый вызов success/error возвращает тот же chain-объект, что позволяет строить цепочку вызовов (process().action(...).success(...).error(...)).
6. **getResult** — возвращает итоговый объект с action, success, error, title, description (если они были заданы). Обычно вызывается автоматически внутри createActionsConfig для каждого процесса.
7. **createActionsConfig** — принимает builder-функцию, в которую передаётся фабрика process. Для каждого ключа builder возвращает chain-объект, из которого автоматически вызывается getResult. Итоговый объект содержит action, success, error, title, description для каждого процесса.

### Внутренняя механика

- Каждый chain-объект хранит ссылки на основной action, текущие success/error handler'ы и опциональные title/description.
- При каждом вызове success/error соответствующий handler перезаписывается.
- getResult собирает объект с action, success, error, title, description (если они были заданы).
- Типизация гарантирует, что data в success соответствует возвращаемому типу action, а update всегда строго типизирован.
- Если success/error не заданы — в итоговом объекте их не будет.

### Пример (пошагово)

```ts
const chain = process({ title: "my_process", description: "Описание процесса" })
  .action(({ context }) => context.name)
  .success(({ update, data }) => update({ name: data }))
  .error(({ update, error }) => update({ name: error.message }))

const result = chain.getResult()
// result: { action, success, error, title, description }
```

### Итог

- Ты описываешь только то, что нужно: process с опциональными параметрами, action, success, error.
- Вся логика построения и типизации — внутри chain API.
- Итоговый объект всегда валиден и типобезопасен.

## Пример использования

```ts
const actionsConfig = createActionsConfig((process) => ({
  guest: process({ title: "guest_process", description: "Процесс для гостя" })
    .action(({ context }) => ({ name: context.name }))
    .success(({ update, data }) => update({ name: data.name }))
    .error(({ update, error }) => update({ name: error.message })),
  loading: process()
    .action(({ context }) => ({ name: context.name }))
    .error(({ update, error }) => update({ name: error.message })),
  simple: process().action(({ context }) => context.name), // без обработчиков
}))
```

## Документация

См. JSDoc/TypeDoc в исходном коде.
