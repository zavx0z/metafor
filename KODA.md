# MetaFor - Анализ кодовой базы

## Обзор

MetaFor — это фреймворк для создания web-компонентов с конечным автоматом, основанный на принципах [Quantum Theory of Programming](atom/doc/qTp.md). Главная особенность — полная изоляция атомов с взаимодействием через систему фотонов/импульсов.

## Ключевые концепции

### 1. Атомы (Atoms)
- Основные единицы вычисления
- Имеют уникальные позиционные пути (`0/1/2`)
- Полная изоляция с независимой реализацией
- Взаимодействие только через фотоны

### 2. Фотоны/Импульсы
- Аналог реальных фотонов в квантовой физике
- Переносят данные о событиях через поле
- Кодирование информации в свойствах:
  - **Интенсивность** → количество патчей в `photon.impulses`
  - **Частота** → пара `meta` + `atom` (источник)
  - **Поляризация** → `path` и `op` (JSON Patch)
  - **Фаза** → `timestamp` и позиция в EM стеке
  - **Суперпозиция** → целевое состояние атома

### 3. Архитектура актора

#### Context - только примитивы
```typescript
.context((types) => ({
  name: types.string.required("Guest"),
  age: types.number.required(18),
  tags: types.array.required(["default"]),
}))
```

#### Core - сложные структуры
```typescript
.core((ref) => ({
  users: new Map<number, User>(),
  socket: null as WebSocket | null,
  formRef: ref(),
}))
```

#### States - суперпозиция
```typescript
.states({
  idle: { loading: { userId: { gt: 0 } } },
  loading: { success: { data: { notEq: null } } },
  success: { idle: {}, editing: { mode: { eq: "edit" } } },
})
```

#### Processes - поведение при входе в состояние
```typescript
.processes((process) => ({
  loading: process({ label: "Load" })
    .action(async ({ context }) => fetch(`/api/${context.userId}`))
    .success(({ update, data }) => update({ userName: data.name }))
    .error(({ update, error }) => update({ error: error.message })),
}))
```

#### Reactions - отклик на чужие импульсы
```typescript
.reactions((reaction) => [
  [
    ["idle", "loading"],
    reaction({ label: "Message from child-user" })
      .filter(({ context }) => ({
        meta: "child-user",
        op: "replace",
        path: "/context",
        value: { userId: { gt: 0 } },
      }))
      .equal(({ update, patch, self }) => {
        update({ selectedUserId: patch.value.userId })
        if (patch.value.userId === 0) self.destroy()
      }),
  ],
])
```

#### View - представление
```typescript
.view({
  render: ({ context, html }) => html`
    <div>${context.userName}</div>
  `,
  style: ({ css }) => css`.component { padding: 16px; }`,
})
```

## Структура проекта

```
metafor/
├── meta/              # Язык описания акторов
├── atom/              # Runtime и распределенный конечный автомат
├── infra/             # Инфраструктура
│   ├── inspect/       # Инспекция стека импульсов
│   ├── virtual/       # Визуализация поля и зависимостей
│   └── mesh/          # Сетевая топология
└── shared/            # Общие ресурсы
```

## Экосистема пакетов

| Пакет            | Назначение                              |
| ---------------- | --------------------------------------- |
| `@metafor/meta`    | Декларативные схемы, `MetaFor()` цепочка |
| `@metafor/atom`    | Runtime, распределенный конечный автомат |
| `@metafor/inspect` | Инспекция импульсов, управление временем |
| `@metafor/virtual` | Визуализация поля и атомных зависимостей |

## Особенности реализации

### Реакции
- Декларативные фильтры с доступом к `self` и `context`
- Поддержка сложных условий через `checkCondition`
- Фильтрация по: `meta`, `atom`, `path`, `op`, `value`, `timestamp`
- Активность только в определенных состояниях

### Состояния
- Функция `decoherence` проверяет условия переходов
- Поддержка операторов: `eq`, `gt`, `gte`, `lt`, `lte`, `between`, `pattern`, `includes`
- Валидация отсутствия безусловных циклов
- Обработка примитивов, массивов, объектов

### Типобезопасность
- TypeScript для всех компонентов
- Схемы контекста через `@zavx0z/context`
- Типизированные процессы и реакции
- Поддержка generic-ов для переиспользования

## Преимущества

1. **Изоляция**: Каждый атом независим и безопасен
2. **Декларативность**: Описание через схемы и условия
3. **Типобезопасность**: Полная поддержка TypeScript
4. **Наблюдаемость**: Инструменты инспекции и визуализации
5. **Масштабируемость**: Иерархическая структура с позиционными путями

## Статус проекта

- Активная разработка
- Возможны breaking changes
- Готов к продакшену с фиксацией версий
- Поддержка Bun, TypeScript 5.9+

## Развитие

Проект следует принципам квантовой теории программирования, где:
- Топология поля управляет взаимодействиями
- Атомы сохраняют изоляцию
- Фотоны переносят информацию без прямых ссылок
- Состояния находятся в суперпозиции до измерения