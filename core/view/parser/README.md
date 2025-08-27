# HTML Parser

Мощный парсер HTML-шаблонов с поддержкой template literals, map операций, условий и событий. Парсер работает в несколько этапов: построение иерархии, извлечение атрибутов и обогащение данными.

## Архитектура

Парсер состоит из нескольких модулей:

1. **`splitter`** - извлекает токены элементов из HTML
2. **`hierarchy`** - строит иерархию элементов (`PartHierarchy`)
3. **`attributes`** - извлекает и парсит атрибуты (`PartAttrs`)
4. **`data`** - обогащает элементы данными (`Node[]`)

### Система типов

- **`hierarchy.t.ts`** - типы иерархии (`PartElement`, `PartMeta`, `PartCondition`, `PartMap`, `PartText`)
- **`attributes.t.ts`** - типы атрибутов (`PartAttrElement`, `PartAttrMeta`, `PartAttrCondition`, `PartAttrMap`)
- **`data.t.ts`** - типы парсинга данных (`ParseContext`, `ParseResult`, `ParseAttributeResult`)
- **`index.t.ts`** - финальные типы узлов (`NodeElement`, `NodeText`, `NodeMap`, `NodeCondition`, `NodeMeta`)

## Быстрый старт

```typescript
import { parse } from "./index.ts"

// Простой HTML с переменными
const result = parse(
  ({ html, context }) => html`
    <div class="${context.userStatus}">
      <h1>Hello ${context.userName}!</h1>
      <p>You have ${context.messageCount} messages</p>
    </div>
  `
)

console.log(result)
// [
//   {
//     type: "el",
//     tag: "div",
//     string: {
//       class: {
//         data: "/context/userStatus",
//         expr: "${0}"
//       }
//     },
//     child: [
//       {
//         type: "el",
//         tag: "h1",
//         child: [
//           {
//             type: "text",
//             data: "/context/userName",
//             expr: "Hello ${0}!"
//           }
//         ]
//       },
//       {
//         type: "el",
//         tag: "p",
//         child: [
//           {
//             type: "text",
//             data: "/context/messageCount",
//             expr: "You have ${0} messages"
//           }
//         ]
//       }
//     ]
//   }
// ]
```

## Основные возможности

### 1. Template Literals с переменными

```typescript
const result = parse(
  ({ html, context }) => html`
    <div class="${context.userStatus}">
      <span>${context.userName}</span>
      <p>${context.userBio || "No bio available"}</p>
    </div>
  `
)
```

### 2. Map операции для итерации

```typescript
const result = parse(
  ({ html, core }) => html`
    <ul>
      ${core.users.map(
        (user) => html` <li class="${user.active ? "active" : "inactive"}">${user.name} - ${user.email}</li> `
      )}
    </ul>
  `
)
```

### 3. Условные операторы

```typescript
const result = parse(
  ({ html, context }) => html`
    <div>
      ${context.isAdmin
        ? html` <button onclick=${() => core.adminPanel.open()}>Admin Panel</button> `
        : html` <span>Access denied</span> `}
    </div>
  `
)
```

### 4. События и динамические атрибуты

```typescript
const result = parse(
  ({ html, context, core }) => html`
    <button
      class="${context.isActive ? "active" : ""}"
      onclick=${() => core.handleClick(context.itemId)}
      ${!context.canEdit && "disabled"}>
      ${context.buttonText}
    </button>
  `
)
```

### 5. Функция update для обновления контекста

Парсер специально обрабатывает функцию `update`, извлекая ключи контекста, которые будут обновлены:

```typescript
const result = parse(
  ({ html, update, context }) => html`
    <button onclick=${() => update({ name: "John", age: 25, active: true })}>Update User</button>
  `
)
```

**Результат обработки:**

- `upd: ["name", "age", "active"]` - ключи контекста для обновления
- `expr: "() => update({ name: \"John\", age: 25, active: true })"` - исходное выражение
- Поле `data` отсутствует (нет путей к данным)

**Поддерживаемые форматы:**

- Обновление одного ключа: `update({ name: "John" })`
- Обновление нескольких ключей: `update({ name: "John", age: 25, active: true })`
- Обновление с динамическими значениями: `update({ count: context.count + 1 })`

### 6. Web Components

```typescript
const result = parse(
  ({ html, context, core }) => html`
    <my-component data=${core.userData} on-event=${() => core.handleEvent()}>
      <slot name="content">${context.defaultContent}</slot>
    </my-component>
  `
)
```

## API Reference

### `parse(render: Render): Node[]`

Основная функция парсера, которая принимает render-функцию и возвращает обогащенную иерархию.

#### Параметры

