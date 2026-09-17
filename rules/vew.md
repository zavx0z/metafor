---
description: 
globs: 
alwaysApply: false
---
## Введение

Представление (view) в Quantum Atom - это компонент, отвечающий за визуализацию частицы. Оно автоматически обновляется при изменении состояния или контекста частицы, обеспечивая реактивный пользовательский интерфейс. Quantum Atom поддерживает различные фреймворки и библиотеки для создания представлений, включая React, Vue, Vanilla JavaScript и Web Components.

---

## Определение представления

Представление определяется с помощью метода `view()`, который принимает объект с настройками:

```javascript
Atom("todo-list")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  .context((t) => ({
    items: t.array({ title: "Список элементов", default: [] }),
    isLoading: t.boolean({ title: "Состояние загрузки", default: false }),
    error: t.string({ title: "Сообщение об ошибке", nullable: true, default: null }),
  }))
  // ... другие методы ...
  .view({
    // Определение представления зависит от используемого фреймворка
  })
// ...
```

---

## Представление в React

Для React представление определяется с помощью функционального компонента:

```javascript
import React from "react"

const todoListParticle = Atom("todo-list").view({
  render: ({ state, context, actions }) => {
    if (state === "LOADING") {
      return <div className="loading">Загрузка...</div>
    }
    if (state === "ERROR") {
      return <div className="error">{context.error}</div>
    }
    return (
      <div className="todo-list">
        <h2>Список задач</h2>
        {context.items.length === 0 ? (
          <p>Нет задач</p>
        ) : (
          <ul>
            {context.items.map((item) => (
              <li key={item.id}>
                <input type="checkbox" checked={item.completed} onChange={() => actions.toggleItem(item.id)} />
                <span style={{ textDecoration: item.completed ? "line-through" : "none" }}>{item.title}</span>
                <button onClick={() => actions.removeItem(item.id)}>Удалить</button>
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const input = e.target.elements.newItem
            actions.addItem({ title: input.value, completed: false })
            input.value = ""
          }}>
          <input type="text" name="newItem" placeholder="Новая задача" />
          <button type="submit">Добавить</button>
        </form>
      </div>
    )
  },
})
```

---

## Представление в Vanilla JavaScript

```javascript
const todoListParticle = Atom("todo-list").view({
  render: ({ state, context, actions }) => {
    const container = document.createElement("div")
    container.className = "todo-list"
    if (state === "LOADING") {
      container.innerHTML = '<div class="loading">Загрузка...</div>'
      return container
    }
    if (state === "ERROR") {
      container.innerHTML = `<div class="error">${context.error}</div>`
      return container
    }
    // Заголовок
    const title = document.createElement("h2")
    title.textContent = "Список задач"
    container.appendChild(title)

    if (context.items.length === 0) {
      const emptyMessage = document.createElement("p")
      emptyMessage.textContent = "Нет задач"
      container.appendChild(emptyMessage)
    } else {
      const list = document.createElement("ul")
      context.items.forEach((item) => {
        const listItem = document.createElement("li")
        const checkbox = document.createElement("input")
        checkbox.type = "checkbox"
        checkbox.checked = item.completed
        checkbox.addEventListener("change", () => actions.toggleItem(item.id))
        const text = document.createElement("span")
        text.textContent = item.title
        text.style.textDecoration = item.completed ? "line-through" : "none"
        const deleteButton = document.createElement("button")
        deleteButton.textContent = "Удалить"
        deleteButton.addEventListener("click", () => actions.removeItem(item.id))
        listItem.appendChild(checkbox)
        listItem.appendChild(text)
        listItem.appendChild(deleteButton)
        list.appendChild(listItem)
      })
      container.appendChild(list)
    }
    return container
  },
})
```

---

## Практические рекомендации

1. **Разделяйте логику и представление** - используйте частицу для бизнес-логики и состояния, а представление только для отображения.
2. **Используйте условный рендеринг** - отображайте разные компоненты в зависимости от состояния частицы.
3. **Обрабатывайте все состояния** - предусмотрите отображение для всех возможных состояний частицы, включая загрузку и ошибки.
4. **Минимизируйте зависимости** - старайтесь минимизировать зависимости между представлениями разных частиц.
5. **Используйте компоненты повторно** - создавайте переиспользуемые компоненты для общих элементов интерфейса.
6. **Оптимизируйте рендеринг** - избегайте ненужных перерисовок, используя мемоизацию и другие техники оптимизации.
7. **Тестируйте представления** - пишите тесты для представлений, чтобы убедиться, что они корректно отображают все состояния частицы.
