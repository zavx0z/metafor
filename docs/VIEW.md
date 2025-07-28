# Представление (View)

Представление определяет UI компонента с использованием современного HTML template API. MetaFor предоставляет декларативный способ создания интерфейсов с автоматическим обновлением.

## Основные концепции

### Декларативный UI

Представление описывается декларативно через функции рендеринга:

```typescript
.view({
  render: ({ context, html, update, ref }) => html`
    <div class="user-profile">
      <h1>${context.name}</h1>

      ${context.isLoading
        ? html`<div class="loading">Загрузка...</div>`
        : html`
          <form @submit=${(e) => {
            e.preventDefault()
            update({ isLoading: true })
          }}>
            <input
              .value=${context.email}
              @input=${(e) => update({ email: e.target.value })}
              placeholder="Email"
            />
            <button type="submit" ?disabled=${!context.email}>
              Сохранить
            </button>
          </form>
        `
      }

      ${context.error
        ? html`<div class="error">${context.error}</div>`
        : null
      }
    </div>
  `,

  style: ({ css }) => css`
    .user-profile {
      padding: 20px;
      border: 1px solid #ccc;
      border-radius: 8px;
    }

    .loading {
      color: #666;
      font-style: italic;
    }

    .error {
      color: red;
      margin-top: 10px;
    }
  `
})
```

### Автоматическое обновление

UI автоматически перерендеривается при изменении контекста:

```typescript
// При изменении контекста UI обновится автоматически
update({ name: "Новое имя", isLoading: false })
```

## Структура представления

### render функция

Основная функция рендеринга:

```typescript
render: ({ context, html, update, ref }) => html`...`
```

**Параметры:**

- `context` — текущий контекст компонента
- `html` — функция для создания HTML шаблонов
- `update` — функция для обновления контекста
- `ref` — функция для создания ссылок на элементы

### style функция

Опциональная функция для стилей:

```typescript
style: ({ css }) => css`...`
```

**Параметры:**

- `css` — функция для создания CSS стилей

## HTML Template API

### Базовый синтаксис

```typescript
html`<div>${context.name}</div>`
```

### Интерполяция значений

```typescript
html`
  <div>
    <h1>${context.title}</h1>
    <p>${context.description}</p>
    <span>${context.count}</span>
  </div>
`
```

### Условный рендеринг

```typescript
html`
  <div>
    ${context.isLoading
      ? html`<div class="loading">Загрузка...</div>`
      : html`<div class="content">${context.data}</div>`} ${context.error &&
    html`<div class="error">${context.error}</div>`}
  </div>
`
```

### Циклы

```typescript
html`
  <ul>
    ${context.items.map((item) => html` <li>${item.name}</li> `)}
  </ul>
`
```

## Директивы

### Обработчики событий (@event)

```typescript
html`
  <button
    @click=${(e) => {
      e.preventDefault()
      update({ count: context.count + 1 })
    }}>
    Увеличить
  </button>

  <input @input=${(e) => update({ name: e.target.value })} />

  <form
    @submit=${(e) => {
      e.preventDefault()
      update({ isSubmitting: true })
    }}>
    <button type="submit">Отправить</button>
  </form>
`
```

### Булевы атрибуты (?attribute)

```typescript
html`
  <button ?disabled=${context.isLoading}>${context.isLoading ? "Загрузка..." : "Отправить"}</button>

  <div ?hidden=${!context.isVisible}>Скрытый контент</div>

  <input ?required=${context.isRequired} />
`
```

### Свойства элементов (.property)

```typescript
html`
  <input .value=${context.email} />

  <div .textContent=${context.message}></div>

  <img .src=${context.avatarUrl} />

  <video .autoplay=${true} .muted=${true}></video>
`
```

### Ссылки на элементы (${ref()})

```typescript
html`
  <input ${ref("emailInput")} />
  <button
    @click=${() => {
      const input = refs.emailInput
      input.focus()
    }}>
    Фокус на поле
  </button>
`
```

### Условный рендеринг (${when()})

```typescript
html`
  <div>
    ${when(context.isLoading, html`<div>Загрузка...</div>`)} ${when(
      context.error,
      html`<div class="error">${context.error}</div>`
    )} ${when(context.data, html`<div>${context.data}</div>`)}
  </div>
`
```

### Циклы (${repeat()})