- `render` (Render) - Render-функция вида `({ html, context, core, state, update }) => html`...``

**Доступные параметры:**

- `html` - тег для создания HTML шаблонов
- `context` - объект контекста с простыми типами (string, number, boolean, плоские массивы)
- `core` - объект ядра с возможной вложенностью (сложные объекты, методы)
- `state` - строка состояния
- `update` - функция для обновления контекста (специально обрабатывается парсером)

#### Возвращает

Массив обогащенных узлов с метаданными о путях к данным, выражениях и статических значениях.

## Структура результата

Функция `parse` возвращает массив обогащенных узлов, где каждый узел содержит:

- **type** - тип узла: `"el"` (элемент), `"text"` (текст), `"map"` (итерация), `"cond"` (условие), `"meta"` (meta-элемент)
- **data?** - путь(и) к данным (для динамического контента, необязательное)
- **expr?** - унифицированное выражение с индексами (для сложных случаев, необязательное)
- **upd?** - ключи контекста для обновления (для update функций, необязательное)
- **value?** - статическое значение (для статического контента, необязательное)
- **child?** - дочерние узлы (для элементов, map, условий, необязательное)

### Атрибуты элементов

Элементы (`NodeElement`, `NodeMeta`) содержат атрибуты в следующих секциях:

- **event** - события (`onclick`, `onchange`, etc.)
- **boolean** - булевые атрибуты (`disabled`, `checked`, etc.)
- **string** - строковые атрибуты (`src`, `alt`, `href`, etc.)
- **array** - массивные атрибуты (`class`, `rel`, `accept`, etc.)
- **object** - объектные атрибуты (`style`, `context`, `core`)

### Различия между этапами обработки

#### После `extractAttributes()` (типы из `attributes.t.ts`):

```typescript
{
  string: {
    class: {
      type: "dynamic",
      value: "context.userStatus"
    }
  }
}
```

#### После `enrichWithData()` (типы из `index.t.ts`):

```typescript
{
  string: {
    class: {
      data: "/context/userStatus",
      expr: "${0}"
    }
  }
}
```

## Примеры использования

### Сложная структура с вложенными map

```typescript
const result = parse(
  ({ html, core }) => html`
    <div class="dashboard">
      ${core.departments.map(
        (dept) => html`
          <div class="department">
            <h2>${dept.name}</h2>
            ${dept.teams.map(
              (team) => html`
                <div class="team">
                  <h3>${team.name}</h3>
                  ${team.members.map(
                    (member) => html`
                      <div class="member ${member.active ? "active" : "inactive"}">
                        <span>${member.name}</span>
                        <button onclick=${() => member.handleClick(member.id)}>${member.buttonText}</button>
                      </div>
                    `
                  )}
                </div>
              `
            )}
          </div>
        `
      )}
    </div>
  `
)
```

### Условные атрибуты и события

```typescript
const result = parse(
  ({ html, context, core }) => html`
    <form>
      <input
        type="text"
        value="${context.userName}"
        class="${context.isValid ? "valid" : "invalid"}"
        oninput=${(e) => core.handleInput(e, context.userId)}
        ${context.required ? "required" : ""} />
      <button type="submit" disabled=${!context.canSubmit} onclick=${() => core.handleSubmit(context.formData)}>
        ${context.submitText}
      </button>
    </form>
  `
)
```

## Особенности

### Автоматическое разрешение путей

Парсер автоматически определяет правильные пути к данным в контексте map операций:

```typescript
// В контексте map((user) => ...)
// user.name -> [item]/name
// user.profile.avatar -> [item]/profile/avatar

// В контексте вложенного map
// dept.name -> ../../[item]/name
// team.id -> ../[item]/id
// member -> [item]
```

### Унифицированные выражения

Сложные выражения автоматически унифицируются для кэширования:

```typescript
// Исходное: ${user.active ? 'active' : 'inactive'}
// Результат: { data: "/user/active", expr: "${0} ? 'active' : 'inactive'" }

// Исходное: ${user.firstName} ${user.lastName}
// Результат: { data: ["/user/firstName", "/user/lastName"], expr: "${0} ${1}" }
```

### Поддержка событий

События парсятся с извлечением путей к данным:

```typescript
// Исходное: onclick=${() => handleClick(user.id)}
// Результат: { data: "/user/id", expr: "() => ${0}()" }
```

### Поток обработки данных

1. **`extractHtmlElements()`** → `ElementToken[]` (токены элементов)
2. **`makeHierarchy()`** → `PartHierarchy` (иерархия элементов)
3. **`extractAttributes()`** → `PartAttrs` (элементы с атрибутами)
4. **`enrichWithData()`** → `Node[]` (финальные узлы с данными)

## Лицензия

MIT
