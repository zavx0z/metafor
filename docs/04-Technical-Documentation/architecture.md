# Архитектура MetaFor

## Введение

MetaFor предоставляет мощную архитектуру для управления состояниями приложения, основанную на принципах конечных автоматов и реактивного программирования. В этом документе описаны основные компоненты архитектуры и их взаимодействие.

## Основные компоненты

### 1. Частица (Particle)

Частица — это основная единица в MetaFor. Каждая частица имеет:

- **Уникальный идентификатор** — имя, которое используется для идентификации частицы
- **Состояние** — текущее состояние частицы (одно из предопределенных)
- **Контекст** — данные, связанные с частицей
- **Действия** — функции, которые выполняются при входе в определенное состояние
- **Переходы** — правила перехода между состояниями
- **Ядро** — сервисы и ресурсы, используемые частицей
- **Реакции** — обработчики событий от других частиц
- **Представление** — визуальный компонент, связанный с частицей

```javascript
const todoParticle = MetaFor("todo-list")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  .context((t) => ({
    items: t.array({ default: [] }),
    isLoading: t.boolean({ default: false }),
    error: t.string({ default: null }),
  }))
  .transitions([
    /* Правила перехода между состояниями */
  ])
  .actions({
    /* Действия, выполняемые при входе в состояние */
  })
  .core(() => ({
    /* Сервисы и ресурсы */
  }))
  .reactions([
    /* Обработчики событий от других частиц */
  ])
  .view({
    /* Визуальный компонент */
  })
  .create({
    state: "IDLE",
    context: {
      /* Начальный контекст */
    },
  })
```

### 2. Состояния (States)

Состояния определяют возможные состояния частицы. Каждая частица должна находиться в одном из предопределенных состояний.

```javascript
.states("IDLE", "LOADING", "LOADED", "ERROR")
```

### 3. Контекст (Context)

Контекст содержит данные, связанные с частицей. Он определяется с помощью типизированного объекта.

```javascript
.context((t) => ({
  filter: t.string({ default: "all" }),
  search: t.string({ default: "" }),
}))
```

### 4. Переходы (Transitions)

Переходы определяют правила перехода между состояниями. Каждый переход содержит:

- **from** — исходное состояние
- **to** — массив возможных целевых состояний с триггерами
- **action** — действие, которое будет выполнено при входе в новое состояние (опционально)

```javascript
.transitions([
  {
    from: "IDLE",
    to: [
      { 
        state: "LOADING", 
        trigger: { isLoading: true },
        action: "fetchItems"
      }
    ]
  },
  {
    from: "LOADING",
    to: [
      { state: "LOADED", trigger: { items: { length: { gt: 0 } } } },
      { state: "ERROR", trigger: { error: { isNull: false } } }
    ]
  }
])
```

### 5. Действия (Actions)

Действия — это функции, которые выполняются при входе в определенное состояние. Они могут изменять контекст и вызывать переходы между состояниями.

```javascript
.actions({
  fetchItems: ({ update, core, setState }) => {
    update({ isLoading: true });
    
    core.api.fetchItems()
      .then(items => {
        update({ items, isLoading: false });
        setState("LOADED");
      })
      .catch(error => {
        update({ error: error.message, isLoading: false });
        setState("ERROR");
      });
  }
})
```

### 6. Ядро (Core)

Ядро предоставляет доступ к сервисам и ресурсам, используемым частицей. Это могут быть API-запросы, таймеры, локальное хранилище и т.д.

```javascript
.core(() => ({
  api: {
    fetchItems: async () => {
      const response = await fetch('/api/items');
      return response.json();
    },
    saveItem: async (item) => {
      const response = await fetch('/api/items', {
        method: 'POST',
        body: JSON.stringify(item)
      });
      return response.json();
    }
  },
  storage: {
    saveToLocalStorage: (key, data) => {
      localStorage.setItem(key, JSON.stringify(data));
    },
    getFromLocalStorage: (key) => {
      return JSON.parse(localStorage.getItem(key));
    }
  }
}))
```

### 7. Реакции (Reactions)

Реакции позволяют частицам реагировать на изменения в других частицах.

```javascript
.reactions([
  {
    source: "user",
    handler: ({ update, patch }) => {
      update({
        userId: patch.context.id,
        isAuthenticated: patch.context.isAuthenticated
      });
    }
  }
])
```

### 8. Представление (View)

Представление определяет визуальный компонент, связанный с частицей. Оно автоматически обновляется при изменении состояния или контекста частицы.

```javascript
.view({
  render: ({ update, context, state, html }) => html`
    <div class="todo-list ${state.toLowerCase()}">
      <h1>Список задач</h1>
      <ul>
        ${context.items.map(item => html`
          <li class="${item.completed ? 'completed' : ''}">
            <input 
              type="checkbox" 
              ?checked=${item.completed} 
              @change=${() => update({
                items: context.items.map(i => 
                  i.id === item.id ? { ...i, completed: !i.completed } : i
                )
              })}
            />
            <span>${item.text}</span>
            <button @click=${() => update({
              items: context.items.filter(i => i.id !== item.id)
            })}>Удалить</button>
          </li>
        `)}
      </ul>
    </div>
  `,
  style: ({ css }) => css`
    /* Стили компонента */
  `,
  onMount: ({ element }) => {
    // Вызывается при монтировании компонента
  },
  onDestroy: ({ element }) => {
    // Вызывается при размонтировании компонента
  }
})
```