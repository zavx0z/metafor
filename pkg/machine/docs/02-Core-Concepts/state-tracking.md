# Отслеживание состояний в Quantum Atom

## Введение

Quantum Atom предоставляет два способа отслеживания переходов состояний:
1. Через параметр `onCollapse` в методе `create()`
2. Через метод `atom.onCollapse()`

Каждый подход имеет свои особенности и сценарии применения.

## Отслеживание через create()

### Синтаксис
```typescript
Atom("name")
  .create({
    id: string,
    state: string,
    onCollapse: (oldState: string, newState: string) => void
  })
```

### Особенности
- Начинает отслеживать переходы с момента создания атома
- Фиксирует первый переход из начального состояния
- Отслеживает переходы, вызванные действиями в конструкторе
- Подписка постоянна и не может быть отменена
- Идеально подходит для отладки и логирования

### Пример использования
```typescript
const atom = Atom("Logger")
  .states("INIT", "PROCESSING", "DONE")
  .create({
    id: "logger",
    state: "INIT",
    onCollapse: (oldState, newState) => {
      console.log(`Переход из ${oldState} в ${newState}`)
    }
  })
```

## Отслеживание через atom.onCollapse()

### Синтаксис
```typescript
const unsubscribe = atom.onCollapse(
  (oldState: string, newState: string) => void
): () => void
```

### Особенности
- Начинает отслеживать только после вызова метода
- Пропускает первоначальные переходы и инициализацию
- Возвращает функцию отписки
- Поддерживает множественные подписки
- Подходит для динамической реакции на переходы

### Пример использования
```typescript
const atom = Atom("Handler")
  .states("IDLE", "ACTIVE")
  .create({
    id: "handler",
    state: "IDLE"
  })

// Подписка на изменения
const unsubscribe = atom.onCollapse((oldState, newState) => {
  if (newState === "ACTIVE") {
    activateExternalSystem()
  }
})

// Отписка когда нужно
unsubscribe()
```

## Множественные подписки

Метод `atom.onCollapse()` поддерживает несколько подписчиков:

```typescript
// Первый подписчик
atom.onCollapse((old, new) => {
  console.log(`Логгер 1: ${old} -> ${new}`)
})

// Второй подписчик
atom.onCollapse((old, new) => {
  console.log(`Логгер 2: ${old} -> ${new}`)
})
```

## Рекомендации по использованию

1. Используйте `onCollapse` в `create()` когда нужно:
   - Отслеживать все переходы с самого начала
   - Логировать состояния для отладки
   - Фиксировать полную историю переходов

2. Используйте `atom.onCollapse()` когда нужно:
   - Динамически подписываться на изменения
   - Реагировать на определенные переходы
   - Иметь возможность отписаться
   - Добавлять несколько обработчиков

## Пример комбинированного использования

```typescript
const atom = Atom("Combined")
  .states("INIT", "PROCESSING", "ERROR", "SUCCESS")
  .create({
    id: "combined",
    state: "INIT",
    // Логирование всех переходов
    onCollapse: (old, new) => {
      console.log(`[${new Date().toISOString()}] ${old} -> ${new}`)
    }
  })

// Реакция на ошибки
atom.onCollapse((old, new) => {
  if (new === "ERROR") {
    notifyErrorSystem()
  }
})

// Метрики успешных операций
atom.onCollapse((old, new) => {
  if (new === "SUCCESS") {
    metrics.increment("successful_operations")
  }
})
``` 