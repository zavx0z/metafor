# Template Parser

Модуль для парсинга HTML шаблонов MetaFor в JSON схемы.

## Возможности

- ✅ Парсинг HTML элементов и атрибутов
- ✅ Обработка интерполяций `${...}`
- ✅ Поддержка массивов из `context` и `core`
- ✅ Вложенные элементы и смешанный контент
- ✅ Самозакрывающиеся теги
- ✅ Атрибуты с дефисами (`data-*`, `aria-*`)
- ✅ Сериализуемый JSON формат
  // ... existing code ...
- ✅ Условные атрибуты: тернарный оператор и логическое И, в т.ч. без знака `=` и в массивах
- ✅ Условия элементов (`cond`) с операторами сравнения: `===`, `!==`, `>`, `>=`, `<`, `<=`
- ✅ Сравнения значений между `context`/`core`/`item`
- ✅ События `on*`: парсинг и сериализация обработчиков в строку, поддержка синтаксиса без кавычек и стрелочных функций

## Использование

### Быстрый старт

```typescript
import { parseTemplate } from "./template-parser/index.ts"

const schema = parseTemplate(`<div class="container">
  <h1>Hello World</h1>
  <p>${context.message}</p>
</div>`)
```

### Класс парсера

```typescript
import { TemplateParser } from "./template-parser/index.ts"

const parser = new TemplateParser()
const schema = parser.parseHtmlToSchema(htmlString)
```

## Расширения парсинга

### Условные атрибуты

Поддерживаются оба варианта задания условных атрибутов:

- Через тернарный оператор:

```html
<button disabled="${context.isDisabled ? 'disabled' : ''}">...</button>
```

- Через логическое И, в т.ч. без знака `=`:

```html
<button ${context.isDisabled && "disabled"}>...</button>
```

Результат нормализуется в `attrs["disabled"]` со схемой типа `conditional`:

```typescript
{
  type: "el",
  tag: "button",
  attrs: {
    disabled: { type: "conditional", trueValue: "disabled", falseValue: "" }
  }
}
```

Работает одинаково внутри элементов массивов и на самозакрывающихся тегах.

### Условия элементов (`cond`)

Поддерживаются сравнения со статическими значениями и между полями из разных источников:

- Операторы: `===`, `!==`, `>`, `>=`, `<`, `<=`
- Источники: `context`, `core`, `item`

Пример выражения в шаблоне:

```html
${context.count > 0 && html`<span>...</span>`} ${context.role === core.requiredRole && html`
<div>...</div>
`}
```

В схеме условие представлено как `cond` с нормализованными полями:

```typescript
{
  type: "el",
  tag: "span",
  cond: { src: "context", key: "count", gt: 0 }
}

{
  type: "el",
  tag: "div",
  cond: { src: "context", key: "role", eq: { src: "core", key: "requiredRole" } }
}
```

### События `on*`

Парсер извлекает исходную строку обработчика и сериализует её в `attrs`:

- Поддерживаются обе формы записи:
  - с кавычками: `onclick="${context.onClick}"`
  - без кавычек: `onclick=${context.onClick}`
- Поддерживаются стрелочные функции: `onclick=${(e) => doSomething(e)}`
- Работает на обычных и самозакрывающихся тегах, а также внутри массивов

Пример:

```html
<button onclick="${()" ="">console.log('hi')}>OK</button>
```

Схема:

```typescript
{
  type: "el",
  tag: "button",
  attrs: {
    onclick: "${() => console.log('hi')}"
  }
}
```

## Логика обработки интерполяций

### Простые интерполяции (вне массивов)

- `${context.name}` → `{ src: "context", key: "name" }`
- `${core.settings}` → `{ src: "core", key: "settings" }`
- `${core.user.name}` → `{ src: "core", key: ["user", "name"] }` ← составные ключи всегда массив

### Интерполяции внутри массивов (адресация путями и ${VALUE})

