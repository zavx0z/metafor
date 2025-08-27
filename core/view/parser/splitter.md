# Splitter HTML

Утилита для **сканирования HTML-строк** и извлечения тегов с их типами и позициями.
Главная идея — **анализ HTML-структуры без исполнения JavaScript-выражений**, выделение тегов и их классификацию.

> Проект используется локально, установка через npm не требуется. Все комментарии и JSDoc оформляются **на русском языке**.  
> В тестах — преимущественно **сравнение с объектом** (наглядный expected), модуль тестов обязан содержать **общий `describe`**.  
> Не оставляем мёртвый код.

---

## Когда это нужно

- Для статического анализа HTML-структуры без выполнения кода.
- Для инструментов валидации и линтинга HTML-шаблонов.
- Для извлечения метаданных о тегах (позиции, типы, имена).
- Для предварительной обработки HTML перед парсингом.

---

## Ключевые свойства

- **Без исполнения кода** — никакие выражения внутри `${...}` не вычисляются.
- **Сканирование тегов** — выделение всех HTML-тегов с их позициями и типами.
- **Классификация тегов** — определение типа тега (open/close/self/void).
- **Поддержка template literals** — корректная обработка `${...}` внутри атрибутов.
- **Namespace-теги** — поддержка тегов вида `svg:use`.
- **Валидация имён** — проверка корректности имён тегов.

---

## Ограничения входных данных

- **HTML-строка** — валидный HTML с возможными template literals `${...}`.
- **Template literals** — поддерживаются внутри атрибутов и текстового содержимого.
- **Комментарии и DOCTYPE** — игнорируются при сканировании.

---

## Быстрый старт

```ts
import { scanHtmlTags, extractMainHtmlBlock } from "./splitter.ts"

// Сканирование HTML-строки
const tokens = scanHtmlTags('<div class="test">Hello <span>world</span></div>')

console.log(tokens)
```

Результат:

```json
[
  { "text": "<div class=\"test\">", "index": 0, "name": "div", "kind": "open" },
  { "text": "<span>", "index": 25, "name": "span", "kind": "open" },
  { "text": "</span>", "index": 31, "name": "span", "kind": "close" },
  { "text": "</div>", "index": 38, "name": "div", "kind": "close" }
]
```

---

## API

### `scanHtmlTags(input: string, offset = 0): TagToken[]`

#### Параметры scanHtmlTags

- `input: string` — HTML-строка для сканирования
- `offset: number` — смещение для индексов (по умолчанию 0)

#### Возвращаемое значение scanHtmlTags

`TagToken[]` — массив токенов тегов. Каждый токен содержит:

```ts
type TagToken = {
  text: string // полный текст тега (включая атрибуты)
  index: number // позиция в исходной строке
  name: string // имя тега (в нижнем регистре)
  kind: TagKind // тип тега
}

type TagKind = "open" | "close" | "self" | "void"
```

### `extractMainHtmlBlock<T>(render: Render<T>): string`

#### Параметры extractMainHtmlBlock

- `render: Render<T>` — функция вида `({ html, context, core, state }) => html`...``

#### Возвращаемое значение extractMainHtmlBlock

`string` — сырой HTML-текст из template literal

---

## Поддерживаемые конструкции

### 1) Базовые HTML-теги

```ts
scanHtmlTags("<div>content</div>")
// [
//   { text: "<div>", index: 0, name: "div", kind: "open" },
//   { text: "</div>", index: 12, name: "div", kind: "close" }
// ]
```

### 2) Self-closing теги

```ts
scanHtmlTags('<img src="test.jpg" />')
// [
//   { text: '<img src="test.jpg" />', index: 0, name: "img", kind: "self" }
// ]
```

### 3) Void теги

```ts
scanHtmlTags("<br><hr>")
// [
//   { text: "<br>", index: 0, name: "br", kind: "void" },
//   { text: "<hr>", index: 4, name: "hr", kind: "void" }
// ]
```