```typescript
html`
  <ul>
    ${repeat(context.items, (item) => html` <li>${item.name}</li> `)}
  </ul>
`
```

### Преобразование массивов (${map()})

```typescript
html` <div>${map(context.numbers, (num) => num * 2).map((result) => html` <span>${result}</span> `)}</div> `
```

## CSS стили

### Базовые стили

```typescript
style: ({ css }) => css`
  .container {
    padding: 20px;
    margin: 10px;
    border: 1px solid #ccc;
    border-radius: 8px;
  }

  .title {
    font-size: 24px;
    font-weight: bold;
    color: #333;
  }

  .button {
    padding: 10px 20px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .button:hover {
    background: #0056b3;
  }

  .button:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
`
```

### Динамические стили

```typescript
style: ({ css }) => css`
  .status {
    padding: 5px 10px;
    border-radius: 4px;
    font-weight: bold;
  }

  .status.success {
    background: #d4edda;
    color: #155724;
  }

  .status.error {
    background: #f8d7da;
    color: #721c24;
  }

  .status.warning {
    background: #fff3cd;
    color: #856404;
  }
`
```

### Медиа-запросы

```typescript
style: ({ css }) => css`
  .container {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
  }

  @media (max-width: 768px) {
    .container {
      padding: 10px;
    }

    .title {
      font-size: 20px;
    }
  }

  @media (max-width: 480px) {
    .container {
      padding: 5px;
    }

    .title {
      font-size: 18px;
    }
  }
`
```

## Примеры использования

### Простая форма

```typescript
MetaFor("simple-form")
  .context((types) => ({
    name: types.string.required(""),
    email: types.string.required(""),
    isSubmitting: types.boolean.required(false),
    error: types.string.optional(),
  }))
  .view({
    render: ({ context, html, update }) => html`
      <div class="form-container">
        <h2>Регистрация</h2>

        <form
          @submit=${(e) => {
            e.preventDefault()
            update({ isSubmitting: true })
          }}>
          <div class="form-group">
            <label>Имя:</label>
            <input
              .value=${context.name}
              @input=${(e) => update({ name: e.target.value })}
              placeholder="Введите имя"
              ?required=${true} />
          </div>

          <div class="form-group">
            <label>Email:</label>
            <input
              .value=${context.email}
              @input=${(e) => update({ email: e.target.value })}
              type="email"
              placeholder="Введите email"
              ?required=${true} />
          </div>

          <button type="submit" ?disabled=${context.isSubmitting}>
            ${context.isSubmitting ? "Отправка..." : "Отправить"}
          </button>
        </form>

        ${context.error && html` <div class="error">${context.error}</div> `}
      </div>
    `,

    style: ({ css }) => css`
      .form-container {
        max-width: 400px;
        margin: 0 auto;
        padding: 20px;
        border: 1px solid #ddd;
        border-radius: 8px;
      }

      .form-group {
        margin-bottom: 15px;
      }

      label {
        display: block;
        margin-bottom: 5px;
        font-weight: bold;
      }

      input {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
      }

      button {
        width: 100%;
        padding: 10px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
      }

      button:hover {
        background: #0056b3;
      }

      button:disabled {
        background: #ccc;
        cursor: not-allowed;
      }

      .error {
        margin-top: 15px;
        padding: 10px;
        background: #f8d7da;
        color: #721c24;
        border: 1px solid #f5c6cb;
        border-radius: 4px;
      }
    `,
  })
```

### Список с фильтрацией

```typescript
MetaFor("item-list")
  .context((types) => ({
    items: types.array.required([]),
    filter: types.string.required(""),
    selectedItem: types.number.optional(),
  }))
  .view({
    render: ({ context, html, update }) => html`
      <div class="list-container">
        <div class="filter-section">
          <input
            .value=${context.filter}
            @input=${(e) => update({ filter: e.target.value })}
            placeholder="Фильтр..."
            class="filter-input" />
        </div>

        <div class="items-list">
          ${context.items
            .filter((item) => item.name.toLowerCase().includes(context.filter.toLowerCase()))
            .map(
              (item, index) => html`
                <div
                  class="item ${context.selectedItem === item.id ? "selected" : ""}"
                  @click=${() => update({ selectedItem: item.id })}>
                  <h3>${item.name}</h3>
                  <p>${item.description}</p>
                  <span class="price">${item.price} ₽</span>
                </div>
              `
            )}
        </div>

        ${context.items.length === 0 &&
        html`
          <div class="empty-state">
            <p>Нет элементов для отображения</p>
          </div>
        `}
      </div>
    `,

    style: ({ css }) => css`
      .list-container {
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
      }

      .filter-section {
        margin-bottom: 20px;
      }

      .filter-input {
        width: 100%;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 16px;
      }

      .items-list {
        display: grid;
        gap: 15px;
      }

      .item {
        padding: 15px;
        border: 1px solid #ddd;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .item:hover {
        border-color: #007bff;
        box-shadow: 0 2px 8px rgba(0, 123, 255, 0.1);
      }

      .item.selected {
        border-color: #007bff;
        background: #f8f9ff;
      }

      .item h3 {
        margin: 0 0 10px 0;
        color: #333;
      }

      .item p {
        margin: 0 0 10px 0;
        color: #666;
      }

      .price {
        font-weight: bold;
        color: #007bff;
      }

      .empty-state {
        text-align: center;
        padding: 40px;
        color: #666;
      }
    `,
  })
```

### Модальное окно

```typescript
MetaFor("modal")
  .context((types) => ({
    isOpen: types.boolean.required(false),
    title: types.string.required(""),
    content: types.string.required(""),
    isLoading: types.boolean.required(false),
  }))
  .view({
    render: ({ context, html, update }) => html`
      ${context.isOpen &&
      html`
        <div class="modal-overlay" @click=${() => update({ isOpen: false })}>
          <div class="modal-content" @click=${(e) => e.stopPropagation()}>
            <div class="modal-header">
              <h2>${context.title}</h2>
              <button class="close-button" @click=${() => update({ isOpen: false })}>×</button>
            </div>

            <div class="modal-body">
              ${context.isLoading ? html`<div class="loading">Загрузка...</div>` : html`<div>${context.content}</div>`}
            </div>

            <div class="modal-footer">
              <button class="btn btn-secondary" @click=${() => update({ isOpen: false })}>Отмена</button>
              <button class="btn btn-primary" ?disabled=${context.isLoading}>
                ${context.isLoading ? "Загрузка..." : "Подтвердить"}
              </button>
            </div>
          </div>
        </div>
      `}
    `,

    style: ({ css }) => css`
      .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }

      .modal-content {
        background: white;
        border-radius: 8px;
        max-width: 500px;
        width: 90%;
        max-height: 80vh;
        overflow: hidden;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      }

      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px;
        border-bottom: 1px solid #eee;
      }

      .modal-header h2 {
        margin: 0;
        font-size: 20px;
        color: #333;
      }

      .close-button {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #666;
        padding: 0;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .close-button:hover {
        color: #333;
      }

      .modal-body {
        padding: 20px;
        max-height: 60vh;
        overflow-y: auto;
      }

      .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 20px;
        border-top: 1px solid #eee;
      }

      .btn {
        padding: 10px 20px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      }

      .btn-primary {
        background: #007bff;
        color: white;
      }

      .btn-primary:hover {
        background: #0056b3;
      }

      .btn-primary:disabled {
        background: #ccc;
        cursor: not-allowed;
      }

      .btn-secondary {
        background: #6c757d;
        color: white;
      }

      .btn-secondary:hover {
        background: #545b62;
      }

      .loading {
        text-align: center;
        color: #666;
        font-style: italic;
      }
    `,
  })
```

