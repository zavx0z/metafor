# @metafor/html

## Содержание

1. [Обзор](#обзор)
2. [Рендеринг шаблонов](#рендеринг-шаблонов)
3. [Рендеринг динамических данных](#рендеринг-динамических-данных)
4. [Стили и шаблоны](#стили-и-шаблоны)

## Обзор

`@metafor/html` позволяет писать [HTML-шаблоны](https://developer.mozilla.org/ru/docs/Web/HTML/Element/template) в JavaScript с
использованием [шаблонных литералов](https://developer.mozilla.org/ru/docs/Web/JavaScript/Reference/Template_literals).

Шаблоны `@metafor/html` сочетают удобство написания HTML с мощью JavaScript. Эта библиотека обеспечивает эффективный рендеринг шаблонов в DOM и обновление только измененных частей.

Основными импортами `@metafor/html` являются `html` и `render`:

Для серверного кода (typescript)
```typescript
import {html, render} from '@pkg/html';
```
Для клиентского кода (без сборки)
``` javascript
import {html, render} from 'quantum/html/html.js';
```

Пакет также включает дополнительные модули:

- `@metafor/html/directives/*` - [Встроенные директивы](./docs/directives.md)
- `@metafor/html/directive.js` - [Пользовательские директивы](./docs/custom-directives.md)
- `@metafor/html/async-directive.js` - [Пользовательские асинхронные директивы](./docs/custom-directives.md#асинхронные-директивы)
- `@metafor/html/directive-helpers.js` - [Помощники директив для императивных обновлений](./docs/custom-directives.md/#imperative-dom-access:-update\(\))
- `@metafor/html/static.js` - [Статический HTML-тег](./docs/expressions.md/#static-expressions)

## Рендеринг шаблонов

Шаблоны `@metafor/html` создаются с использованием шаблонных литералов JavaScript, помеченных тегом `html`. Эти шаблоны позволяют использовать простой HTML с динамическими выражениями для вставки и обновления данных (
см. [Шаблоны](./docs/overview.md) для подробной справки).

```javascript
html`<h1>Hello ${name}</h1>`
```

Шаблоны не создают или обновляют DOM напрямую. Вместо этого они возвращают `TemplateResult`, который используется функцией `render()` для фактического обновления DOM:

```javascript
import {html, render} from '@pkg/html';

const name = 'world';
const sayHi = html`<h1>Hello ${name}</h1>`;
render(sayHi, document.body);
```

## Рендеринг динамических данных

Чтобы шаблон был динамическим, создайте функцию, которая возвращает `TemplateResult`. Вызывайте эту функцию каждый раз, когда данные изменяются:

```javascript
import {html, render} from '@pkg/html/index';

// Определение функции шаблона
const myTemplate = (name) => html`<div>Hello ${name}</div>`;

// Первичный рендеринг
render(myTemplate('earth'), document.body);

// Обновление данных
render(myTemplate('mars'), document.body);
```

Функция шаблона не создает DOM, что делает её быстрой и дешевой. Она возвращает `TemplateResult`, который используется для обновления только измененных частей DOM. Это позволяет эффективно создавать UI как функцию
состояния.

### Параметры рендеринга

Функция `render` принимает третий аргумент `options` для настройки:

- `host`: Значение `this`, используемое в обработчиках событий.
- `renderBefore`: Узел, перед которым будет рендериться контент.
- `creationScope`: Объект для вызова `importNode` при клонировании шаблонов (по умолчанию `document`).

Пример:

```html

<div id="container">
  <header>АТОМ</header>
  <footer>Copyright 2025</footer>
</div>
```

```javascript
const template = () => html`<section>Динамический контент</section>`;
const container = document.getElementById('container');
const renderBefore = container.querySelector('footer');
render(template(), container, {renderBefore});
```

Шаблон будет отображаться между элементами `<header>` и `<footer>`.

> **Важно:** Параметры рендеринга должны оставаться неизменными между вызовами `render`.

## Стили и шаблоны

`@metafor/html` фокусируется на рендеринге HTML. Методы стилизации зависят от контекста использования:

- **Без теневого DOM:** используйте глобальные таблицы стилей.
- **С теневым DOM:** используйте нативные возможности Shadow DOM для изоляции стилей.

Для динамической стилизации доступны директивы:

- [`classMap`](./docs/directives.md#classmap): Устанавливает классы на основе объекта.
- [`styleMap`](./docs/directives.md#stylemap): Применяет стили на основе карты свойств и значений.

`@metafor/html` обеспечивает гибкость и производительность при работе с динамическими данными и шаблонами в современных веб-приложениях.

