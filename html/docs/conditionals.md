### Условные выражения

@metafor/html позволяет использовать стандартные JavaScript-конструкции управления потоком, такие как [условные операторы](https://developer.mozilla.org/ru/docs/Web/JavaScript/Reference/Operators/Conditional_Operator), вызовы
функций, а также операторы `if` или `switch` для рендеринга условного контента. Вы можете комбинировать вложенные выражения шаблонов и сохранять результаты в переменные для последующего использования.

---

### Условные выражения с использованием тернарного оператора

Тернарные выражения с использованием условного оператора `?` — это удобный способ добавления встроенных условий:

```javascript
render()
{
  return this.userName
    ? html`Добро пожаловать, ${this.userName}`
    : html`Пожалуйста, войдите <button>Войти</button>`;
}
```

---

### Условные выражения с использованием оператора `if`

Вы можете использовать оператор `if` для вычисления значений за пределами шаблона:

```javascript
render()
{
  let message;
  if (this.userName) {
    message = html`Добро пожаловать, ${this.userName}`;
  } else {
    message = html`Пожалуйста, войдите <button>Войти</button>`;
  }
  return html`<p class="message">${message}</p>`;
}
```

Или вынести логику в отдельную функцию для упрощения шаблона:

```javascript
getUserMessage()
{
  if (this.userName) {
    return html`Добро пожаловать, ${this.userName}`;
  } else {
    return html`Пожалуйста, войдите <button>Войти</button>`;
  }
}

render()
{
  return html`<p>${this.getUserMessage()}</p>`;
}
```

---

### Кэширование результатов шаблонов: директива `cache`

При переключении между крупными и сложными шаблонами вы можете использовать директиву `cache`, чтобы сохранить DOM неотрисованных шаблонов и избежать излишнего создания DOM.

```javascript
import {cache} from 'html/directives/cache.js';

render()
{
  return html`${cache(
    this.userName
      ? html`Добро пожаловать, ${this.userName}`
      : html`Пожалуйста, войдите <button>Войти</button>`
  )}`;
}
```

### Условный рендеринг пустого значения

Иногда требуется ничего не отображать в одной из веток условия. Это возможно как в выражениях дочерних элементов, так и в выражениях атрибутов:

#### Для дочерних выражений

Значения `undefined`, `null`, пустая строка (`''`) и специальное значение `nothing` из @metafor/html не создают узлы DOM:

```javascript


render()
{
  return html`<user-name>${this.userName ?? nothing}</user-name>`;
}
```

#### Для выражений атрибутов

Значение `nothing` удаляет атрибут:

```javascript


render()
{
  return html`<button aria-label="${this.ariaLabel || nothing}"></button>`;
}
```