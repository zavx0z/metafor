# Система обогащения данных

Система обогащения данных предназначена для анализа HTML иерархии и извлечения метаданных о путях к данным, выражениях и статических значениях. Это позволяет эффективно рендерить динамический контент с минимальными пересчетами.

## Основные возможности

- Автоматическое определение путей к данным в map операциях
- Унификация выражений для кэширования
- Поддержка вложенных контекстов
- Обработка условных выражений
- Извлечение путей из атрибутов и событий
- Поддержка деструктуризации параметров
- Правильная обработка различных типов атрибутов (string, array, boolean, event, object)

## Архитектура системы

### Ключевые компоненты

1. **DataParserContext** - контекст парсера с информацией о текущем состоянии
2. **MapContext** - информация о конкретном map контексте
3. **resolveDataPath** - универсальная функция разрешения путей
4. **findVariableInMapStack** - поиск переменных в стеке map контекстов
5. **parseEventExpression** - специальная функция для парсинга событий
6. **parseTemplateLiteral** - функция для парсинга template literals в атрибутах

### Система контекстов

Система создает иерархию контекстов для каждого уровня вложенности map функций:

```typescript
type DataParserContext = {
  currentPath?: string // Текущий путь к данным
  pathStack: string[] // Стек путей
  mapParams?: string[] // Параметры текущего map
  level: number // Уровень вложенности
  mapContextStack?: MapContext[] // Стек всех map контекстов
}
```

## Обработка атрибутов

### Новая структура атрибутов

Система теперь правильно обрабатывает атрибуты и помещает их в соответствующие секции результата:

```typescript
{
  string?: AttributeString,    // Строковые атрибуты
  array?: AttributeArray,      // Массивные атрибуты (class, rel, accept, etc.)
  boolean?: AttributeBoolean,  // Булевые атрибуты
  event?: AttributeEvent,      // Событийные атрибуты
  object?: AttributeObject     // Объектные атрибуты (style, context, core)
}
```

### Типы значений атрибутов

Каждый атрибут может иметь один из трех типов значений:

- **`static`** - статическое значение без интерполяции
- **`dynamic`** - значение с интерполяцией `${...}`
- **`mixed`** - смешанное значение с статическими и динамическими частями

### Обработка строковых атрибутов

Строковые атрибуты обрабатываются в секции `string`:

```typescript
string: {
  src: { type: "static", value: "image.jpg" },
  alt: { type: "dynamic", value: "image.alt" },
  href: { type: "mixed", value: "base/${image.id}.jpg" }
}
```

### Обработка массивных атрибутов

Массивные атрибуты (class, rel, accept, etc.) обрабатываются в секции `array`:

```typescript
array: {
  class: [
    { type: "static", value: "container" },
    { type: "dynamic", value: "isActive ? 'active' : 'inactive'" },
    { type: "mixed", value: "btn-${variant}" }
  ],
  rel: [
    { type: "static", value: "noopener" },
    { type: "static", value: "noreferrer" }
  ]
}
```

### Обработка булевых атрибутов

Булевые атрибуты обрабатываются в секции `boolean`:

```typescript
boolean: {
  disabled: { type: "static", value: true },
  checked: { type: "dynamic", value: "user.isAdmin" },
  required: { type: "dynamic", value: "form.isValid" }
}
```

### Обработка событийных атрибутов

Событийные атрибуты обрабатываются в секции `event`:

```typescript
event: {
  onclick: "() => handleClick()",
  onchange: "(e) => handleChange(e)",
  onsubmit: "() => update({ name: 'John' })"
}
```

### Обработка объектных атрибутов

Объектные атрибуты (style, context, core) обрабатываются в секции `object`:

```typescript
object: {
  style: "{ backgroundColor: 'red', color: 'white' }",
  context: "{ user: currentUser, theme: currentTheme }",
  core: "{ state: appState, actions: appActions }"
}
```

## Извлечение путей в атрибутах

### Основные принципы

Система автоматически извлекает пути к данным из атрибутов HTML элементов, учитывая контекст вложенности map функций. Это позволяет правильно разрешать относительные пути между разными уровнями итерации.

### Поддерживаемые типы атрибутов

1. **Статические атрибуты** - обычные строковые значения
2. **Динамические атрибуты** - с template literals `${variable}`
3. **Условные атрибуты** - с тернарными операторами
4. **Булевые атрибуты** - с логическими операторами `&&`
5. **Событийные атрибуты** - с функциями обработчиков
6. **Массивные атрибуты** - с множественными значениями

### Примеры работы

```html
<!-- Простой атрибут -->
<div class="item-${item.type}">${item.name}</div>

<!-- Условный атрибут -->
<div class="${item.active ? 'active' : 'inactive'}">${item.name}</div>

<!-- Булевый атрибут -->
<button ${item.disabled && "disabled"}>Click</button>

<!-- Массивный атрибут -->
<div class="container ${isActive ? 'active' : 'inactive'} ${variant}">Content</div>
```