## Лучшие практики

### 1. Разделяйте логику и представление

```typescript
// ✅ Хорошо - разделение логики
const handleSubmit = (e, update) => {
  e.preventDefault()
  update({ isSubmitting: true })
}

const handleInput = (e, update) => {
  update({ name: e.target.value })
}

render: ({ context, html, update }) => html`
  <form @submit=${(e) => handleSubmit(e, update)}>
    <input @input=${(e) => handleInput(e, update)} />
  </form>
`

// ❌ Плохо - смешивание логики
render: ({ context, html, update }) => html`
  <form
    @submit=${(e) => {
      e.preventDefault()
      // Сложная логика прямо в шаблоне
      if (context.name.length > 0) {
        update({ isSubmitting: true })
        // Еще больше логики...
      }
    }}>
    <input
      @input=${(e) => {
        const value = e.target.value
        if (value.length > 0) {
          update({ name: value, isValid: true })
        } else {
          update({ name: value, isValid: false })
        }
      }} />
  </form>
`
```

### 2. Используйте условный рендеринг

```typescript
// ✅ Хорошо - условный рендеринг
html`
  <div>
    ${context.isLoading && html`<div class="loading">Загрузка...</div>`} ${context.error &&
    html`<div class="error">${context.error}</div>`} ${context.data && html`<div>${context.data}</div>`}
  </div>
