# Интеграция MetaFor с другими фреймворками и библиотеками

## Введение

MetaFor разработан как независимый фреймворк для управления состоянием, который может быть интегрирован с различными JavaScript-фреймворками и библиотеками. В этом документе описаны способы интеграции MetaFor с популярными фреймворками и библиотеками, а также рекомендации по эффективному использованию частиц в различных контекстах.

## Интеграция с React

### Использование хука для частицы

Для использования MetaFor в React-приложении можно создать хук, который будет предоставлять доступ к частице и ее состоянию:

```javascript
// useParticle.js
import { useState, useEffect } from "react"
// Импорт для серверного кода (если React используется на сервере с SSR)
import { MetaFor } from "metafor"

export function useParticle(particle) {
  const [state, setState] = useState(particle.state)
  const [context, setContext] = useState(particle.context.get())

  useEffect(() => {
    const unsubscribe = particle.subscribe(({ state, context }) => {
      setState(state)
      setContext(context)
    })

    return () => unsubscribe()
  }, [particle])

  return {
    state,
    context,
    actions: particle.actions,
  }
}
```

Для клиентского кода:

```javascript
// particles/todoParticle.js - клиентский код
import { MetaFor } from "./metafor.js"

export const todoParticle = MetaFor("todo-list")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  // ... остальной код
```

Использование хука в компоненте:

```jsx
// TodoList.jsx
import React from "react"
import { useParticle } from "./useParticle"
import { todoParticle } from "./particles/todoParticle"

function TodoList() {
  const { state, context, actions } = useParticle(todoParticle)

  useEffect(() => {
    actions.fetchItems()
  }, [])

  return (
    <div>
      <h1>Список задач</h1>
      {state === "LOADING" && <p>Загрузка...</p>}
      {state === "ERROR" && (
        <div>
          <p>Ошибка: {context.error}</p>
          <button onClick={actions.clearError}>Очистить ошибку</button>
        </div>
      )}
      {state === "LOADED" && (
        <ul>
          {context.items.map((item) => (
            <li key={item.id}>{item.title}</li>
          ))}
        </ul>
      )}
      <button onClick={actions.fetchItems} disabled={state === "LOADING"}>
        Обновить
      </button>
    </div>
  )
}
```

### Создание провайдера контекста

Для более удобного доступа к частицам в React-приложении можно создать провайдер контекста:

```jsx
// ParticleProvider.jsx
import React, { createContext, useContext } from "react"
import { useParticle } from "./useParticle"

const ParticleContext = createContext({})

export function ParticleProvider({ particles, children }) {
  const particleValues = {}

  for (const [key, particle] of Object.entries(particles)) {
    particleValues[key] = useParticle(particle)
  }

  return <ParticleContext.Provider value={particleValues}>{children}</ParticleContext.Provider>
}

export function useParticleContext() {
  return useContext(ParticleContext)
}
```

Использование провайдера в приложении:

```jsx
// App.jsx
import React from "react"
import { ParticleProvider } from "./ParticleProvider"
import { todoParticle } from "./particles/todoParticle"
import { userParticle } from "./particles/userParticle"
import TodoList from "./TodoList"
import UserProfile from "./UserProfile"

function App() {
  const particles = {
    todo: todoParticle,
    user: userParticle,
  }

  return (
    <ParticleProvider particles={particles}>
      <div className="app">
        <UserProfile />
        <TodoList />
      </div>
    </ParticleProvider>
  )
}
```

Использование контекста в компоненте:

```jsx
// TodoList.jsx
import React, { useEffect } from "react"
import { useParticleContext } from "./ParticleProvider"

function TodoList() {
  const { todo } = useParticleContext()
  const { state, context, actions } = todo

  useEffect(() => {
    actions.fetchItems()
  }, [])

  return <div>{/* ... */}</div>
}
```

## Интеграция с Vue.js

### Создание композиционной функции

Для использования MetaFor в Vue.js можно создать композиционную функцию:

```javascript
// useParticle.js
import { ref, reactive, onMounted, onUnmounted } from "vue"

export function useParticle(particle) {
  const state = ref(particle.state)
  const context = reactive(particle.context.get())

  let unsubscribe = null

  onMounted(() => {
    unsubscribe = particle.subscribe(({ state: newState, context: newContext }) => {
      state.value = newState
      Object.assign(context, newContext)
    })
  })

  onUnmounted(() => {
    if (unsubscribe) {
      unsubscribe()
    }
  })

  return {
    state,
    context,
    actions: particle.actions,
  }
}
```

Использование в компоненте Vue:

```vue
<!-- TodoList.vue -->
<template>
  <div>
    <h1>Список задач</h1>
    <p v-if="state === 'LOADING'">Загрузка...</p>
    <div v-if="state === 'ERROR'">
      <p>Ошибка: {{ context.error }}</p>
      <button @click="actions.clearError">Очистить ошибку</button>
    </div>
    <ul v-if="state === 'LOADED'">
      <li v-for="item in context.items" :key="item.id">{{ item.title }}</li>
    </ul>
    <button @click="actions.fetchItems" :disabled="state === 'LOADING'">Обновить</button>
  </div>
</template>

<script>
import { useParticle } from "./useParticle"
import { todoParticle } from "./particles/todoParticle"

export default {
  setup() {
    const { state, context, actions } = useParticle(todoParticle)

    // Загрузка данных при монтировании компонента
    actions.fetchItems()

    return {
      state,
      context,
      actions,
    }
  },
}
</script>
```

### Создание плагина для Vue

Для более удобного использования MetaFor в Vue.js можно создать плагин:

```javascript
// metaForPlugin.js
export const MetaForPlugin = {
  install(app, { particles }) {
    app.config.globalProperties.$particles = particles

    app.provide("particles", particles)
  },
}
```

Использование плагина в приложении:

```javascript
// main.js
import { createApp } from "vue"
import App from "./App.vue"
import { MetaForPlugin } from "./metaForPlugin"
import { todoParticle } from "./particles/todoParticle"
import { userParticle } from "./particles/userParticle"

const app = createApp(App)

app.use(MetaForPlugin, {
  particles: {
    todo: todoParticle,
    user: userParticle,
  },
})

app.mount("#app")
```

Использование в компоненте:

```vue
<!-- TodoList.vue -->
<script>
import { inject, ref, reactive, onMounted, onUnmounted } from "vue"

export default {
  setup() {
    const particles = inject("particles")
    const todoParticle = particles.todo

    const state = ref(todoParticle.state)
    const context = reactive(todoParticle.context.get())

    let unsubscribe = null

    onMounted(() => {
      unsubscribe = todoParticle.subscribe(({ state: newState, context: newContext }) => {
        state.value = newState
        Object.assign(context, newContext)
      })

      todoParticle.actions.fetchItems()
    })

    onUnmounted(() => {
      if (unsubscribe) {
        unsubscribe()
      }
    })

    return {
      state,
      context,
      actions: todoParticle.actions,
    }
  },
}
</script>
```

## Интеграция с Angular

### Создание сервиса

Для использования MetaFor в Angular можно создать сервис:

```typescript
// particle.service.ts
import { Injectable } from "@angular/core"
import { BehaviorSubject } from "rxjs"

@Injectable({
  providedIn: "root",
})
export class ParticleService {
  private particles = new Map()

  registerParticle(key: string, particle: any) {
    this.particles.set(key, {
      particle,
      state$: new BehaviorSubject(particle.state),
      context$: new BehaviorSubject(particle.context.get()),
    })

    particle.subscribe(({ state, context }) => {
      const particleData = this.particles.get(key)
      particleData.state$.next(state)
      particleData.context$.next(context)
    })
  }

  getParticle(key: string) {
    return this.particles.get(key)
  }
}
```

Регистрация частиц в модуле:

```typescript
// app.module.ts
import { NgModule, APP_INITIALIZER } from "@angular/core"
import { BrowserModule } from "@angular/platform-browser"
import { AppComponent } from "./app.component"
import { ParticleService } from "./particle.service"
import { todoParticle } from "./particles/todo.particle"
import { userParticle } from "./particles/user.particle"

function initializeParticles(particleService: ParticleService) {
  return () => {
    particleService.registerParticle("todo", todoParticle)
    particleService.registerParticle("user", userParticle)
  }
}

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule],
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: initializeParticles,
      deps: [ParticleService],
      multi: true,
    },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
```

Использование в компоненте:

