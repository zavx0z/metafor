# TSDoc Standards

## 1. Философия

Документация объясняет **"Зачем"** и **"Как"**, а не **"Что"**.

* **⛔ Запрещено:** Переводить названия переменных на русский
* **⛔ Запрещено:** Создавать TSDoc ради галочки
* **✅ Требуется:** Описывать неявные связи и ограничения

---

## 2. Store TSDoc

### 2.1. Формат для store.ts

```typescript
/**
 * Краткое описание хранилища.
 *
 * Заполняется в `@{domain}/orchestrator`, используется в `@{domain}/executor`.
 *
 * @property data {@link ModuleStore.data|описание}
 * @property offset {@link ModuleStore.offset|описание}
 *
 * @see {@link ModuleStore} — тип состояния
 */
export const store: ModuleStore = {
  /** {@link ModuleStore.data|Описание поля}. */
  data: null as unknown as Uint32Array,
  /** {@link ModuleStore.offset|Описание поля}. */
  offset: 0,
}
```

### 2.2. Формат для store.t.ts

```typescript
/**
 * Состояние хранилища `@{domain}/store`.
 *
 * Хранит данные, которые используют несколько пакетов:
 * - {@link ModuleStore.data | data} — для инициализации
 * - {@link ModuleStore.offset | offset} — для операций
 */
export interface ModuleStore {
  /** Краткое описание поля. */
  data: Uint32Array

  /** Краткое описание поля. */
  offset: number
}
```

### 2.3. Правила

| Элемент               | Формат                                 | Пример                           |
| --------------------- | -------------------------------------- | -------------------------------- |
| **Названия пакетов**  | Литералы                               | `` `@{domain}/pkg` ``            |
| **Ссылки на типы**    | `{@link}`                              | `{@link ModuleStore}`            |
| **Ссылки на поля**    | `{@link Interface.field}`              | `{@link ModuleStore.data}`       |
| **@property в store** | `@property field {@link Type.field\|описание}` | ✅ |

### 2.4. Частые ошибки

``` typescript
// ❌ НЕПРАВИЛЬНО: {@link} для пакетов
{@link @{domain}/pkg}

// ✅ ПРАВИЛЬНО: литералы для пакетов
`@{domain}/pkg`
```

``` typescript
// ❌ НЕПРАВИЛЬНО: TSDoc полей только в интерфейсе
export interface Store {
  /**
   * Подробное описание поля...
   * Многострочный текст...
   */
  field: string
}

// ✅ ПРАВИЛЬНО: TSDoc полей в шапке store через @property
/**
 * @property field {@link Store.field|описание}
 */
export const store: Store = { ... }
```

---

## 3. Методы

### 3.1. @param

- **⛔ Запрещено:** `@param {number} id` — типы уже есть в сигнатуре
- **✅ Требуется:** `@param id - UUID в формате v4`

### 3.2. @returns

- **⛔ Запрещено:** `@returns {boolean}` — тип уже есть
- **✅ Требуется:** `@returns true, если операция успешна`

---

## 4. Интерфейсы

**Правило:** TSDoc для полей интерфейса — краткое, в одну строку.

```typescript
// ✅ ПРАВИЛЬНО
export interface Store {
  /** Краткое описание. */
  field: string
}

// ❌ НЕПРАВИЛЬНО: многострочное описание в интерфейсе
export interface Store {
  /**
   * Подробное описание...
   * Дополнительная информация...
   */
  field: string
}
```

**Подробное описание** — в шапке store через `@property`.

---

## 5. Ссылки

| Тип              | Формат                                 |
| ---------------- | -------------------------------------- |
| Пакет            | `` `@{domain}/pkg` ``                  |
| Тип              | `{@link TypeName}`                     |
| Поле типа        | `{@link TypeName.field}`               |
| Поле в @property | `@property field {@link Type.field\|описание}` |

---

**См. также:**

* `.qwen/rules/module.md#3-Store-файлы` — структура файлов store
* `.qwen/rules/packages.md#2-Хранилища-store` — где размещать store