`

// ❌ Плохо - скрытие элементов
html`
  <div>
    <div class="loading" ?hidden=${!context.isLoading}>Загрузка...</div>
    <div class="error" ?hidden=${!context.error}>${context.error}</div>
    <div ?hidden=${!context.data}>${context.data}</div>
  </div>
`
```

### 3. Используйте семантическую разметку

```typescript
// ✅ Хорошо - семантическая разметка
html`
  <main>
    <header>
      <h1>${context.title}</h1>
    </header>

    <section>
      <article>
        <h2>${context.subtitle}</h2>
        <p>${context.content}</p>
      </article>
    </section>

    <footer>
      <p>${context.footer}</p>
    </footer>
  </main>
`

// ❌ Плохо - div-суп
html`
  <div>
    <div>
      <div>${context.title}</div>
    </div>
    <div>
      <div>
        <div>${context.subtitle}</div>
        <div>${context.content}</div>
      </div>
    </div>
    <div>
      <div>${context.footer}</div>
    </div>
  </div>
`
```

### 4. Оптимизируйте производительность

```typescript
// ✅ Хорошо - оптимизированный рендеринг
html` <div>${context.items.map((item) => html` <div class="item" key=${item.id}>${item.name}</div> `)}</div> `

// ❌ Плохо - неоптимизированный рендеринг
html` <div>${context.items.map((item, index) => html` <div class="item">${item.name}</div> `)}</div> `
```

### 5. Используйте CSS-переменные для динамических стилей

```typescript
// ✅ Хорошо - CSS-переменные
render: ({ context, html }) => html` <div class="progress-bar" style="--progress: ${context.progress}%"></div> `

style: ({ css }) => css`
  .progress-bar {
    width: 100%;
    height: 20px;
    background: #eee;
    border-radius: 10px;
    overflow: hidden;
  }

  .progress-bar::before {
    content: "";
    display: block;
    height: 100%;
    width: var(--progress);
    background: #007bff;
    transition: width 0.3s ease;
  }
`

// ❌ Плохо - инлайн-стили
render: ({ context, html }) => html` <div class="progress-bar" style="width: ${context.progress}%"></div> `
```

## Отладка

### Включение отладки

```typescript
// Включение отладки представления
window.debugMetaFor = true
```

### Проверка рендеринга

```typescript
// Получение текущего состояния
const element = document.querySelector("metafor-my-component")
const snapshot = element.getSnapshot()
console.log("Current context:", snapshot.context)
console.log("Current state:", snapshot.state)
```

### Логирование событий

```typescript
// Логирование событий для отладки
render: ({ context, html, update }) => html`
  <button
    @click=${(e) => {
      console.log("Button clicked")
      update({ count: context.count + 1 })
    }}>
    Увеличить (${context.count})
  </button>
`
```

## Ограничения

### Нет прямого доступа к DOM

```typescript
// ❌ Неправильно - прямой доступ к DOM
render: ({ context, html }) => html` <div>${document.getElementById("external-element")}</div> `

// ✅ Правильно - через контекст
render: ({ context, html, update }) => html`
  <div>
    <input ${ref("myInput")} />
    <button
      @click=${() => {
        const input = refs.myInput
        input.focus()
      }}>
      Фокус
    </button>
  </div>
`
```

### Нет асинхронного рендеринга

```typescript
// ❌ Неправильно - async в render
render: async ({ context, html }) => {
  const data = await fetch("/api/data")
  return html`<div>${await data.text()}</div>`
}

// ✅ Правильно - синхронный render
render: ({ context, html }) => html` <div>${context.data}</div> `
```

### Нет вложенных компонентов

```typescript
// ❌ Неправильно - вложенные компоненты
render: ({ context, html }) => html`
  <div>
    <metafor-child-component></metafor-child-component>
  </div>
`

// ✅ Правильно - отдельные компоненты
// Создайте отдельный компонент MetaFor("child-component")
```