### Алгоритм извлечения путей

1. **Парсинг атрибутов** - функция `parseAttributes` анализирует HTML тег
2. **Определение типа значения** - проверяется наличие template literals
3. **Извлечение переменных** - извлекаются все переменные из выражения
4. **Разрешение путей** - используется `resolveDataPath` с учетом контекста
5. **Унификация выражений** - создается выражение с индексами для кэширования

## Извлечение путей в событиях

### Специальная обработка событий

События требуют особого подхода, так как они содержат сложные выражения с функциями. Система использует специальную функцию `parseEventExpression` для корректной обработки событийных атрибутов.

### Поддерживаемые форматы событий

1. **Простые события** - `onclick=${core.onClick}`
2. **События с параметрами** - `onclick=${() => core.onClick()}`
3. **События с аргументами** - `onclick=${(e) => core.onClick(e)}`
4. **События в контексте map** - `onclick=${() => item.handleClick(item.id)}`
5. **Функции обновления контекста** - `onclick=${() => update({ name: "John" })}`

### Алгоритм обработки событий

1. **Определение событийного выражения** - проверка наличия `=>`
2. **Извлечение переменных** - поиск всех переменных в формате `identifier.identifier`
3. **Фильтрация** - исключение строковых литералов и коротких идентификаторов
4. **Разрешение путей** - использование `resolveDataPath` с контекстом
5. **Создание выражения** - замена переменных на индексы `${0}`, `${1}`, etc.

### Примеры работы с событиями

```html
<!-- Простое событие -->
<button onclick=${core.onClick}>Click</button>

<!-- Событие с параметрами -->
<button onclick=${(e) => core.handleClick(e, item.id)}>Click</button>

<!-- Функция обновления контекста -->
<button onclick=${() => update({ name: "Jane Doe" })}>Update Name</button>

<!-- Функция обновления нескольких ключей -->
<button onclick=${() => update({ name: "John", age: 25, active: true })}>Update All</button>
```

## Обработка функции update

### Специальная обработка update функций

Функция `update` используется для обновления контекста в реактивных системах. Система парсинга специально обрабатывает такие функции, извлекая ключи контекста, которые будут обновлены.

### Поддерживаемые форматы update функций

1. **Обновление одного ключа** - `() => update({ name: "John" })`
2. **Обновление нескольких ключей** - `() => update({ name: "John", age: 25, active: true })`
3. **Обновление с динамическими значениями** - `() => update({ count: item.count + 1 })`

### Алгоритм обработки update функций

1. **Определение update выражения** - проверка наличия `update(`
2. **Извлечение объекта** - поиск объекта в `update({ ... })`
3. **Парсинг ключей** - извлечение всех ключей из объекта
4. **Создание результата** - формирование поля `upd` с ключами

### Результат обработки update функций

Для update функций система создает специальную структуру:

```typescript
{
  data: [], // Пустой массив, так как нет путей к данным
  expr: "() => update({ name: \"John\" })", // Исходное выражение
  upd: "name" // Ключ контекста (строка для одного ключа)
}

// Или для нескольких ключей:
{
  data: [],
  expr: "() => update({ name: \"John\", age: 25, active: true })",
  upd: ["name", "age", "active"] // Массив ключей
}
```

### Примеры работы с update функциями

```html
<!-- Обновление одного ключа -->
<button onclick=${() => update({ name: "Jane Doe" })}>OK</button>

<!-- Обновление нескольких ключей -->
<button onclick=${() => update({ name: "John", age: 25, active: true })}>Update</button>

<!-- Обновление в контексте map -->
${items.map((item) => html`
  <button onclick=${() => update({ selectedId: item.id })}>Select</button>
`)}
```

**Результат обработки:**

- `update({ name: "Jane Doe" })` → `upd: "name"`
- `update({ name: "John", age: 25, active: true })` → `upd: ["name", "age", "active"]`
- `update({ selectedId: item.id })` → `upd: "selectedId"` (в контексте map)

## Обработка class атрибутов

### Специальная обработка class

Атрибут `class` имеет специальную обработку, так как может содержать как статические, так и динамические значения:

```html
<!-- Статические классы -->
<div class="container active">Content</div>

<!-- Динамические классы -->
<div class="${isActive ? 'active' : 'inactive'}">Content</div>

<!-- Смешанные классы -->
<div class="container ${isActive ? 'active' : 'inactive'} ${variant}">Content</div>

<!-- Классы с условными выражениями -->
<div class="base-class ${core.active ? 'active' : 'inactive'} ${core.disabled ? 'disabled' : ''}">Content</div>
```

### Результат обработки class атрибутов

