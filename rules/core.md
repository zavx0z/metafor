---
description: 
globs: 
alwaysApply: false
---
## Введение

Ядро (core) в MetaFor - это механизм для доступа к внешним ресурсам и сервисам из частицы. Оно позволяет инкапсулировать взаимодействие с API, хранилищами данных, утилитами и другими внешними зависимостями, делая частицу более модульным и тестируемым.

---

## Определение ядра

Ядро определяется с помощью метода `core()`, который принимает функцию, возвращающую объект с методами и свойствами:

```javascript
Atom("TodoList")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  .context((t) => ({
    items: t.array({ title: "Список элементов", default: [] }),
    isLoading: t.boolean({ title: "Состояние загрузки", default: false }),
    error: t.string({ title: "Сообщение об ошибке", nullable: true, default: null }),
  }))
  .core(() => ({
    api: {
      fetchItems: () => fetch("/api/todos").then((response) => response.json()),
      addItem: (item) =>
        fetch("/api/todos", {
          method: "POST",
          body: JSON.stringify(item),
          headers: { "Content-Type": "application/json" },
        }).then((response) => response.json()),
      updateItem: (id, updates) =>
        fetch(`/api/todos/${id}`, {
          method: "PATCH",
          body: JSON.stringify(updates),
          headers: { "Content-Type": "application/json" },
        }).then((response) => response.json()),
      deleteItem: (id) =>
        fetch(`/api/todos/${id}`, {
          method: "DELETE",
        }).then((response) => response.json()),
    },
    storage: {
      saveItems: (items) => localStorage.setItem("todo_items", JSON.stringify(items)),
      loadItems: () => JSON.parse(localStorage.getItem("todo_items") || "[]"),
    },
    utils: {
      formatDate: (date) => new Date(date).toLocaleDateString(),
      generateId: () => Math.random().toString(36).substr(2, 9),
    },
  }))
```

---

## Использование ядра в действиях

Ядро доступно в действиях через параметр `core`:

```javascript
.actions({
  fetchItems: ({ context, core }) => {
    context.update({ isLoading: true });

    core.api.fetchItems()
      .then(data => {
        context.update({ items: data, isLoading: false });
      })
      .catch(error => {
        context.update({ error: error.message, isLoading: false });
      });
  },

  addItem: ({ context, core }, item) => {
    const newItem = {
      ...item,
      id: core.utils.generateId(),
      createdAt: new Date().toISOString()
    };

    core.api.addItem(newItem)
      .then(savedItem => {
        const currentItems = context.get().items;
        const updatedItems = [...currentItems, savedItem];

        context.update({ items: updatedItems });
        core.storage.saveItems(updatedItems);
      })
      .catch(error => {
        context.update({ error: error.message });
      });
  },

  deleteItem: ({ context, core }, id) => {
    core.api.deleteItem(id)
      .then(() => {
        const currentItems = context.get().items;
        const updatedItems = currentItems.filter(item => item.id !== id);

        context.update({ items: updatedItems });
        core.storage.saveItems(updatedItems);
      })
      .catch(error => {
        context.update({ error: error.message });
      });
  }
})
```

---

## Практические рекомендации

1. **Инкапсулируйте внешние зависимости** - помещайте все внешние API и сервисы в ядро, чтобы изолировать их от бизнес-логики частицы.

2. **Структурируйте ядро по категориям** - группируйте методы ядра по функциональности (api, storage, utils и т.д.).

3. **Обрабатывайте ошибки** - всегда обрабатывайте ошибки при взаимодействии с внешними ресурсами.

4. **Используйте абстракции** - создавайте абстракции для внешних API, чтобы упростить их замену или мокирование при тестировании.

5. **Минимизируйте побочные эффекты** - старайтесь минимизировать побочные эффекты в методах ядра.

6. **Документируйте методы ядра** - добавляйте комментарии, объясняющие назначение и параметры каждого метода.

7. **Используйте типизацию** - если вы используете TypeScript, определяйте типы для методов ядра, чтобы улучшить автодополнение и проверку типов.
