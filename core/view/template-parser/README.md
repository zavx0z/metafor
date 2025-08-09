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

## Форматы схем

### Простой элемент

```typescript
{
  tag: "div",
  type: "el",
  attrs: { class: "container" },
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
  attrs: {},
  child: [
    {
      tag: "li",
      type: "el",
      item: { src: "context", key: "items" },
      attrs: {},
      child: [
        { type: "text", value: { src: "item" } }
      ]
    }
  ]
}
```

### Интерполяция

```typescript
{
  type: "text",
  value: { src: "item" }  // для ${variable}
}
```

## Типы

См. `index.t.ts` для полного описания типов:

- `Schema` - схема всего шаблона
- `ElementSchema` - схема HTML элемента
- `TextSchema` - схема текстового узла
- `ArrayInfo` - информация о массивах

## Тесты

Модуль покрыт комплексными тестами:

- `test/parser.spec.ts` - основные функции парсера (11 тестов)
- `test/arrays.spec.ts` - специализированные тесты для массивов (10 тестов)

Запуск всех тестов: `bun test core/view/template-parser/test/`

Отдельные файлы:

- `bun test core/view/template-parser/test/parser.spec.ts`
- `bun test core/view/template-parser/test/arrays.spec.ts`
