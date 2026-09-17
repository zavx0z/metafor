---
description: 
globs: 
alwaysApply: false
---
## Реакции на изменения в других частицах

### Введение

Реакции (reactions) в MetaFor - это механизм, позволяющий частицам реагировать на изменения в других частицах. Они обеспечивают слабую связь между компонентами приложения, позволяя создавать сложные взаимодействия без жесткой зависимости между частицами.

---

### Определение реакций

Реакции определяются с помощью метода `reactions()`, который принимает массив объектов:

```javascript
Particle("CartParticle")
  .states("EMPTY", "HAS_ITEMS", "CHECKOUT")
  .context((t) => ({
    items: t.array({ title: "Список элементов", default: [] }),
    total: t.number({ title: "Общая сумма", default: 0 }),
    userId: t.string({ title: "ID пользователя", nullable: true, default: null }),
  }))
  .reactions([
    {
      source: "UserParticle",
      handler: ({ particle, context }) => {
        const userParticle = Particle("UserParticle")
        return userParticle.onChange(({ state, context: userContext }) => {
          context.update({ userId: userContext.id })
          if (state === "ANONYMOUS") {
            context.update({ items: [], total: 0 })
          }
        })
      },
    },
  ])
```

---

### Структура реакций

Каждая реакция представляет собой объект со следующими свойствами:

```javascript
.reactions([
  {
    source: "OtherParticle",
    path: "context.items",
    op: "update",
    handler: ({ particle, context, state, setState, patch }) => {
      return () => {
        // Функция очистки (опционально)
      };
    }
  }
])
```

#### Доступные параметры обработчика

- **particle**: Функция для доступа к другим частицам
- **context**: Объект для работы с контекстом текущей частицы
- **state**: Текущее состояние частицы
- **setState**: Функция для явного изменения состояния частицы
- **patch**: Информация об изменении, которое вызвало реакцию

#### Возвращаемое значение

Обработчик реакции может возвращать функцию очистки, которая будет вызвана при размонтировании частицы или изменении зависимостей реакции.

---

### Типы реакций

#### Реакция на изменение состояния

```javascript
.reactions([
  {
    source: "ProductParticle",
    handler: ({ particle, context }) => {
      const productParticle = Particle("ProductParticle");
      return productParticle.onStateChange((newState, oldState) => {
        if (newState === "AVAILABLE" && oldState === "OUT_OF_STOCK") {
          context.update({ notification: "Товар снова в наличии!" });
        }
      });
    }
  }
])
```

#### Реакция на изменение контекста

```javascript
.reactions([
  {
    source: "CartParticle",
    path: "context.items",
    handler: ({ particle, context }) => {
      const cartParticle = Particle("CartParticle");
      return cartParticle.onContextChange(({ items }) => {
        context.update({ badgeCount: items.length });
      });
    }
  }
])
```

#### Реакция на любые изменения

```javascript
.reactions([
  {
    source: "AuthParticle",
    handler: ({ particle, context }) => {
      const authParticle = Particle("AuthParticle");
      return authParticle.onChange(({ state, context: authContext }) => {
        if (state === "AUTHENTICATED") {
          context.update({ isLoggedIn: true, username: authContext.user.username });
        } else {
          context.update({ isLoggedIn: false, username: null });
        }
      });
    }
  }
])
```

---

### Практические рекомендации

1. **Используйте реакции для слабой связи** - реакции позволяют частицам взаимодействовать без жесткой зависимости.
2. **Возвращайте функцию очистки** - это поможет избежать утечек памяти.
3. **Избегайте циклических зависимостей** - следите за связями между частицами.
4. **Минимизируйте обновления контекста** - обновляйте контекст только при необходимости.
5. **Документируйте взаимодействия** - поясняйте, как работают реакции.
6. **Используйте селекторы** - для оптимизации работы с контекстом.
7. **Тестируйте взаимодействия** - проверяйте работу реакций в разных сценариях.
