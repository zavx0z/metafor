# Документация по атрибутам HTML парсера

## Обзор

HTML парсер поддерживает различные типы атрибутов с разными синтаксисами и возможностями интерполяции. Каждый тип атрибута обрабатывается по-своему и помещается в соответствующую секцию результата.

## Система типов

### Основные типы атрибутов

Парсер использует отдельную систему типов для работы с атрибутами, которая не зависит от типов иерархии:

- **`PartAttrElement`** - HTML элемент с извлеченными атрибутами
- **`PartAttrMeta`** - Meta-элемент с извлеченными атрибутами
- **`PartAttrCondition`** - Условный элемент с атрибутами
- **`PartAttrMap`** - Map-элемент с атрибутами
- **`PartAttrs`** - Массив элементов с атрибутами

### Разделение ответственности

- **`hierarchy.t.ts`** - типы для построения иерархии элементов (`PartElement`, `PartMeta`, `PartCondition`, `PartMap`)
- **`attributes.t.ts`** - типы для работы с атрибутами (`PartAttrElement`, `PartAttrMeta`, `PartAttrCondition`, `PartAttrMap`)

## Типы атрибутов

### 1. Булевые атрибуты (Boolean Attributes)

Булевые атрибуты определяются отсутствием кавычек вокруг значения. Поддерживаются стандартные HTML булевые атрибуты, `data-*` атрибуты и кастомные атрибуты из одного слова.

#### Синтаксис

```html
<!-- Без значения (по умолчанию true) -->
<button disabled>
  <!-- Со значением true/false -->
  <input checked="true" />
  <input readonly="false" />

  <!-- Динамические значения -->
  <button disabled="${context.isLoading}">
    <input checked="${user.isAdmin}" />
  </button>
</button>
```

#### Специальный синтаксис с фигурными скобками

```html
<!-- Условные булевые атрибуты -->
<button ${context.isLoading && 'disabled'}> <input ${user.isAdmin && 'checked'}> <div ${isVisible && 'hidden'}>

<!-- Сложные условия -->
<button ${context.isLoading && context.hasPermission && 'disabled'}> <input ${core.user.isAdmin || core.user.isModerator
&& 'checked'}>
```

#### Пример результата

```javascript
{
  boolean: {
    disabled: { type: "static", value: true },
    checked: { type: "dynamic", value: "context.isAdmin" }
  }
}
```

### 2. События (Event Attributes)

События начинаются с `on...` и извлекаются как сырые строки без символов интерполяции.

#### Синтаксис

```html
<!-- Простые события -->
<button onclick=${() => core.handleClick()}>
  <input onchange=${(e) => core.handleChange(e)} />

  <!-- События без кавычек -->
  <button onclick=${() => handleClick()}> <input onchange=${(e) => {handleChange(e)}}>

  <!-- Кастомные события -->
  <div onCustomEvent=${(data) => processData(data)}>
    <span onDataChange=${handleDataChange}></span>
  </div>
</button>
```

#### Пример результата

```javascript
{
  event: {
    onclick: "() => handleClick()",
    onchange: "(e) => handleChange(e)",
    onCustomEvent: "(data) => processData(data)"
  }
}
```

### 3. Объектные атрибуты (Object Attributes)

Атрибуты `style`, `context` и `core` обрабатываются как JavaScript объекты с синтаксисом двойных фигурных скобок.

#### Синтаксис:

```html
<!-- Стили -->
<div style=${{backgroundColor: "red", color: "white"}}> <button style=${{width: 100, height: 50, fontSize: 16}}>

<!-- Контекст для meta-компонентов -->
<meta-component context=${{user: currentUser, theme: currentTheme}}>

<!-- Ядро для meta-компонентов -->
<meta-component core=${{state: appState, actions: appActions}}>
```

#### Поддерживаемые вариации:

```html
<!-- Динамические значения -->
<div style=${{backgroundColor: theme.primary, color: theme.text}}>

<!-- Условные стили -->
<div style=${{backgroundColor: isActive ? "green" : "red"}}>

<!-- Template literals -->
<div style=${{width: `${100 + 50}px`, height: `${200 * 2}px`}}>

<!-- Вложенные объекты -->
<div style=${{border: { width: "2px", style: "solid", color: "black" }}}>

<!-- Функции -->
<div style=${{transform: `translateX(${getOffset()}px)`, opacity: getOpacity()}}>
```

#### Пример результата:

```javascript
{
  object: {
    style: "{ backgroundColor: \"red\", color: \"white\" }",
    context: "{ user: currentUser, theme: currentTheme }",
    core: "{ state: appState, actions: appActions }"
  }
}
```

### 4. Массивные атрибуты (Array Attributes)

Атрибуты, которые могут содержать несколько значений, разделенных пробелами или запятыми.

#### Поддерживаемые атрибуты:

- `class` - специальная обработка
- `rel`, `accept`, `ping`, `coords`, `srcset`, `allow`
- `aria-labelledby`, `aria-describedby`

#### Синтаксис:

```html
<!-- Классы -->
<div class="container active">
  <div class="${isActive ? 'active' : 'inactive'}">
    <div class="static ${dynamicClass} mixed">
      <!-- Отношения -->
      <a rel="noopener noreferrer">
        <link rel="${isExternal ? 'external' : 'internal'}" />

        <!-- Принятие файлов -->
        <input accept="image/*,.pdf" />
        <input accept="${allowedTypes}" />

        <!-- Координаты -->
        <area coords="0,0,100,100" />
        <area coords="${getCoordinates()}"
      /></a>
    </div>
  </div>
</div>
```

