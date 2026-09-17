# Core: Управление и совместный доступ в MetaFor

## Введение

Core в MetaFor — это механизм, который позволяет частицам взаимодействовать с внешними ресурсами и сервисами. Он предоставляет доступ к API, базам данных, локальному хранилищу и другим внешним системам, обеспечивая при этом изоляцию бизнес-логики от деталей реализации этих систем.

## Определение Core

Core определяется при создании частицы с помощью метода `.core()`:

```javascript
// Серверный код (TypeScript)
import { MetaFor } from "metafor"

const todoParticle = MetaFor("todo-list")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  .context((t) => ({
    items: t.array([]),
    isLoading: t.boolean(false),
    error: t.nullable(t.string(null)),
  }))
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
  .actions({
    fetchItems: ({ update, core }) => {
      update({ isLoading: true });
      
      core.api.fetchItems()
        .then(items => {
          update({ items, isLoading: false });
        })
        .catch(error => {
          update({ error: error.message, isLoading: false });
        });
    }
  })
  .create();
```

Для клиентского кода:

```javascript
// Клиентский код (VanillaJS)
import { MetaFor } from "./metafor.js"

const todoParticle = MetaFor("todo-list")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  .context((t) => ({
    items: t.array([]),
    isLoading: t.boolean(false),
    error: t.nullable(t.string(null)),
  }))
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
  .actions({
    fetchItems: ({ update, core }) => {
      update({ isLoading: true });
      
      core.api.fetchItems()
        .then(items => {
          update({ items, isLoading: false });
        })
        .catch(error => {
          update({ error: error.message, isLoading: false });
        });
    }
  })
  .create();
```

В этом примере Core содержит два сервиса:
- `api` — для взаимодействия с REST API
- `storage` — для работы с локальным хранилищем

## Доступ к Core

Core доступен внутри действий (actions) через параметр `core`:

```javascript
.actions({
  fetchItems: ({ update, core }) => {
    // Использование core для доступа к API
    core.api.fetchItems()
      .then(items => {
        update({ items });
      });
  },
  saveItem: ({ context, core, update }) => {
    // Использование core для сохранения данных
    core.api.saveItem(context.newItem)
      .then(response => {
        update({ 
          items: [...context.items, response],
          newItem: null
        });
      });
  }
})
```

## Преимущества использования Core

1. **Изоляция бизнес-логики** — Core отделяет бизнес-логику от деталей реализации внешних систем, что упрощает тестирование и поддержку кода.

2. **Централизованный доступ к ресурсам** — Все внешние зависимости определены в одном месте, что упрощает их управление и замену.

3. **Тестируемость** — При тестировании можно легко заменить реальные сервисы на моки, что позволяет тестировать частицу в изоляции.

4. **Повторное использование** — Сервисы, определенные в Core, могут быть повторно использованы в разных действиях.

## Практические рекомендации

### 1. Структурирование Core

Рекомендуется структурировать Core по функциональным областям:

```javascript
.core(() => ({
  // API для работы с данными
  api: {
    fetchItems: async () => { /* ... */ },
    saveItem: async (item) => { /* ... */ },
    deleteItem: async (id) => { /* ... */ }
  },
  
  // Работа с локальным хранилищем
  storage: {
    save: (key, data) => { /* ... */ },
    load: (key) => { /* ... */ },
    remove: (key) => { /* ... */ }
  },
  
  // Работа с аутентификацией
  auth: {
    login: async (credentials) => { /* ... */ },
    logout: async () => { /* ... */ },
    getToken: () => { /* ... */ }
  },
  
  // Утилиты
  utils: {
    formatDate: (date) => { /* ... */ },
    generateId: () => { /* ... */ }
  }
}))
```

### 2. Асинхронные операции

Для асинхронных операций рекомендуется использовать async/await или Promise:

```javascript
.core(() => ({
  api: {
    // Использование async/await
    fetchItems: async () => {
      try {
        const response = await fetch('/api/items');
        return await response.json();
      } catch (error) {
        console.error('Error fetching items:', error);
        throw error;
      }
    },
    
    // Использование Promise
    saveItem: (item) => {
      return fetch('/api/items', {
        method: 'POST',
        body: JSON.stringify(item)
      })
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to save item');
        }
        return response.json();
      });
    }
  }
}))
```

### 3. Обработка ошибок

Важно правильно обрабатывать ошибки в Core:

```javascript
.core(() => ({
  api: {
    fetchItems: async () => {
      try {
        const response = await fetch('/api/items');
        
        if (!response.ok) {
          throw new Error(`Error fetching items: ${response.status}`);
        }
        
        return await response.json();
      } catch (error) {
        console.error('Error in fetchItems:', error);
        throw error; // Пробрасываем ошибку дальше
      }
    }
  }
}))

.actions({
  fetchItems: ({ update, core }) => {
    update({ isLoading: true, error: null });
    
    core.api.fetchItems()
      .then(items => {
        update({ items, isLoading: false });
      })
      .catch(error => {
        update({ 
          error: error.message, 
          isLoading: false 
        });
      });
  }
})
```

### 4. Инициализация Core

Иногда требуется инициализировать Core при создании частицы:

```javascript
.core(() => {
  // Инициализация сервисов
  const apiClient = createApiClient({
    baseUrl: 'https://api.example.com',
    timeout: 5000
  });
  
  // Возвращаем объект Core
  return {
    api: {
      fetchItems: () => apiClient.get('/items'),
      saveItem: (item) => apiClient.post('/items', item)
    }
  };
})
```

## Заключение

Core в MetaFor предоставляет мощный механизм для взаимодействия с внешними ресурсами и сервисами. Правильное использование Core позволяет создавать хорошо структурированные, тестируемые и поддерживаемые приложения, где бизнес-логика четко отделена от деталей реализации внешних систем.