- Источник для элементов массива — не `item`, а путь от корня до текущего уровня:
  - 1-й уровень: `["context", "items"]` или `["core", "list"]`
  - 2-й уровень: `["context", "items", "children"]`, и т.д.

- Текстовые узлы:
  - `${item.name}` → `{ src: ["context", "items"], key: "name" }`
  - `${child}` (вложенный item целиком) → `{ src: ["core", "items", "children"] }`

- Атрибуты внутри элементов массивов:
  - Простая интерполяция: `data-id="${item.id}"` → `{ src: ["context", "items"], key: "id" }`
  - Смешанный контент: `class="item-${item.type}"` → `{ src: ["context", "items"], key: "type", result: "item-${VALUE}" }`
  - Если в значении несколько `${item.*}`, все они нормализуются в `result` как `${VALUE}`.

- Условные атрибуты внутри массивов:
  - `${item.flag && 'x'}` → `{ src: [путь], key: "flag", trueValue: "x", type: "conditional" }`
  - `${item.flag ? 'a' : 'b'}` → `{ src: [путь], key: "flag", trueValue: "a", falseValue: "b", type: "conditional" }`
  - В смешанных значениях условные подстановки в `result` также переводятся к `${VALUE}`.

### Обработка массивов (в том числе вложенных)

1. Парсер находит `${context.items.map((item) => html\`...\`)}`
2. Извлекает шаблон элемента: все между html\`...\`
3. В шаблоне элемента заменяет интерполяции на плейсхолдеры
4. Сохраняет информацию об источнике данных для каждой интерполяции
5. Парсит HTML структуру и восстанавливает источники данных
   - Для 1-го уровня: `src: ["context", "items"]`
   - Для вложенных уровней: путь накапливается: `src: ["context", "items", "children", ...]`
   - Для дочернего массива внутри элемента: `item: { src: [путь до родителя], key: "<вложенный-массив>" }`
   - Для текстов: весь элемент → без `key`, поле элемента → с `key`
   - Для атрибутов: `src` — путь, `key` — поле, `result` — с `${VALUE}`

## Форматы схем

**Принципы:**

- `attrs` включается только если есть атрибуты (не пустой объект)
- `child` включается только если есть дочерние элементы
- `item` включается только для элементов массивов

### Простой элемент

```typescript
{
  tag: "div",
  type: "el",
  attrs: { class: "container" },  // только если есть атрибуты
  child: [
    { type: "text", value: "Hello" }
  ]
}
```

### Массив из контекста

```typescript
{
  tag: "ul",
  type: "el",
  child: [
    {
      tag: "li",
      type: "el",
      item: { src: "context", key: "items" },
      child: [
        { type: "text", value: { src: "item" } }
      ]
    }
  ]
}
```

### Интерполяция

```typescript
// Простая переменная без ключа (например, ${id})
{
  type: "text",
  value: { src: "item" }
}

// Переменная с ключом (например, ${item.name})
{
  type: "text",
  value: { src: "item", key: "name" }
}

// Интерполяция вне массива (например, ${context.title})
{
  type: "text",
  value: { src: "context", key: "title" }
}

// Составной ключ вне массива
{
  type: "text",
  value: { src: "core", key: ["profile", "info", "title"] }
}
```

## Типы

См. `index.t.ts` для полного описания типов:

- `Schema` - схема всего шаблона
- `ElementSchema` - схема HTML элемента
- `TextSchema` - схема текстового узла
- `ArrayInfo` - информация о массивах

## Тесты

Комплексные тесты находятся в каталоге `core/view/template-parser/test/`:

- `arrays.spec.ts` — парсинг массивов
- `attr.boolean.spec.ts` — булевы атрибуты
- `attr.cond.spec.ts` — условные атрибуты (в т.ч. без `=` и в массивах)
- `attr.events.spec.ts` — события `on*`, стрелочные функции, синтаксис без кавычек
- `conditionals.spec.ts` — `cond` и операторы сравнения

Запуск всех тестов:

```sh
bun test core/view/template-parser/test/
```
