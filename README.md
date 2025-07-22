# MetaFor

**MetaFor** — это фреймворк для декларативного создания web-компонентов-акторов на основе конечных автоматов с типизированным контекстом, автоматическими переходами и цепочкой действий. Подходит для построения сложных UI- и бизнес-процессов с прозрачной логикой переходов и строгой типизацией.

---

## Установка

```sh
bun add @zavx0z/metafor
```

---

## Быстрый старт (пример: регистрация пользователя)

```js
import { MetaFor } from "@zavx0z/metafor"

MetaFor("register")
  .context((types) => ({
    name: types.string.required(""),
    email: types.string.required(""),
    error: types.string.optional(),
    isRegistered: types.boolean.required(false),
  }))
  .states({
    form: { loading: { name: { length: { min: 2 } }, email: { pattern: /@/ } } },
    loading: {
      success: { isRegistered: true },
      error: { error: { notEq: "" } },
    },
    success: { form: {} },
    error: { form: {} },
  })
  .actions((action) => ({
    loading: action(async ({ context }) => {
      // имитация асинхронного запроса
      if (context.email === "fail@example.com") throw new Error("Email уже занят")
      await new Promise((r) => setTimeout(r, 500))
      return { name: context.name }
    })
      .success(({ update, data }) => update({ isRegistered: true, error: "" }))
      .error(({ update, error }) => update({ error: error.message, isRegistered: false })),
    success: action(({ context }) => null).success(({ update }) =>
      update({ name: "", email: "", isRegistered: false })
    ),
    error: action(({ context }) => null).success(({ update }) => update({ error: "" })),
  }))
```

---

## Основные возможности

- **Web-компоненты-акторы**: каждый автомат инкапсулирован в собственный web-компонент
- **Типобезопасный контекст**: строгая схема состояния с поддержкой типов, значений по умолчанию и заголовков
- **Автоматические переходы**: переходы между состояниями происходят на основе условий в контексте
- **Декларативные действия**: действия и обработчики успеха/ошибки описываются цепочкой (chain API)
- **Иммутабельность и подписка на изменения**: контекст нельзя изменить напрямую, только через update; поддержка подписки на изменения (onUpdate)
- **Гибкая архитектура**: разделение переходов (StateConfig) и действий (ActionsConfig)
- **Тестируемость**: модульные тесты на bun:test

---

## Уникальность подхода

**MetaFor** — единственная публичная акторная система, в которой переходы между состояниями происходят автоматически на основании изменений контекста, **без необходимости явно отправлять сообщения или события** для смены состояния.

В классических акторных моделях (Erlang, Akka, Orleans) и популярных FSM-фреймворках (например, XState) переходы инициируются только через сообщения или события (`send('EVENT')`). В MetaFor всё управление осуществляется декларативно: вы описываете условия переходов через схему контекста, и автомат сам реагирует на изменения данных. Это делает логику прозрачной, реактивной и минимизирует boilerplate-код.

**Ключевая особенность:**
Переходы между состояниями полностью зависят от текущего контекста — если условия выполнены, автомат сам сменит состояние, без явных команд или событий.

---

## Структура API

### 1. context(types => schema)

Регистрация схемы контекста (описание структуры состояния).

**Пример формирования контекста и поддерживаемые типы:**

```js
.context((types) => ({
  name: types.string.required("Гость"),           // обязательная строка с дефолтом
  age: types.number.optional(),                   // необязательное число (null по умолчанию)
  isActive: types.boolean.required(true),         // обязательный boolean
  role: types.enum("user", "admin").required("user"), // enum с дефолтом
  tags: types.array.optional(),                   // необязательный массив
}))
```

**Типы:**

- `types.string.required(default?)` / `types.string.optional(default?)`
- `types.number.required(default?)` / `types.number.optional(default?)`
- `types.boolean.required(default?)` / `types.boolean.optional(default?)`
- `types.enum(...values).required(default?)` / `types.enum(...values).optional(default?)`
- `types.array.required(default?)` / `types.array.optional(default?)`

**Особенности:**

- `required` — поле обязательно, всегда имеет значение (никогда не null)
- `optional` — поле может быть null, если не задано явно
- Можно указывать значения по умолчанию
- Все поля доступны для чтения через объект `context` внутри action:

  ```js
  action(({ context }) => {
    // context.name, context.age, context.isActive, context.role, context.tags
  })
  ```

### 2. states({ ... })

Описание переходов между состояниями автомата. Ключи — имена состояний, значения — карта переходов:

```js
.states({
  form: { loading: { name: { length: { min: 2 } }, email: { pattern: /@/ } } },
  loading: {
    success: { isRegistered: true },
    error: { error: { notEq: "" } },
  },
  success: { form: {} },
  error: { form: {} },
})
```

### 3. actions(action => ({ ... }))

Декларация действий и обработчиков для нужных состояний:

- **action** — основная функция действия. Получает только `{ context }`. Здесь нельзя изменять состояние, только читать данные и возвращать результат (или промис).
- **success** — обработчик успешного завершения действия. Получает `{ update, data }`. Здесь можно обновлять контекст через `update`.
- **error** — обработчик ошибок. Получает `{ update, error }`. Здесь можно обновлять контекст через `update`.

**Пример:**

```js
actions((action) => ({
  loading: action(async ({ context }) => {
    // только чтение context, асинхронная логика
    return { name: context.name }
  })
    .success(({ update, data }) => update({ isRegistered: true }))
    .error(({ update, error }) => update({ error: error.message })),
  success: action(({ context }) => null).success(({ update }) => update({ name: "", email: "", isRegistered: false })),
  error: action(({ context }) => null).success(({ update }) => update({ error: "" })),
}))
```

---

## Подробнее по модулям

- [Контекст (context/)](context/README.md) — типобезопасные схемы, update, onUpdate, getSnapshot
- [Машина состояний (machine/)](machine/README.md) — описание переходов и автоматических переходов
- [Actions (actions/)](actions/README.md) — декларативное описание действий и chain API

---

## Лицензия

MIT