```typescript
// todo-list.component.ts
import { Component, OnInit, OnDestroy } from "@angular/core"
import { ParticleService } from "./particle.service"
import { Subscription } from "rxjs"

@Component({
  selector: "app-todo-list",
  template: `
    <div>
      <h1>Список задач</h1>
      <p *ngIf="state === 'LOADING'">Загрузка...</p>
      <div *ngIf="state === 'ERROR'">
        <p>Ошибка: {{ context?.error }}</p>
        <button (click)="clearError()">Очистить ошибку</button>
      </div>
      <ul *ngIf="state === 'LOADED'">
        <li *ngFor="let item of context?.items">{{ item.title }}</li>
      </ul>
      <button (click)="fetchItems()" [disabled]="state === 'LOADING'">Обновить</button>
    </div>
  `,
})
export class TodoListComponent implements OnInit, OnDestroy {
  state: string
  context: any
  private todoParticle: any
  private subscriptions: Subscription[] = []

  constructor(private particleService: ParticleService) {
    const particleData = this.particleService.getParticle("todo")
    this.todoParticle = particleData.particle

    this.subscriptions.push(
      particleData.state$.subscribe((state) => {
        this.state = state
      })
    )

    this.subscriptions.push(
      particleData.context$.subscribe((context) => {
        this.context = context
      })
    )
  }

  ngOnInit() {
    this.fetchItems()
  }

  ngOnDestroy() {
    this.subscriptions.forEach((sub) => sub.unsubscribe())
  }

  fetchItems() {
    this.todoParticle.actions.fetchItems()
  }

  clearError() {
    this.todoParticle.actions.clearError()
  }
}
```

## Интеграция с Vanilla JavaScript

### Использование частицы в чистом JavaScript

MetaFor можно использовать с чистым JavaScript без дополнительных фреймворков:

```javascript
// todoParticle.js
import { Particle } from "pkg-particle"

export const todoParticle = Particle("TodoList")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  .context((t) => ({
    items: t.array([]),
    isLoading: t.boolean(false),
    error: t.nullable(t.string(null)),
  }))
  .transitions([
    { from: "IDLE", to: [{ state: "LOADING", trigger: { isLoading: true } }] },
    { from: "LOADING", to: [{ state: "LOADED", trigger: { items: { length: { gt: 0 } } } }] },
    { from: "LOADING", to: [{ state: "ERROR", trigger: { error: { isNull: false } } }] },
    { from: "ERROR", to: [{ state: "IDLE", trigger: { error: null } }] },
  ])
  .actions({
    fetchItems: ({ context }) => {
      context.update({ isLoading: true })

      fetch("/api/todos")
        .then((response) => response.json())
        .then((data) => {
          context.update({ items: data, isLoading: false })
        })
        .catch((error) => {
          context.update({ error: error.message, isLoading: false })
        })
    },
    clearError: ({ context }) => {
      context.update({ error: null })
    },
  })
  .create()
```

Использование частицы в HTML-странице:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Todo List</title>
    <script type="module">
      import { todoParticle } from "./todoParticle.js"

      document.addEventListener("DOMContentLoaded", () => {
        const todoListElement = document.getElementById("todo-list")
        const loadingElement = document.getElementById("loading")
        const errorElement = document.getElementById("error")
        const errorMessageElement = document.getElementById("error-message")
        const clearErrorButton = document.getElementById("clear-error")
        const refreshButton = document.getElementById("refresh")

        function render() {
          const state = todoParticle.state
          const context = todoParticle.context.get()

          // Скрываем все элементы
          todoListElement.style.display = "none"
          loadingElement.style.display = "none"
          errorElement.style.display = "none"

          // Отображаем элементы в зависимости от состояния
          if (state === "LOADING") {
            loadingElement.style.display = "block"
          } else if (state === "ERROR") {
            errorElement.style.display = "block"
            errorMessageElement.textContent = context.error
          } else if (state === "LOADED") {
            todoListElement.style.display = "block"
            todoListElement.innerHTML = ""

            context.items.forEach((item) => {
              const li = document.createElement("li")
              li.textContent = item.title
              todoListElement.appendChild(li)
            })
          }

          // Обновляем состояние кнопки обновления
          refreshButton.disabled = state === "LOADING"
        }

        // Подписываемся на изменения частицы
        todoParticle.subscribe(render)

        // Настраиваем обработчики событий
        clearErrorButton.addEventListener("click", () => {
          todoParticle.actions.clearError()
        })

        refreshButton.addEventListener("click", () => {
          todoParticle.actions.fetchItems()
        })

        // Загружаем данные при загрузке страницы
        todoParticle.actions.fetchItems()
      })
    </script>
  </head>
  <body>
    <h1>Список задач</h1>

    <div id="loading" style="display: none;">
      <p>Загрузка...</p>
    </div>

    <div id="error" style="display: none;">
      <p>Ошибка: <span id="error-message"></span></p>
      <button id="clear-error">Очистить ошибку</button>
    </div>

    <ul id="todo-list" style="display: none;"></ul>

    <button id="refresh">Обновить</button>
  </body>
