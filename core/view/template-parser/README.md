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

## Логика обработки интерполяций

### Простые интерполяции (вне массивов)

- `${context.name}` → `{ src: "context", key: "name" }`
- `${core.settings}` → `{ src: "core", key: "settings" }`

### Интерполяции внутри массивов

- `${item.property}` → `{ src: "item", key: "property" }`
- `${id}` (простая переменная) → `{ src: "item" }`

### Обработка массивов

1. Парсер находит `${context.items.map((item) => html\`...\`)}`
2. Извлекает шаблон элемента: все между html\`...\`
3. В шаблоне элемента заменяет интерполяции на плейсхолдеры
4. Сохраняет информацию об источнике данных для каждой интерполяции
5. Парсит HTML структуру и восстанавливает правильные источники данных

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