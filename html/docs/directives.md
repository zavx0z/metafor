# Встроенные директивы

Директивы — это функции, которые могут расширять MetaFor, настраивая способ отображения выражения. MetaFor включает ряд встроенных директив, помогающих с различными потребностями отображения:

| **Директива**                       | **Краткое содержание**                                                                                                     |
|-------------------------------------|----------------------------------------------------------------------------------------------------------------------------|
|                                     | [**_Стайлинг_**](#стайлинг)                                                                                                |
| [classMap](#classmap)               | Назначает элементу список классов на основе объекта.                                                                       |
| [styleMap](#stylemap)               | Задает список свойств стиля для элемента на основе объекта.                                                                |
|                                     | [**_Циклы и условные операторы_**](#циклы-и-условные-операторы)                                                            |
| [when](#when)                       | Визуализирует один из двух шаблонов на основе условия.                                                                     |
| [choose](#choose)                   | Отображает один из многих шаблонов на основе ключевого значения.                                                           |
| [map](#map)                         | Преобразует итерируемый объект с помощью функции.                                                                          |
| [repeat](#repeat)                   | Отображает значения из итерируемого объекта в DOM с возможностью ключа для обеспечения различий данных и стабильности DOM. |
| [join](#join)                       | Чередование значений из итерируемого объекта со значением объединителя.                                                    |
| [range](#range)                     | Создает итерируемый набор чисел в последовательности, полезный для итерации определенное количество раз.                   |
| [ifDefined](#ifdefined)             | Устанавливает атрибут, если значение определено, и удаляет атрибут, если не определено.                                    |
|                                     | [**_Кэширование и обнаружение изменений_**](#кэширование-и-обнаружение-изменений)                                          |
| [cache](#cache)                     | При изменении шаблонов кэширует рендеринг DOM, а не удаляет DOM.                                                           |
| [keyed](#keyed)                     | Связывает отображаемое значение с уникальным ключом, заставляя DOM повторно отображать его при изменении ключа.            |
| [guard](#guard)                     | Повторная оценка шаблона выполняется только в случае изменения одной из его зависимостей.                                  |
| [live](#live)                       | Обновляет привязанное значение при изменении пользовательского ввода.                                                      |
|                                     | [**_Ссылка на визуализированный DOM_**](#ссылка-на-визуализированный-dom)                                                  |
| [ref](#ref)                         | Получает ссылку на элемент, отрисованный в шаблоне.                                                                        |
|                                     | [**_Отображение специальных значений_**](#отображение-специальных-значений)                                                |
| [templateContent](#templatecontent) | Отображает содержимое элемента `<template>`.                                                                               |
| [unsafeHTML](#unsafehtml)           | Отображает строку как HTML, а не как текст.                                                                                |
| [unsafeSVG](#unsafesvg)             | Отображает строку как SVG, а не как текст.                                                                                 |
|                                     | [**_Асинхронный рендеринг_**](#асинхронный-рендеринг)                                                                      |
| [until](#until)                     | Отображает содержимое заполнителя до тех пор, пока не будет выполнено одно или несколько обещаний.                         |
| [asyncAppend](#asyncappend)         | Добавляет значения из `AsyncIterable` в DOM по мере их получения.                                                          |
| [asyncReplace](#asyncreplace)       | Отображает последнее значение из `AsyncIterable` в DOM по мере его получения.                                              |

> Объединяйте только то, что используете. Они называются «встроенными» директивами, поскольку являются частью пакета MetaFor. Но каждая директива — это отдельный модуль, поэтому ваше приложение объединяет только те
> директивы, которые вы импортируете.

Вы также можете создавать свои собственные директивы. Для получения дополнительной информации см. [Пользовательские директивы](./custom-directives.md).

## Стайлинг

### classMap

Устанавливает список классов для элемента на основе объекта.

**Импорт**

```js
import {classMap} from "@pkg/html/directives/class-map.js"
```

**Синтаксис функции**

```
classMap(classInfo: {[name: string]: string | boolean | number})
```

**Местоположение**  
Выражение атрибута `class` (должно быть единственным выражением в атрибуте `class`).

**Описание**  
Директива classMap использует element.classListAPI для эффективного добавления и удаления классов к элементу на основе объекта, переданного пользователем. Каждый ключ в объекте рассматривается как имя класса, и если
значение, связанное с ключом, истинно, этот класс добавляется к элементу. При последующих рендерингах любые ранее заданные классы, которые являются ложными или больше не присутствуют в объекте, удаляются.

**Пример использования**

```js
class MyElement extends LitElement {
  static properties = {
    enabled: {type: Boolean}
  }

  constructor() {
    super()
    this.enabled = false
  }

  render() {
    const classes = {enabled: this.enabled, hidden: false}
    return html`
      <div class=${classMap(classes)}>Classy text</div>
    `
  }
}

customElements.define("my-element", MyElement)
```

**Комбинирование со статическими классами**

```js
html`
  <div class="my-widget ${classMap(dynamicClasses)}">Static and dynamic</div>
`
```

> **Примечание**: Выражение classMap должно быть единственным в class атрибуте, но его можно комбинировать со статическими значениями.

---

### styleMap

Задает список свойств стиля для элемента на основе объекта.

**Импорт**

```js
import {styleMap} from "@pkg/html/directives/style-map.js"
```

**Синтаксис функции**

```
styleMap(styleInfo: {[name: string]: string | null | undefined})
```

**Местоположение**  
Выражение атрибута `style` (должно быть единственным выражением в атрибуте `style`).

**Описание**  
Директива styleMap использует style API элемента для эффективного добавления, обновления или удаления стилей в соответствии с объектом, переданным пользователем. Каждый ключ в объекте представляет собой имя стиля, а
значение — это его значение. Значения `null` или `undefined` удаляют соответствующие свойства стиля.

**Пример использования**

```js
class MyElement extends LitElement {
  static properties = {
    color: {type: String},
    size: {type: String}
  }

  constructor() {
    super()
    this.color = "red"
    this.size = "20px"
  }

  render() {
    const styles = {
      color: this.color,
      fontSize: this.size
    }
    return html`
      <div style=${styleMap(styles)}>Stylish text</div>
    `
  }
}

customElements.define("my-element", MyElement)
```

**Особенности**

- Удобно для работы с динамическими стилями
- Значения `null` или `undefined` удаляют соответствующие свойства стиля
- Имена свойств должны быть в camelCase (например, `fontSize` вместо `font-size`)

---

## Циклы и условные операторы

### when

Визуализирует один из двух шаблонов на основе условия.

**Импорт**

```js
import {when} from "@pkg/html/directives/when.js"
```

**Синтаксис функции**

```
when(condition: boolean, trueCase: () => unknown, falseCase?: () => unknown)
```

**Местоположение**  
Любое выражение.

**Описание**  
Директива `when` рендерит один из двух шаблонов в зависимости от условия. Это эффективный способ условного рендеринга, который обновляет DOM только при изменении условия.

**Пример использования**

```js
class MyElement extends LitElement {
  static properties = {
    isLoggedIn: {type: Boolean}
  }

  constructor() {
    super()
    this.isLoggedIn = false
  }

  render() {
    return html`
      ${when(
      this.isLoggedIn,
      () =>
        html`
            <p>Welcome back, user!</p>
          `,
      () =>
        html`
            <p>Please log in.</p>
          `
    )}
    `
  }
}

customElements.define("my-element", MyElement)
```

**Особенности**

- Эффективно обновляет DOM только для изменившихся частей
- Удобно для реализации условного рендеринга
- Поддерживает опциональный falseCase

---

### choose

Отображает один из нескольких шаблонов на основе ключевого значения.

**Импорт**

```js
import {choose} from "@pkg/html/directives/choose.js"
```

**Синтаксис функции**

```
choose(key: unknown, cases: Array<[key: unknown, value: () => unknown]>, fallback?: () => unknown)
```

**Местоположение**  
Любое выражение.

**Описание**  
Директива `choose` позволяет отображать различные шаблоны в зависимости от значения ключа.

**Пример использования**
```js
html`
    ${choose(
    this.status,
    [
      ["loading", () => html`<p>Loading...</p>`],
      ["success", () => html`<p>Data loaded successfully!</p>`],
      ["error", () => html`<p>Error loading data.</p>`]
    ],
    () => html`<p>Unknown status.</p>`
  )}
`
```

**Особенности**

- Удобно для реализации сложных сценариев выбора
- Поддерживает fallback-шаблон для обработки случаев, когда ключ не найден

---

### map

Преобразует итерируемый объект с помощью функции.

**Импорт**

```js
import {map} from "@pkg/html/directives/map.js"
```

**Синтаксис функции**

```
map(items: Iterable<T>, callback: (item: T, index: number) => unknown)
```

**Местоположение**  
Детское выражение.

**Описание**  
Директива `map` применяется для создания списка элементов из итерируемого объекта.

**Пример использования**

```js
class MyElement extends LitElement {
  static properties = {
    items: {type: Array}
  }

  constructor() {
    super()
    this.items = ["Apple", "Banana", "Cherry"]
  }

  render() {
    return html`
      <ul>
        ${map(
      this.items,
      (item, index) => html`<li>${index + 1}: ${item}</li>`
    )}
      </ul>
    `
  }
}

customElements.define("my-element", MyElement)
```

**Особенности**

- Используется для преобразования массивов или других итерируемых объектов
- Простой и быстрый способ создания списков

---

### repeat

Отображает значения из итерируемого объекта в DOM с возможностью указания ключа для обеспечения различий данных и стабильности DOM.

**Импорт**

```js
import {repeat} from "@pkg/html/directives/repeat.js"
```

**Синтаксис функции**

```
repeat(items: Iterable<T>, keyFn?: KeyFn<T>, template: ItemTemplate<T>)
```

**Местоположение**  
Выражение дочернего элемента.

**Описание**  
Директива `repeat` позволяет эффективно отображать элементы списка и обновлять их, минимизируя изменения DOM. При использовании функции ключа (`keyFn`), `repeat` связывает каждый элемент с уникальным ключом, что позволяет
сохранять стабильность DOM при изменении данных. Это делает `repeat` более оптимизированным по сравнению с обычным использованием `map`, особенно при динамическом обновлении списков.

**Пример использования**

```js
class MyElement extends LitElement {
  static properties = {
    items: {}
  }

  constructor() {
    super()
    this.items = [
      {id: 1, name: "Item 1"},
      {id: 2, name: "Item 2"}
    ]
  }

  render() {
    return html`
      <ul>
        ${repeat(
      this.items,
      item => item.id,
      (item, index) => html`<li>${index}: ${item.name}</li>`
    )}
      </ul>
    `
  }
}

customElements.define("my-element", MyElement)
```

**Особенности**

- Если функция ключа (`keyFn`) не указана, `repeat` работает аналогично обычному `map`, но с переиспользованием DOM
- Используйте `repeat`, если данные динамически изменяются, чтобы минимизировать количество операций над DOM

---

### join

Чередует значения из итерируемого объекта с указанным разделителем.

**Импорт**

```js
import {join} from "@pkg/html/directives/join.js"
```

**Синтаксис функции**

```
join(items: Iterable<unknown>, separator: () => unknown)
```

**Местоположение**  
Любое выражение.

---

### range

Итератор для создания диапазона чисел.

**Импорт**

```js
import {range} from "@pkg/html/directives/range.js"
```

**Синтаксис функции**

```
range(end: number): Iterable<number>
range(start: number, end: number, step?: number): Iterable<number>
```

**Местоположение**  
Любое выражение.

---

### ifDefined

Устанавливает атрибут, если значение определено, и удаляет атрибут, если значение `undefined` или `null`.

**Импорт**

```js
import {ifDefined} from "@pkg/html/directives/if-defined.js"
```

**Синтаксис функции**

```
ifDefined(value: unknown)
```

**Местоположение**  
Выражение атрибута (например, для атрибутов URL или других, которые должны быть удалены, если значение не задано).

**Описание**  
Директива `ifDefined` используется для динамического управления атрибутами. Она удаляет атрибут, если переданное значение равно `undefined` или `null`, предотвращая установку некорректных значений.

**Пример использования**

```js
import {LitElement, html} from "@pkg/html/index"
import {ifDefined} from "@pkg/html/directives/if-defined.js"

class MyElement extends LitElement {
  static properties = {
    filename: {},
    size: {}
  }

  constructor() {
    super()
    this.filename = undefined
    this.size = undefined
  }

  render() {
    return html`
      <img src="/images/${ifDefined(this.size)}/${ifDefined(this.filename)}" />
    `
  }
}

customElements.define("my-element", MyElement)
```

**Особенности**

- Полезна для предотвращения установки некорректных атрибутов, которые могут вызвать ошибки (например, `404` для URL)
- При использовании нескольких выражений в одном атрибуте, если любое из них возвращает `undefined` или `null`, атрибут удаляется
- Работает только с атрибутами элементов

---

## Кэширование и обнаружение изменений

---

### cache

Кэширует отображённый DOM, чтобы избежать его удаления при переключении между шаблонами.

**Импорт**

```js
import {cache} from "@pkg/html/directives/cache.js"
```

**Синтаксис функции**

```
cache(value: TemplateResult | unknown)
```

**Местоположение**  
Детское выражение.

**Описание**  
Директива `cache` сохраняет DOM для ранее отрисованных шаблонов, позволяя переключаться между ними без повторного создания. Это особенно полезно при частом переключении между сложными шаблонами.

**Пример использования**

```javascript
import {LitElement, html} from "@pkg/html/index"
import {cache} from "@pkg/html/directives/cache.js"

const detailView = data => html`
  <div>Details: ${data.details}</div>
`
const summaryView = data => html`
  <div>Summary: ${data.summary}</div>
`

class MyElement extends LitElement {
  static properties = {
    data: {}
  }

  constructor() {
    super()
    this.data = {
      showDetails: true,
      details: "More info",
      summary: "Overview"
    }
  }

  render() {
    return html`
      ${cache(
      this.data.showDetails
        ? detailView(this.data)
        : summaryView(this.data)
    )}
    `
  }
}

customElements.define("my-element", MyElement)
```

**Особенности**

- Экономит ресурсы за счёт повторного использования DOM
- Полезна при частых переключениях между большими шаблонами
- Сохраняет состояние DOM-элементов между переключениями
- Может увеличить потребление памяти при кэшировании большого количества шаблонов

---

### keyed

Связывает отображаемое значение с уникальным ключом. При изменении ключа предыдущий DOM удаляется, даже если значение шаблона не изменилось.

**Импорт**

```js
import {keyed} from "@pkg/html/directives/keyed.js"
```

**Синтаксис функции**

```
keyed(key: unknown, value: unknown)
```

**Местоположение**  
Любое выражение.

**Описание**  
Директива `keyed` используется для принудительного удаления и пересоздания DOM при изменении ключа, что особенно полезно при работе с элементами состояния.

**Пример использования**

```javascript
import {LitElement, html} from "@pkg/html"
import {keyed} from "@pkg/html/directives/keyed.js"

class MyElement extends LitElement {
  static properties = {
    userId: {}
  }

  constructor() {
    super()
    this.userId = "user1"
  }

  render() {
    return html`
      <div>
        ${keyed(
      this.userId,
      html`
            <user-card .userId=${this.userId}></user-card>
          `
    )}
      </div>
    `
  }
}

customElements.define("my-element", MyElement)
```

При изменении значения `userId`, связанный компонент `user-card` будет удалён и пересоздан, даже если шаблон остался тем же.

**Особенности**

- Полезна для очистки состояния элементов при изменении ключевых данных
- Применяется в сценариях анимации или переключения между элементами

---

### guard

Повторно вычисляет шаблон только при изменении зависимостей, оптимизируя производительность.

**Импорт**

```js
import {guard} from "@pkg/html/directives/guard.js"
```

**Синтаксис функции**

```
guard(dependencies: unknown[], valueFn: () => unknown)
```

**Местоположение**  
Любое выражение.

**Описание**  
Директива `guard` предотвращает выполнение дорогостоящих вычислений или повторного рендеринга, если зависимости не изменились. Она сравнивает переданные зависимости и вызывает функцию только при их изменении.

**Пример использования**

```javascript
import {LitElement, html} from "@pkg/html"
import {guard} from "@pkg/html/directives/guard.js"

function calculateSHA(value) {
  console.log("Calculating SHA...")
  return `SHA-${value}`
}

class MyElement extends LitElement {
  static properties = {
    value: {}
  }

  constructor() {
    super()
    this.value = ""
  }

  render() {
    return html`
      <div>${guard([this.value], () => calculateSHA(this.value))}</div>
    `
  }
}

customElements.define("my-element", MyElement)
```

В этом примере `calculateSHA` вызывается только тогда, когда изменяется значение `value`.

**Особенности**

- Полезна для работы с неизменяемыми данными
- Позволяет минимизировать дорогостоящие вычисления при рендеринге

---

### live

Обновляет привязанное значение при изменении пользовательского ввода.

**Импорт**

```js
import {live} from "@pkg/html/directives/live.js"
```

**Синтаксис функции**

```
live(value: unknown)
```

**Местоположение**  
Выражение атрибута для элементов ввода.

**Описание**  
Директива `live` используется для создания двусторонней привязки данных с элементами ввода. Она обновляет значение свойства при каждом событии ввода, а не только при обновлении рендеринга.

**Пример использования**

```js
import {LitElement, html} from "@pkg/html/index"
import {live} from "@pkg/html/directives/live.js"

class MyElement extends LitElement {
  static properties = {
    value: {type: String}
  }

  constructor() {
    super()
    this.value = "initial"
  }

  render() {
    return html`
      <input .value=${live(this.value)}
             @input=${(e) => this.value = e.target.value}>
      <p>Текущее значение: ${this.value}</p>
    `
  }
}

customElements.define("my-element", MyElement)
```

**Особенности**

- Обеспечивает мгновенное обновление значения при вводе
- Полезна для форм с активным взаимодействием
- Работает с различными типами элементов ввода (text, checkbox, radio)
- Может влиять на производительность при частых обновлениях

## Ссылка на визуализированный DOM

---

### ref

Получает ссылку на элемент, отрисованный в шаблоне.

**Импорт**

```js
import {ref, createRef} from "@pkg/html/directives/ref.js"
```

**Синтаксис функции**

```
ref(refOrCallback: RefOrCallback)
createRef(): Ref
```

**Местоположение**  
Выражение элемента (например, для `input`, `div` и других).

**Описание**  
Директива `ref` используется для получения прямой ссылки на DOM-элемент после его рендеринга. Это позволяет взаимодействовать с элементом императивно, например, устанавливать фокус или вызывать нативные методы.

**Пример использования с объектом Ref**

```js
import {LitElement, html} from "@pkg/html/index"
import {ref, createRef} from "@pkg/html/directives/ref.js"

class MyElement extends LitElement {
  inputRef = createRef()

  firstUpdated() {
    // Прямой доступ к DOM-элементу
    this.inputRef.value?.focus()
  }

  render() {
    return html`
      <input ${ref(this.inputRef)} type="text">
    `
  }
}

customElements.define("my-element", MyElement)
```

**Пример использования с callback-функцией**

```js
import {LitElement, html} from "@pkg/html/index"
import {ref} from "@pkg/html/directives/ref.js"

class MyElement extends LitElement {
  render() {
    return html`
      <input ${ref((element) => element?.focus())} type="text">
    `
  }
}

customElements.define("my-element", MyElement)
```

**Особенности**

- Поддерживает два способа получения ссылок: через объект Ref или callback-функцию
- Ref.value содержит null до первого рендеринга
- Callback вызывается при каждом обновлении элемента
- Полезна для интеграции с внешними библиотеками и API
- Следует использовать только когда декларативный подход невозможен

---

## Отображение специальных значений

---

### templateContent

Отображает содержимое элемента `<template>`.

**Импорт**

```js
import {templateContent} from "@pkg/html/directives/template-content.js"
```

**Синтаксис функции**

```
templateContent(templateElement: HTMLTemplateElement)
```

**Местоположение**  
Детское выражение.

**Описание**  
Директива `templateContent` позволяет клонировать содержимое элемента `<template>` и включать его в шаблон @metafor/html. Это полезно, когда нужно использовать статический HTML-контент, определенный вне компонента.

**Пример использования**

```js
import {LitElement, html} from "@pkg/html/index"
import {templateContent} from "@pkg/html/directives/template-content.js"

const templateEl = document.querySelector("template#myContent")

class MyElement extends LitElement {
  render() {
    return html`
      Вот содержимое из элемента шаблона: ${templateContent(templateEl)}
    `
  }
}

customElements.define("my-element", MyElement)
```

**Особенности**

- Используется для включения статического HTML, определенного вне скрипта
- Контент должен быть доверенным, чтобы избежать XSS-уязвимостей
- Содержимое template клонируется при каждом рендеринге

---

### unsafeHTML

Отображает строку как HTML, а не как текст.

**Импорт**

```js
import {unsafeHTML} from "@pkg/html/directives/unsafe-html.js"
```

**Синтаксис функции**

```
unsafeHTML(value: string | typeof nothing | typeof noChange)
```

**Местоположение**  
Детское выражение.

**Описание**  
Директива `unsafeHTML` используется для отображения доверенного HTML-контента, переданного в виде строки. Она позволяет вставить HTML-код, который интерпретируется как разметка, а не как текст.

**Пример использования**

```js
import {LitElement, html} from "@pkg/html/index"
import {unsafeHTML} from "@pkg/html/directives/unsafe-html.js"

const markup = "<h3>Some HTML to render.</h3>"

class MyElement extends LitElement {
  render() {
    return html`
      Внимание! Потенциально небезопасный HTML: ${unsafeHTML(markup)}
    `
  }
}

customElements.define("my-element", MyElement)
```

**Особенности**

- Подходит для отображения контента, полученного из надежных источников (например, базы данных)
- Важно! Контент, передаваемый в `unsafeHTML`, не должен содержать ненадежные данные, так как это может привести к уязвимостям XSS

---

### unsafeSVG

Отображает строку как SVG, а не как текст.

**Импорт**

```js
import {unsafeSVG} from "@pkg/html/directives/unsafe-svg.js"
```

**Синтаксис функции**

```
unsafeSVG(value: string | typeof nothing | typeof noChange)
```

**Местоположение**  
Детское выражение.

**Описание**  
Директива `unsafeSVG` аналогична `unsafeHTML`, но используется специально для рендеринга SVG-контента. Она позволяет вставить SVG-код, который интерпретируется как разметка, а не как текст.

**Пример использования**

```js
import {LitElement, html} from "@pkg/html/index"
import {unsafeSVG} from "@pkg/html/directives/unsafe-svg.js"

const svg = '<circle cx="50" cy="50" r="40" fill="red" />'

class MyElement extends LitElement {
  render() {
    return html`
      Внимание! Потенциально небезопасный SVG:
      <svg width="40" height="40" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" version="1.1">
        ${unsafeSVG(svg)}
      </svg>
    `
  }
}

customElements.define("my-element", MyElement)
```

**Особенности**

- Используется для доверенного SVG-контента
- Важно! SVG-строки не должны содержать пользовательский ввод, чтобы избежать XSS-уязвимостей
- Подходит для динамической генерации SVG-графики

---

## Асинхронный рендеринг

---

### until

Отображает содержимое заполнителя до тех пор, пока не будет выполнено одно или несколько обещаний.

**Импорт**

```js
import {until} from "@pkg/html/directives/until.js"
```

**Синтаксис функции**

```
until(...values: unknown[])
```

**Местоположение**  
Любое выражение.

**Описание**  
Директива `until` отображает значение с наивысшим приоритетом, пока другие значения (например, обещания) не будут разрешены. Это полезно для создания загрузчиков для асинхронного контента.

**Пример использования**

```js
import {LitElement, html} from "@pkg/html/index"
import {until} from "@pkg/html/directives/until.js"

class MyElement extends LitElement {
  static properties = {
    content: {state: true}
  }

  constructor() {
    super()
    this.content = fetch("./content.txt").then(r => r.text())
  }

  render() {
    return html`
      ${until(
      this.content,
      html`<span>Загрузка...</span>`
    )}
    `
  }
}

customElements.define("my-element", MyElement)
```

**Особенности**

- Поддерживает отображение плейсхолдера до завершения асинхронных операций
- Может использоваться с несколькими значениями, где последний аргумент имеет наименьший приоритет
- Автоматически обрабатывает Promise и отображает результат после разрешения

---

### asyncAppend

Добавляет значения из `AsyncIterable` в DOM по мере их получения.

**Импорт**

```js
import {asyncAppend} from "@pkg/html/directives/async-append.js"
```

**Синтаксис функции**

```
asyncAppend(iterable: AsyncIterable<I>, mapper?: (item: I, index?: number) => unknown)
```

**Местоположение**  
Детское выражение.

**Описание**  
Директива `asyncAppend` отображает элементы по мере их получения из асинхронного итератора, добавляя их в конец DOM. Это особенно полезно при работе с потоковыми данными или длительными асинхронными операциями.

**Пример использования**

```javascript
import {LitElement, html} from "@pkg/html/index"
import {asyncAppend} from "@pkg/html/directives/async-append.js"

async function* tossCoins(count) {
  for (let i = 0; i < count; i++) {
    yield Math.random() > 0.5 ? "Орел" : "Решка"
    await new Promise(r => setTimeout(r, 1000))
  }
}

class MyElement extends LitElement {
  static properties = {
    tosses: {state: true}
  }

  constructor() {
    super()
    this.tosses = tossCoins(10)
  }

  render() {
    return html`
      <ul>
        ${asyncAppend(
      this.tosses,
      (v) => html`<li>${v}</li>`
    )}
      </ul>
    `
  }
}

customElements.define("my-element", MyElement)
```

**Особенности**

- Полезна для отображения данных в реальном времени
- Подходит для длинных асинхронных операций
- Поддерживает функцию-маппер для преобразования значений
- Элементы добавляются последовательно в порядке их получения
- Не блокирует рендеринг остальной части компонента

---

### asyncReplace

Отображает последнее значение из `AsyncIterable` в DOM по мере его получения.

**Импорт**

```js
import {asyncReplace} from "@pkg/html/directives/async-replace.js"
```

**Синтаксис функции**

```
asyncReplace(iterable: AsyncIterable<I>, mapper?: (item: I, index?: number) => unknown)
```

**Местоположение**  
Любое выражение.

**Описание**  
Директива `asyncReplace` отображает последнее значение из асинхронного итератора, заменяя предыдущее значение в DOM. Это полезно для отображения последовательных обновлений или потоковых данных, где важно только последнее
значение.

**Пример использования**

```javascript
import {LitElement, html} from "@pkg/html/index"
import {asyncReplace} from "@pkg/html/directives/async-replace.js"

async function* tossCoins(count) {
  for (let i = 0; i < count; i++) {
    yield Math.random() > 0.5 ? "Орел" : "Решка"
    await new Promise(r => setTimeout(r, 1000))
  }
}

class MyElement extends LitElement {
  static properties = {
    tosses: {state: true}
  }

  constructor() {
    super()
    this.tosses = tossCoins(10)
  }

  render() {
    return html`
      <div>
        ${asyncReplace(
      this.tosses,
      v => html`<span>Результат: ${v}</span>`
    )}
      </div>
    `
  }
}

customElements.define("my-element", MyElement)
```

**Особенности**

- Полезна для отображения данных в реальном времени
- Подходит для длинных асинхронных операций
- Отображает только последнее полученное значение
- Автоматически заменяет предыдущее значение
- Поддерживает функцию-маппер для преобразования значений