</html>
```

## Интеграция с Web Components

### Создание веб-компонента с частицей

MetaFor хорошо интегрируется с Web Components, что позволяет создавать переиспользуемые компоненты:

```javascript
// todo-list.js
import { Particle } from "pkg-particle"

// Создание частицы
const todoParticle = Particle("TodoList")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  .context((t) => ({
    items: t.array([]),
    isLoading: t.boolean(false),
    error: t.nullable(t.string(null)),
  }))
  .transitions([
    { from: "IDLE", to: [{ state: "LOADING", trigger: { isLoading: true } }] },
    { from: "LOADING", to: [{ state: "LOADED", trigger: { items: { length: { gt: 0 } } } }] },
    { from: "LOADING", to: [{ state: "ERROR", trigger: { error: { isNull: false } } }] },
    { from: "ERROR", to: [{ state: "IDLE", trigger: { error: null } }] },
  ])
  .actions({
    fetchItems: ({ context }) => {
      context.update({ isLoading: true })

      fetch("/api/todos")
        .then((response) => response.json())
        .then((data) => {
          context.update({ items: data, isLoading: false })
        })
        .catch((error) => {
          context.update({ error: error.message, isLoading: false })
        })
    },
    clearError: ({ context }) => {
      context.update({ error: null })
    },
  })
  .create()

// Создание Web Component
class TodoList extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: "open" })

    this.render()

    // Подписка на изменения частицы
    this.unsubscribe = todoParticle.subscribe(() => {
      this.render()
    })
  }

  connectedCallback() {
    todoParticle.actions.fetchItems()
  }

  disconnectedCallback() {
    if (this.unsubscribe) {
      this.unsubscribe()
    }
  }

  render() {
    const state = todoParticle.state
    const context = todoParticle.context.get()

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: sans-serif;
        }
        ul {
          padding: 0;
          list-style: none;
        }
        li {
          padding: 8px;
          border-bottom: 1px solid #eee;
        }
        button {
          padding: 8px 16px;
          background-color: #4CAF50;
          color: white;
          border: none;
          cursor: pointer;
        }
        button:disabled {
          background-color: #cccccc;
        }
      </style>
      
      <h1>Список задач</h1>
      
      ${state === "LOADING" ? "<p>Загрузка...</p>" : ""}
      
      ${
        state === "ERROR"
          ? `
        <div>
          <p>Ошибка: ${context.error}</p>
          <button id="clear-error">Очистить ошибку</button>
        </div>
      `
          : ""
      }
      
      ${
        state === "LOADED"
          ? `
        <ul>
          ${context.items.map((item) => `<li>${item.title}</li>`).join("")}
        </ul>
      `
          : ""
      }
      
      <button id="refresh" ?disabled="${state === "LOADING"}">Обновить</button>
    `

    // Добавляем обработчики событий
    const clearErrorButton = this.shadowRoot.getElementById("clear-error")
    if (clearErrorButton) {
      clearErrorButton.addEventListener("click", () => {
        todoParticle.actions.clearError()
      })
    }

    const refreshButton = this.shadowRoot.getElementById("refresh")
    if (refreshButton) {
      refreshButton.addEventListener("click", () => {
        todoParticle.actions.fetchItems()
      })
    }
  }
}

// Регистрация компонента
customElements.define("todo-list", TodoList)
```

Использование компонента в HTML:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Todo List</title>
    <script type="module" src="./todo-list.js"></script>
  </head>
  <body>
    <todo-list></todo-list>
  </body>
</html>
```

## Практические рекомендации

1. **Выбирайте подходящий способ интеграции** в зависимости от используемого фреймворка и требований вашего приложения.

2. **Создавайте абстракции для работы с частицами**, такие как хуки, сервисы или композиционные функции, чтобы упростить использование частиц в компонентах.

3. **Используйте провайдеры или контексты** для централизованного доступа к частицам в приложении.

4. **Отделяйте логику частиц от компонентов**, чтобы обеспечить переиспользуемость и тестируемость.

5. **Подписывайтесь на изменения частиц** для обновления UI при изменении состояния или контекста.

6. **Отписывайтесь от частиц** при уничтожении компонентов, чтобы избежать утечек памяти.

7. **Используйте типизацию** (TypeScript) для улучшения разработки и предотвращения ошибок.

## Заключение

MetaFor предоставляет гибкие возможности для интеграции с различными фреймворками и библиотеками. Выбор подходящего способа интеграции зависит от конкретных требований вашего приложения и используемого фреймворка. Следуя рекомендациям, приведенным в этом документе, вы сможете эффективно интегрировать MetaFor в ваше приложение и использовать все преимущества фреймворка для управления состоянием.
