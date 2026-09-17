# Взаимодействие компонентов в MetaFor

## Введение

MetaFor предоставляет мощный механизм взаимодействия между различными компонентами системы. Этот документ описывает, как частицы могут взаимодействовать друг с другом, обеспечивая согласованное поведение и предсказуемые изменения состояния.

## Способы взаимодействия между частицами

### 1. Реакции (Reactions)

Реакции позволяют частицам реагировать на изменения в других частицах:

```javascript
// Серверный код (TypeScript)
import { MetaFor } from "metafor"

const userParticle = MetaFor("user")
  .states("LOGGED_OUT", "LOGGED_IN")
  .context((t) => ({
    username: t.string({ default: "" }),
    isAuthenticated: t.boolean({ default: false }),
  }))
  .create({
    state: "LOGGED_OUT",
  })

const cartParticle = MetaFor("cart")
  .states("EMPTY", "HAS_ITEMS", "CHECKOUT")
  .context((t) => ({
    items: t.array({ default: [] }),
    user: t.object({
      username: t.string({ default: "" }),
      isAuthenticated: t.boolean({ default: false }),
    }),
  }))
  .reactions([
    {
      // Реакция на изменения в userParticle
      source: "user",
      handler: ({ update, patch }) => {
        // Обновляем данные пользователя в корзине
        update({
          user: {
            username: patch.context.username,
            isAuthenticated: patch.context.isAuthenticated,
          },
        })
      },
    },
  ])
  .create({
    state: "EMPTY",
  })
```

Для клиентского кода:

```javascript
// Клиентский код (VanillaJS)
import { MetaFor } from "./metafor.js"

const userParticle = MetaFor("user")
  .states("LOGGED_OUT", "LOGGED_IN")
  .context((t) => ({
    username: t.string({ default: "" }),
    isAuthenticated: t.boolean({ default: false }),
  }))
  .create({
    state: "LOGGED_OUT",
  })

const cartParticle = MetaFor("cart")
  .states("EMPTY", "HAS_ITEMS", "CHECKOUT")
  .context((t) => ({
    items: t.array({ default: [] }),
    user: t.object({
      username: t.string({ default: "" }),
      isAuthenticated: t.boolean({ default: false }),
    }),
  }))
  .reactions([
    {
      // Реакция на изменения в userParticle
      source: "user",
      handler: ({ update, patch }) => {
        // Обновляем данные пользователя в корзине
        update({
          user: {
            username: patch.context.username,
            isAuthenticated: patch.context.isAuthenticated,
          },
        })
      },
    },
  ])
  .create({
    state: "EMPTY",
  })
```

В этом примере `cartParticle` реагирует на изменения в `userParticle` и обновляет свой контекст соответствующим образом.

### 2. Прямое обновление контекста

Частицы могут напрямую обновлять контекст других частиц:

```javascript
// Обновление контекста другой частицы
userParticle.update({ 
  username: "john_doe", 
  isAuthenticated: true 
});

// Это вызовет реакцию в cartParticle, которая обновит свой контекст
```

### 3. Использование общего хранилища

Для более сложных сценариев взаимодействия можно использовать общее хранилище:

```javascript
// Создание общего хранилища
const store = {
  user: userParticle,
  cart: cartParticle,
  products: productsParticle,
}

// Использование в компоненте
function ProductList() {
  const products = store.products.context.items;
  const addToCart = (product) => {
    store.cart.update({
      items: [...store.cart.context.items, product]
    });
  };
  
  // Рендеринг списка продуктов
}
```

## Примеры взаимодействия компонентов

### Пример 1: Авторизация и доступ к защищенным ресурсам