```typescript
// Для статических классов
string: {
  class: "container active"
}

// Для динамических классов
string: {
  class: {
    data: "/core/active",
    expr: '${0} ? "active" : "inactive"'
  }
}

// Для смешанных классов
array: {
  class: [
    { value: "container" },
    {
      data: "/core/active",
      expr: '${0} ? "active" : "inactive"'
    },
    {
      data: "/core/variant",
      expr: "btn-${0}"
    }
  ]
}
```

## Вложенные контексты

### Иерархия контекстов

Система создает иерархию контекстов для каждого уровня вложенности map функций. Каждый контекст содержит информацию о параметрах и уровне вложенности.

### Автоматическое создание контекстов

При парсинге map выражений автоматически создаются новые контексты:

```typescript
const newContext: DataParserContext = {
  ...context,
  currentPath: `[item]/${relativePath}`,
  pathStack: [...context.pathStack, `[item]/${relativePath}`],
  mapParams: params,
  level: context.level + 1,
  mapContextStack: [...(context.mapContextStack || []), newMapContext],
}
```

### Примеры разрешения путей

```typescript
// В контексте: companies.map((company) => departments.map((dept) => teams.map((team) => members.map((member) => ...)))

// Для переменной company.id в самом глубоком уровне:
resolveDataPath("company.id", context) // Возвращает: "../../../[item]/id"

// Для переменной dept.id в среднем уровне:
resolveDataPath("dept.id", context) // Возвращает: "../../[item]/id"

// Для переменной team.id в ближнем уровне:
resolveDataPath("team.id", context) // Возвращает: "../[item]/id"

// Для переменной member.id в текущем уровне:
resolveDataPath("member.id", context) // Возвращает: "[item]/id"
```

## Унификация выражений

### Создание унифицированных выражений

Система создает унифицированные выражения с индексами для эффективного кэширования:

```typescript
// Исходное выражение: class="${company.active && dept.active ? 'active' : 'inactive'}"
// Результат: {
//   data: ["../[item]/active", "[item]/active"],
//   expr: "${0} && ${1} ? 'active' : 'inactive'"
// }
```

### Форматирование выражений

Функция `createUnifiedExpression` выполняет:

1. Замену переменных на индексы
2. Удаление избыточных пробелов и переносов строк
3. Защиту строковых литералов от форматирования

## Обработка пустых строк в тернарных операторах

### Исправленная логика восстановления кавычек

Система теперь правильно обрабатывает пустые строки в тернарных операторах:

```html
<!-- Пустые значения в тернарных операторах -->
<div class="${core.hidden ? '' : 'show'}">Content</div>
<div class="${core.active ? 'active' : ''}">Content</div>
```

### Результат обработки

```typescript
array: {
  class: [
    { value: "visible" },
    {
      data: "/core/hidden",
      expr: '${0} ? "" : "show"'
    },
    {
      data: "/core/active",
      expr: '${0} ? "active" : ""'
    }
  ]
}
```

## Интеграция с основным API

### Функция parse

Основная функция `parse` теперь включает полный цикл обработки:

```typescript
export const parse = <C extends Content = Content, I extends Core = Core, S extends State = State>(
  render: Render<C, I, S>
): Node[] => {
  // Извлекаем основной HTML блок из render-функции
  const mainHtml = extractMainHtmlBlock(render)

  // Разбиваем HTML на токены элементов
  const elements = extractHtmlElements(mainHtml)

  // Строим иерархию элементов
  const hierarchy = makeHierarchy(mainHtml, elements)

  // Извлекаем атрибуты
  const attributes = extractAttributes(hierarchy)

  // Обогащаем иерархию метаданными о путях к данным
  const enrichedHierarchy = enrichWithData(attributes)

  return enrichedHierarchy
}
```

### Полный цикл обработки

1. **extractMainHtmlBlock** - извлечение HTML из template literal
2. **extractHtmlElements** - разбиение на токены элементов
3. **makeHierarchy** - построение иерархии элементов
4. **extractAttributes** - извлечение и классификация атрибутов
5. **enrichWithData** - обогащение метаданными о путях к данным

## Преимущества системы

### 1. Точность разрешения путей

Система обеспечивает точное разрешение путей к данным независимо от глубины вложенности map функций.

### 2. Универсальность

Одинаковая логика работает для всех типов данных: атрибутов, событий, текста, условий.

### 3. Производительность

Унифицированные выражения позволяют эффективно кэшировать результаты вычислений.

### 4. Расширяемость

Архитектура позволяет легко добавлять новые типы обработки данных.

### 5. Правильная классификация атрибутов

Система корректно классифицирует атрибуты по типам и помещает их в соответствующие секции результата.

### 6. Поддержка сложных выражений

Система корректно обрабатывает сложные выражения с тернарными операторами, логическими операторами и пустыми значениями.
