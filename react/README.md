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
      .filter({
        tag: "other_component", // фильтр по тегу компонента
        op: "add", // фильтр по операции патча
        path: "/context", // фильтр по пути патча
        value: "expected_value" // фильтр по значению
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

Объект с декларативными условиями фильтрации:

- `tag` - фильтр по тегу компонента (meta.tag)
- `index` - фильтр по индексу сообщения (meta.index)
- `timestamp` - фильтр по временной метке (meta.timestamp)
- `op` - фильтр по операции патча ("replace" | "add" | "remove" | "test")
- `path` - фильтр по пути патча ("/context" | "/state" | "/")
- `value` - фильтр по значению патча

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
      .filter({ tag: "counter" })
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
      .filter({ op: "replace", path: "/state" })
      .equal(({ context, state }) => {
        console.log(`State changed to: ${state}`)
      }),
  ],
])
```

### Сложная фильтрация

```typescript
.reactions((reaction) => [
  [
    ["idle", "active"],
    reaction({ title: "specific_update" })
      .filter({ 
        tag: "user_component", 
        op: "replace", 
        path: "/context",
        value: { name: "John" }
      })
      .equal(({ update }) => {
        update({ userUpdated: true })
      }),
  ],
])
```