```javascript
// Атом авторизации
const authParticle = MetaFor("auth")
  .states("LOGGED_OUT", "LOGGING_IN", "LOGGED_IN", "ERROR")
  .context((t) => ({
    user: t.object({
      id: t.string({ default: "" }),
      username: t.string({ default: "" }),
    }),
    token: t.string({ default: "" }),
    error: t.string({ default: null }),
  }))
  .actions({
    login: ({ update, core, setState, context }) => {
      setState("LOGGING_IN");
      
      core.api.login(context.user.username, context.password)
        .then(response => {
          update({
            user: response.user,
            token: response.token,
            error: null,
          });
          setState("LOGGED_IN");
        })
        .catch(error => {
          update({ error: error.message });
          setState("ERROR");
        });
    },
    logout: ({ update, setState }) => {
      update({
        user: { id: "", username: "" },
        token: "",
      });
      setState("LOGGED_OUT");
    }
  })
  .create({
    state: "LOGGED_OUT",
  })

// Атом защищенных ресурсов
const resourcesParticle = MetaFor("resources")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  .context((t) => ({
    items: t.array({ default: [] }),
    error: t.string({ default: null }),
    authToken: t.string({ default: "" }),
  }))
  .reactions([
    {
      source: "auth",
      handler: ({ update, patch }) => {
        // Обновляем токен авторизации при изменении в authParticle
        update({
          authToken: patch.context.token,
        });
        
        // Если пользователь вышел из системы, очищаем ресурсы
        if (patch.state === "LOGGED_OUT") {
          update({
            items: [],
          });
        }
      },
    },
  ])
  .actions({
    fetchResources: ({ update, core, context, setState }) => {
      // Проверяем наличие токена авторизации
      if (!context.authToken) {
        update({ error: "Требуется авторизация" });
        setState("ERROR");
        return;
      }
      
      setState("LOADING");
      
      core.api.fetchResources(context.authToken)
        .then(resources => {
          update({
            items: resources,
            error: null,
          });
          setState("LOADED");
        })
        .catch(error => {
          update({ error: error.message });
          setState("ERROR");
        });
    }
  })
  .create({
    state: "IDLE",
  })
```

В этом примере `resourcesParticle` реагирует на изменения в `authParticle` и обновляет свой токен авторизации. Когда пользователь выходит из системы, ресурсы автоматически очищаются.

### Пример 2: Корзина и оформление заказа

```javascript
// Атом корзины
const cartParticle = MetaFor("cart")
  .states("EMPTY", "HAS_ITEMS", "CHECKOUT", "COMPLETED")
  .context((t) => ({
    items: t.array({ default: [] }),
    total: t.number({ default: 0 }),
    userId: t.string({ default: "" }),
  }))
  .transitions([
    {
      from: "EMPTY",
      to: [{ state: "HAS_ITEMS", trigger: { items: { length: { gt: 0 } } } }],
    },
    {
      from: "HAS_ITEMS",
      to: [{ state: "EMPTY", trigger: { items: { length: { eq: 0 } } } }],
    },
  ])
  .reactions([
    {
      source: "auth",
      handler: ({ update, patch }) => {
        update({
          userId: patch.context.user.id,
        });
      },
    },
  ])
  .actions({
    checkout: ({ update, core, setState, context }) => {
      setState("CHECKOUT");
      
      core.api.createOrder({
        userId: context.userId,
        items: context.items,
        total: context.total,
      })
        .then(() => {
          update({ items: [], total: 0 });
          setState("COMPLETED");
        })
        .catch(error => {
          setState("HAS_ITEMS");
        });
    }
  })
  .create({
    state: "EMPTY",
  })

// Атом заказов
const ordersParticle = MetaFor("orders")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  .context((t) => ({
    orders: t.array({ default: [] }),
    error: t.string({ default: null }),
  }))
  .reactions([
    {
      source: "cart",
      handler: ({ update, patch, core, setState }) => {
        // Если корзина перешла в состояние COMPLETED, обновляем список заказов
        if (patch.state === "COMPLETED") {
          setState("LOADING");
          
          core.api.fetchOrders()
            .then(orders => {
              update({
                orders,
                error: null,
              });
              setState("LOADED");
            })
            .catch(error => {
              update({ error: error.message });
              setState("ERROR");
            });
        }
      },
    },
  ])
  .create({
    state: "IDLE",
  })
```

В этом примере `ordersParticle` реагирует на изменения в `cartParticle`. Когда заказ успешно оформлен (корзина переходит в состояние `COMPLETED`), частица заказов автоматически обновляет список заказов.

## Практические рекомендации

1. **Используйте реакции для слабой связи между частицами** — это позволяет создавать модульные и переиспользуемые компоненты.

2. **Определяйте четкие границы ответственности** — каждая частица должна отвечать за конкретную функциональность.

3. **Избегайте циклических зависимостей** — они могут привести к бесконечным циклам обновлений.

4. **Используйте общее хранилище для доступа к частицам** — это упрощает организацию кода и тестирование.

5. **Документируйте взаимодействия между частицами** — это помогает понять архитектуру приложения.

## Заключение

Механизм взаимодействия компонентов в MetaFor позволяет создавать сложные, но при этом хорошо структурированные приложения. Используя реакции и прямые обновления контекста, вы можете организовать эффективное взаимодействие между различными частями вашего приложения, сохраняя при этом модульность и тестируемость кода.
