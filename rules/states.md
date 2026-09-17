---
description: 
globs: 
alwaysApply: false
---
## Введение

Состояния являются основным элементом конечного автомата в Метафоре. Они задаются как уникальные строки, определяющие текущие условия работы автомата. Чёткое определение состояний гарантирует простоту и однозначность их использования в логике автомата.

---

## Определение состояний

Состояния определяются с помощью метода `states()`, который принимает список строк:

```javascript
MetaFor("todo-list").states("IDLE", "LOADING", "LOADED", "ERROR")
// ...
```

В этом примере частица `todo-list` может находиться в одном из четырех состояний: `IDLE`, `LOADING`, `LOADED` или `ERROR`.

---

## Правила именования состояний

### 1. Используйте верхний регистр

Названия состояний должны быть написаны в верхнем регистре (UPPERCASE), чтобы визуально отличать их от других идентификаторов в коде.

```javascript
// Правильно
.states("IDLE", "LOADING", "LOADED", "ERROR")

// Неправильно
.states("idle", "loading", "loaded", "error")
```

### 2. Используйте описательные имена

Названия состояний должны быть описательными и отражать суть состояния частицы.

```javascript
// Правильно
.states("AUTHENTICATED", "ANONYMOUS", "AUTHENTICATING")

// Неправильно
.states("STATE1", "STATE2", "STATE3")
```

### 3. Используйте пробелы для составных имен

Если состояние включает несколько слов, разделяйте их пробелами. Не используйте нижнее подчеркивание (`_`) или другие символы.

```javascript
// Правильно
.states("IDLE", "LOADING", "LOAD ERROR", "VALIDATION ERROR")

// Неправильно
.states("IDLE", "LOADING", "LOAD_ERROR", "VALIDATION_ERROR")
```

### 4. Обеспечьте уникальность

Каждое состояние должно быть уникальным в рамках одной частицы. Дублирование состояний приведет к ошибке.

```javascript
// Правильно
.states("IDLE", "LOADING", "LOADED", "ERROR")

// Неправильно (дублирование состояния ERROR)
.states("IDLE", "LOADING", "LOADED", "ERROR", "ERROR")
```

---

## Типичные шаблоны состояний

### 1. Шаблон загрузки данных

```javascript
.states("IDLE", "LOADING", "LOADED", "ERROR")
```

Этот шаблон подходит для частиц, которые загружают данные с сервера:

- `IDLE` - начальное состояние, данные еще не загружались
- `LOADING` - данные загружаются
- `LOADED` - данные успешно загружены
- `ERROR` - произошла ошибка при загрузке данных

### 2. Шаблон аутентификации

```javascript
.states("ANONYMOUS", "AUTHENTICATING", "AUTHENTICATED", "AUTH ERROR")
```

Этот шаблон подходит для частиц, управляющих аутентификацией:

- `ANONYMOUS` - пользователь не аутентифицирован
- `AUTHENTICATING` - процесс аутентификации
- `AUTHENTICATED` - пользователь успешно аутентифицирован
- `AUTH ERROR` - ошибка аутентификации

### 3. Шаблон формы

```javascript
.states("INITIAL", "VALIDATING", "VALID", "INVALID", "SUBMITTING", "SUBMITTED", "SUBMIT ERROR")
```

Этот шаблон подходит для частиц, управляющих формами:

- `INITIAL` - форма в начальном состоянии
- `VALIDATING` - проверка данных формы
- `VALID` - данные формы валидны
- `INVALID` - данные формы невалидны
- `SUBMITTING` - отправка данных формы
- `SUBMITTED` - данные формы успешно отправлены
- `SUBMIT ERROR` - ошибка при отправке данных формы

---

## Примеры использования

### Пример 1: Частица для управления списком задач

```javascript
const todoListParticle = MetaFor("todo-list")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  .context((t) => ({
    items: t.array({ title: "Список элементов", default: [] }),
    isLoading: t.boolean({ title: "Состояние загрузки", default: false }),
    error: t.string({ title: "Сообщение об ошибке", nullable: true, default: null }),
  }))
  .transitions([
    { from: "IDLE", to: "LOADING", trigger: { isLoading: true } },
    { from: "LOADING", to: "LOADED", trigger: { items: { length: { gt: 0 } } } },
    { from: "LOADING", to: "ERROR", trigger: { error: { isNull: false } } },
    { from: "ERROR", to: "IDLE", trigger: { error: null } },
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
  })
  .create({
    state: "IDLE",
  })
```

---

## Практические рекомендации

1. **Определяйте состояния в начале** создания частицы, чтобы иметь четкое представление о возможных состояниях.
2. **Используйте минимально необходимое количество состояний** - слишком много состояний может усложнить логику частицы.
3. **Группируйте связанные состояния** - например, различные типы ошибок могут быть объединены в одно состояние `ERROR` с различными значениями в контексте.
4. **Документируйте назначение каждого состояния** - это поможет другим разработчикам понять логику работы частицы.
5. **Следите за согласованностью именования** - используйте одинаковый стиль именования состояний во всех частицах приложения.