### 4) Namespace-теги

```ts
scanHtmlTags('<svg:use href="#icon" />')
// [
//   { text: '<svg:use href="#icon" />', index: 0, name: "svg:use", kind: "self" }
// ]
```

### 5) Template literals в атрибутах

```ts
scanHtmlTags('<input value="${context.name}" />')
// [
//   { text: '<input value="${context.name}" />', index: 0, name: "input", kind: "self" }
// ]
```

---

## Типы данных

```ts
// Контекст для render-функции
type Content = Record<string, string | number | boolean | null | Array<string | number | boolean | null>>

// Ядро с произвольной вложенностью
type Core = Record<string, any>

// Состояние
type State = string

// Render-функция
type Render<C extends Content = Content, I extends Core = Core, S extends State = State> = (args: {
  html: (strings: TemplateStringsArray, ...values: any[]) => string
  core: I
  context: C
  state: State
}) => void
```

---

## Алгоритм сканирования

1. **Быстрое обнаружение** — использование `TAG_LOOKAHEAD` для поиска возможных тегов
2. **Точный парсинг** — ручное извлечение границ тега с учётом кавычек и template literals
3. **Валидация имени** — проверка корректности имени тега
4. **Классификация** — определение типа тега на основе структуры и списка void-тегов

**Особенности обработки:**

- Игнорирование комментариев (`<!-- -->`) и DOCTYPE
- Корректная обработка вложенных кавычек
- Пропуск template literals `${...}` внутри атрибутов
- Поддержка экранированных символов

---

## Тесты

- `splitter.spec.ts`

Запуск тестов:

```bash
bun test splitter.spec.ts
```

> В тестах мы **сравниваем с объектами** (наглядный expected JSON-подобной формы). Обязательно есть **общий `describe`**, ветвления отражают оси вариантности, а сообщения у `expect` — на русском.

---

## Частые вопросы

**Почему мы не парсим в дерево?**  
Это сканер, а не парсер. Задача — выделить теги с метаданными, а не построить иерархию.

**Как обрабатываются template literals?**  
Они сохраняются как часть текста атрибута или содержимого, но не исполняются.

**Поддерживаются ли комментарии?**  
Нет, комментарии игнорируются при сканировании.

**Что такое void-теги?**  
HTML-теги, которые не могут иметь содержимого (например, `<br>`, `<img>`).

---

## Стандарты проекта

- Комментарии и JSDoc — **на русском языке**.
- Не оставлять **мёртвый код**.
- Тестовые наборы:
  - общий `describe`;
  - преимущественно сравнением с объектом;
  - структура тестов — дерево вариантностей (ветвления — параллельные `describe`, листья — `it`).

## Новая функция: `extractHtmlElements(html: string)`

Возвращает **единый плоский список** узлов (теги и текст) в порядке следования.
Элемент имеет форму:

```ts
type ElementKind = "open" | "close" | "self" | "void" | "text"
type ElementToken = { text: string; index: number; name: string; kind: ElementKind }
```

- Для **текстовых** узлов: `kind: "text"`, `name: ""`, `text` — содержимое.
- Для **тегов**: `kind` — один из `"open" | "close" | "self" | "void"`, `name` — имя тега, `text` — исходный фрагмент (`<div>`, `</p>`, и т.д.).

Пример:

```ts
extractHtmlElements("<p>a<b>c</b>d</p>")
// => [
/*0*/ { text: "<p>", index: 0, name: "p", kind: "open" },
/*1*/ { text: "a",   index: 3, name: "",  kind: "text" },
/*2*/ { text: "<b>", index: 4, name: "b", kind: "open" },
/*3*/ { text: "c",   index: 7, name: "",  kind: "text" },
/*4*/ { text: "</b>",index: 8, name: "b", kind: "close" },
/*5*/ { text: "d",   index: 12,name: "",  kind: "text" },
/*6*/ { text: "</p>",index: 13,name: "p", kind: "close" },
]
```
