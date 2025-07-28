# Reactions

Реакции позволяют компонентам реагировать на сообщения от других компонентов или внутренние изменения состояния.

## API

Реакции создаются через chain API:

```typescript
.reactions((reaction) => [
  [
    ["state1", "state2"], // состояния, в которых реакция активна
    reaction({
      title: "reaction_name", // название реакции
      description: "Описание реакции" // опциональное описание
    })
      .filter(({ meta, patch, context, state }) => {
        // условие активации реакции
        return meta.tag === "other_component" && patch.op === "add"
      })
      .equal(({ update, context, core, meta, patch, state }) => {
        // обновление контекста при активации реакции
        update({ someValue: context.someValue + 1 })
      }),
  ],
])
```

## Параметры

### reaction(config)

- `title` (обязательный) - название реакции
- `description` (опциональный) - описание реакции

### filter

Функция фильтрации, определяющая когда должна сработать реакция:

- `meta` - метаданные сообщения
- `patch` - патч изменений
- `context` - текущий контекст компонента
- `state` - текущее состояние компонента

### equal

Функция обновления, выполняемая при срабатывании реакции:

- `update` - функция обновления контекста
- `context` - текущий контекст компонента
- `core` - дополнительные данные
- `meta` - метаданные сообщения
- `patch` - патч изменений
- `state` - текущее состояние компонента

## Примеры

### Простая реакция

```typescript
.reactions((reaction) => [
  [
    ["idle"],
    reaction({ title: "increment" })
      .filter(({ meta }) => meta.tag === "counter")
      .equal(({ update, context }) => {
        update({ value: context.value + 1 })
      }),
  ],
])
```

### Реакция с описанием

```typescript
.reactions((reaction) => [
  [
    ["active", "loading"],
    reaction({
      title: "log_state_change",
      description: "Логирует изменения состояния компонента"
    })
      .filter(({ patch }) => patch.op === "replace" && patch.path === "/state")
      .equal(({ context, state }) => {
        console.log(`State changed to: ${state}`)
      }),
  ],
])
```
