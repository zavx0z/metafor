# Реакции

Реакции позволяют компонентам реагировать на изменения в других компонентах через систему сообщений.

## Chain API

Реакции используют chain API для удобного создания:

```typescript
MetaFor("parent")
  .context((types) => ({
    childAdded: types.boolean.optional(),
  }))
  .states({
    state_1: {},
  })
  .core()
  .actions()
  .reactions((filter) => [
    [
      ["state_1"],
      filter(({ meta, patch }) => {
        return meta.tag === "child" && patch.op === "add"
      }).equal(({ update }) => {
        update({ childAdded: true })
      }),
    ],
  ])
  .view({
    render: ({ html, context }) => html`<div>${context.childAdded}</div>`,
  })
```

## Структура

Реакция состоит из:

- **Состояния** - массив состояний, в которых реакция активна
- **Фильтр** - функция, определяющая, когда реакция должна сработать
- **Обновление** - функция, выполняемая при срабатывании реакции

## Параметры фильтра

```typescript
filter(({ meta, patch, context, state }) => {
  // meta - метаданные сообщения
  // patch - изменения в контексте
  // context - текущий контекст
  // state - текущее состояние
  return true // или false
})
```

## Параметры обновления

```typescript
equal(({ update, context, core, meta, patch, state }) => {
  // update - функция для обновления контекста
  // context - текущий контекст
  // core - дополнительные данные
  // meta - метаданные сообщения
  // patch - изменения в контексте
  // state - текущее состояние
  update({ someField: true })
})
```