#### Пример результата:

```javascript
{
  array: {
    class: [
      { type: "static", value: "container" },
      { type: "dynamic", value: "isActive ? 'active' : 'inactive'" }
    ],
    rel: [
      { type: "static", value: "noopener" },
      { type: "static", value: "noreferrer" }
    ]
  }
}
```

### 5. Строковые атрибуты (String Attributes)

Все остальные атрибуты обрабатываются как строковые.

#### Синтаксис:

```html
<!-- Статические значения -->
<img src="image.jpg" alt="Описание" />
<a href="/page">Ссылка</a>

<!-- Динамические значения -->
<img src="${image.url}" alt="${image.alt}" />
<a href="${getPageUrl()}">Ссылка</a>

<!-- Смешанные значения -->
<img src="base/${image.id}.jpg" alt="Изображение ${image.name}" />
```

#### Пример результата:

```javascript
{
  string: {
    src: { type: "static", value: "image.jpg" },
    alt: { type: "dynamic", value: "image.alt" },
    href: { type: "mixed", value: "base/${image.id}.jpg" }
  }
}
```

## Приоритет обработки атрибутов

Атрибуты обрабатываются в следующем порядке:

1. **Атрибуты в фигурных скобках** (`${condition && 'attribute'}`)
2. **События** (`on...`)
3. **Объектные атрибуты** (`style`, `context`, `core`)
4. **Класс** (`class`)
5. **Другие массивные атрибуты** (`rel`, `accept`, etc.)
6. **Булевые атрибуты** (без кавычек)
7. **Строковые атрибуты** (по умолчанию)

## Структура результата

```javascript
{
  boolean: {
    // Булевые атрибуты
    disabled: { type: "static", value: true },
    checked: { type: "dynamic", value: "context.isAdmin" }
  },
  event: {
    // События (только значения)
    onclick: "() => handleClick()",
    onchange: "(e) => handleChange(e)"
  },
  object: {
    // Объектные атрибуты (только значения)
    style: "{ backgroundColor: \"red\", color: \"white\" }",
    context: "{ user: currentUser, theme: currentTheme }"
  },
  array: {
    // Массивные атрибуты
    class: [
      { type: "static", value: "container" },
      { type: "dynamic", value: "isActive ? 'active' : 'inactive'" }
    ]
  },
  string: {
    // Строковые атрибуты
    src: { type: "static", value: "image.jpg" },
    alt: { type: "dynamic", value: "image.alt" }
  }
}
```

## Типы значений

- **`static`** - статическое значение без интерполяции
- **`dynamic`** - значение с интерполяцией `${...}`
- **`mixed`** - смешанное значение с статическими и динамическими частями

## Особенности

### Кавычки

- Булевые атрибуты определяются отсутствием кавычек
- События и объектные атрибуты могут быть с кавычками или без
- Массивные и строковые атрибуты поддерживают оба варианта

### Интерполяция

- `${...}` - для динамических выражений
- `${{...}}` - для объектных атрибутов
- `${...}` - для условных булевых атрибутов

### Кастомные атрибуты

- `data-*` атрибуты поддерживаются как булевые
- Кастомные атрибуты из одного слова поддерживаются как булевые
- Кастомные события на `on...` поддерживаются

## Примеры комплексного использования

```html
<!-- Комплексный элемент с разными типами атрибутов -->
<button
  class="btn ${isPrimary ? 'btn-primary' : 'btn-secondary'}"
  style=${{backgroundColor: theme.primary, color: theme.text}}
  disabled=${isLoading}
  onclick=${() => handleClick()}
  data-testid="submit-button"
  aria-labelledby="submit-label"
>
  Отправить
</button>
```

Результат:

```javascript
{
  boolean: {
    disabled: { type: "dynamic", value: "isLoading" },
    "data-testid": { type: "static", value: true }
  },
  event: {
    onclick: "() => handleClick()"
  },
  object: {
    style: "{ backgroundColor: theme.primary, color: theme.text }"
  },
  array: {
    class: [
      { type: "static", value: "btn" },
      { type: "dynamic", value: "isPrimary ? 'btn-primary' : 'btn-secondary'" }
    ],
    "aria-labelledby": [
      { type: "static", value: "submit-label" }
    ]
  }
}
```

## API функций

### `extractAttributes(hierarchy: PartHierarchy): PartAttrs`

Извлекает атрибуты из иерархии элементов и возвращает массив элементов с атрибутами.

**Параметры:**

- `hierarchy` - иерархия элементов из `makeHierarchy()`

**Возвращает:**

- `PartAttrs` - массив элементов с извлеченными атрибутами

**Пример использования:**

```typescript
const hierarchy = makeHierarchy(html, elements)
const attributes = extractAttributes(hierarchy)
const data = enrichWithData(attributes)
```

### `parseAttributes(tagSource: string)`

Парсит атрибуты из строки HTML тега.

**Параметры:**

- `tagSource` - строка HTML тега (например, `<div class="btn" disabled>`)

**Возвращает:**

- Объект с секциями атрибутов (`boolean`, `event`, `object`, `array`, `string`)

## Совместимость типов

- `extractAttributes()` принимает `PartHierarchy` и возвращает `PartAttrs`
- `enrichWithData()` принимает `PartAttrs` и возвращает `Node[]`
- Типы атрибутов (`PartAttrElement`, `PartAttrMeta`, etc.) не содержат свойство `text`
- Типы иерархии (`PartElement`, `PartMeta`, etc.) содержат обязательное свойство `text`
