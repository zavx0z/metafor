# Архитектура пакетов и хранилищ

## Определения

| Термин     | Путь                  | Имя пакета            | Пример              |
| ---------- | --------------------- | --------------------- | ------------------- |
| **Проект** | `{project}/`          | `{project}`           | `metafor`           |
| **Домен**  | `{domain}/`           | `@{project}/{domain}` | `@metafor/boundary` |
| **Пакет**  | `{domain}/{package}/` | `@{domain}/{package}` | `@boundary/fields`  |

**Структура:**

```text
{project}/
├── {domain}/                       ← домен
│   ├── {domain}/{package}/         ← пакет
│   └── {domain}/{package}/         ← пакет
└── {domain}/                       ← другой домен
```

**Пример:**

```text
metafor/                            ← проект (metafor)
├── boundary/                       ← домен (@metafor/boundary)
│   ├── boundary/store/             ← пакет (@boundary/store)
│   ├── boundary/fields/            ← пакет (@boundary/fields)
│   └── boundary/matrix/            ← пакет (@boundary/matrix)
├── force/                          ← домен (@metafor/force)
│   ├── force/monad/                ← пакет (@force/monad)
│   └── force/em/                   ← пакет (@force/em)
└── space/                          ← домен (@metafor/space)
```

**Правило импортов:** пакеты могут импортировать из вышестоящего уровня, но не наоборот.

---

## Хранилища (store)

### Типы хранилищ

| Тип           | Путь к пакету         | Файл store                    | Имя пакета            | Для чего                             |
| ------------- | --------------------- | ----------------------------- | --------------------- | ------------------------------------ |
| **Локальное** | `{domain}/{package}/` | `{domain}/{package}/store.ts` | `@{domain}/{package}` | Данные для одного пакета             |
| **Общее**     | `{domain}/store/`     | `{domain}/store/store.ts`     | `@{domain}/store`     | Данные для нескольких пакетов домена |

### Правило размещения данных

> **Данные хранятся там, где их используют.**

| Ситуация                                | Где хранить                      |
| --------------------------------------- | -------------------------------- |
| Использует **один** пакет               | Локальное хранилище этого пакета |
| Используют **несколько** пакетов домена | Общее хранилище домена           |

### Пример

```typescript
// ❌ НЕПРАВИЛЬНО: данные одного пакета в общем store
// boundary/store/store.ts
export const store = {
  fieldsConfig: Config[],  // Использует только @boundary/fields
}

// ✅ ПРАВИЛЬНО: данные одного пакета локально
// boundary/fields/store.ts
export const store = {
  fieldsConfig: Config[],
}

// ✅ ПРАВИЛЬНО: общие данные в общем store
// boundary/store/store.ts
export const store = {
  heap: Uint32Array | null,      // Используют: @boundary/fields, @boundary/matrix
  braneBlockPtrs: number[],      // Используют: @boundary/fields, @boundary/matrix
}
```

---

## Чек-лист для store

Перед добавлением поля в store спроси:

1. Какие пакеты будут использовать это поле?
2. Это 2+ пакета **домена**? → **Общее хранилище домена**
3. Это 1 пакет? → **Локальное хранилище пакета**

---

## Поток данных

```text
{domain}/{package}/orchestrator
    ↓
{domain}/store/
    ↓
{domain}/{package}/executor
```

| Пакет           | Ответственность                    | Пример             |
| --------------- | ---------------------------------- | ------------------ |
| **Оркестратор** | Валидация, кодирование, компиляция | `@boundary/fields` |
| **Хранилище**   | Общие данные между пакетами домена | `@boundary/store`  |
| **Исполнитель** | Низкоуровневые операции            | `@boundary/matrix` |
| **Семантика**   | Бизнес-логика, состояния           | `@force/monad`     |

---

## Структура store-пакета

```text
{domain}/store/
├── store.t.ts      ← интерфейс {Domain}Store
├── store.ts        ← инстанс store
└── package.json    ← имя: @{domain}/store
```

**Пример:**

```text
boundary/store/
├── store.t.ts      ← интерфейс BoundaryStore
├── store.ts        ← инстанс store: BoundaryStore
└── package.json    ← имя: @boundary/store
```

**См. также:**

* `.qwen/rules/module.md#3-Store-файлы` — структура файлов store
* `.qwen/rules/tsdoc.md#2-Store-TSDoc` — формат документации
