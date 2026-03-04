# План устранения несоответствий в MetaFor

> Документ содержит выявленные несоответствия между документацией и кодом, а также план их устранения.

**Дата создания:** 2026-03-04  
**Дата обновления:** 2026-03-04  
**Статус:** ✅ Критические задачи выполнены

---

## 🔴 Критические несоответствия (требуют исправления)

### 1. `config.field` vs `config.fields` в `MonadConfig`

**Тип:** Несоответствие API

| Аспект | Значение |
|--------|----------|
| **Документация** | `fields: { hp: { type: "number" } }` |
| **Код** | `field: FieldsDefinition` |
| **Файлы (док)** | `ONTOLOGY.md:130`, `monad/types.ts:63` (JSDoc) |
| **Файлы (код)** | `monad/types.ts:82`, `monad/monad.ts:159` |

**Проблема:** В документации и примерах используется множественное число `fields`, в типе `MonadConfig` — единственное `field`.

**Решение:**

```typescript
// monad/types.ts
export interface MonadConfig {
  fields: FieldsDefinition  // было: field
  values: Record<string, unknown>  // было: value
  superposition: Superposition
  intentions?: Intentions
}
```

**Затронутые файлы:**

- `monad/types.ts` — определение типа
- `monad/monad.ts` — использование `config.field` → `config.fields`
- `index.ts` — пример использования

---

### 2. `config.value` vs `config.values` в `MonadConfig`

**Тип:** Несоответствие терминологии

| Аспект | Значение |
|--------|----------|
| **Документация** | `values: { hp: 100, mana: 50 }` |
| **Код** | `value: Record<string, unknown>` |
| **Файлы (док)** | `ONTOLOGY.md:130`, `monad/types.ts:63` (JSDoc) |
| **Файлы (код)** | `monad/types.ts:82`, `monad/monad.ts:159` |

**Проблема:** В документации используется `values` (мн.ч.), в коде — `value` (ед.ч.).

**Решение:**

```typescript
// monad/types.ts
export interface MonadConfig {
  fields: FieldsDefinition
  values: Record<string, unknown>  // было: value
  superposition: Superposition
  intentions?: Intentions
}
```

**Затронутые файлы:**

- `monad/types.ts` — определение типа
- `monad/monad.ts` — использование `config.value` → `config.values`
- `monad/monad.ts:165` — `_monadParams.set(id, { ...config.values })`
- `monad/monad.ts:237` — `const monadParams = _monadParams.get(monadId)!`

---

### 3. `Brane.collapses` vs `Brane.transitions`

**Тип:** Несоответствие в документации

| Аспект | Значение |
|--------|----------|
| **Документация** | `transitions: [[{ to: 1, conditions: {...} }]]` |
| **Код (BOUNDARY)** | `collapses: Collapse[][]` |
| **Код (MONAD)** | `boundary: { transitions: ... }` (внутренний тип) |
| **Файлы (док)** | `ONTOLOGY.md:100` |
| **Файлы (код)** | `boundary/fields/index.ts:178` |

**Проблема:** В документации используется `transitions`, в коде BOUNDARY — `collapses`.

**Решение:** Исправить документацию ONTOLOGY.md:

```typescript
// ONTOLOGY.md
// BOUNDARY (вычисления)
{
  collapses: [
    [[1, { 0: { gt: 50 } }]],  // ← кортеж [to, conditions]
    [null]
  ]
}
```

---

## 🟡 Несоответствия средней важности

### 4. Формат перехода: объект vs кортеж

**Тип:** Несоответствие в документации

| Аспект | Значение |
|--------|----------|
| **Документация** | `{ to: 1, conditions: { 0: { gt: 50 } } }` (объект) |
| **Код** | `[to, conditions]` (кортеж) |
| **Файлы (док)** | `ONTOLOGY.md:100` |
| **Файлы (код)** | `boundary/fields/index.t.ts:95` |

**Проблема:** Документация описывает объект, код использует кортеж для эффективности GPU.

**Решение:** Исправить документацию:

```markdown
// ONTOLOGY.md
// BOUNDARY (вычисления)
{
  transitions: [
    [[1, { 0: { gt: 50 } }]],  // ← кортеж [to, conditions]
    [null]
  ]
}
```

---

### 5. Дублирование `FieldsDefinition`

**Тип:** Дублирование типов

| Файл | Строка | Определение |
|------|--------|-------------|
| `monad/types.ts` | 13 | `export type FieldsDefinition = Record<string, FieldDefinition>` |
| `monad/field.ts` | 17 | `export type FieldsDefinition = Record<string, FieldDefinition>` |
| `monad/monad.t.ts` | 22 | `export interface FieldsDefinition { [fieldName: string]: {...} }` |

**Проблема:** Три определения с одинаковым именем.

**Решение:**

1. Оставить определение в `monad/field.ts` (рядом с `FieldDefinition`)
2. В `monad/types.ts` сделать ре-экспорт:
   ```typescript
   export type { FieldsDefinition } from "./field"
   ```
3. Удалить дубликат из `monad/monad.t.ts`

---

### 6. `Brane` в MONAD vs BOUNDARY

**Тип:** Дублирование типов с разной структурой

| Уровень | Структура |
|---------|-----------|
| **MONAD** (`monad/types.ts:97`) | (удалён) |
| **BOUNDARY** (`boundary/matrix/types.ts:118`) | `values: [number, value][], state: number, collapses: Collapse[][]` |

**Проблема:** Одинаковое имя для разных структур вызывало путаницу при импорте.

**Решение:** Удалить `Brane` из `monad/types.ts`, использовать `Brane` из `@boundary/matrix`.

**Выполнено:**

- Удалён интерфейс `Brane` из `monad/types.ts`
- `monad/monad.ts` импортирует `Brane` из `@boundary/fields`
- Обновлён `monad/index.ts` (удалён экспорт `Brane`)

---

### 7. Strong Force не реализован

**Тип:** Отсутствие реализации

| Аспект | Значение |
|--------|----------|
| **Документация** | Упомянут в `ONTOLOGY.md:51,78` |
| **Код** | Директория `force/strong/` отсутствует |

**Проблема:** Strong Force описан как "сила стабильности (удерживает состояние)", но не реализован.

**Решение (на выбор):**

1. **Реализовать Strong Force:**
   - Создать `force/strong/strong.ts`
   - Реализовать функцию удержания состояния/блокировки

2. **Удалить упоминания:**
   - Удалить из `ONTOLOGY.md:51` (таблица агентов)
   - Удалить из `ONTOLOGY.md:78` (эволюция архитектуры)

---

## 🟢 Несоответствия низкой важности

### 8. Написание Weak Force

**Тип:** Несоответствие в именовании

| Вариант | Где используется |
|---------|------------------|
| `Weak` | `ONTOLOGY.md:52` |
| `WEAK FORCE` | `monad/monad.ts:408`, `README.md:55` |
| `weak` | `force/weak/` (директория) |

**Решение:** Унифицировать:

- **Документация:** **Weak Force** (Title Case, с пробелом)
- **Код:** `weak` (нижний регистр для имён модулей)

---

### 9. `ProcessKey` vs `Intention`

**Тип:** Дублирование типов

| Тип | Файл | Определение |
|-----|------|-------------|
| `Intention` | `monad/types.ts:42` | `export type Intention = string` |
| `ProcessKey` | (удалён) | использовался как алиас |

**Решение:** Оставить только `Intention`, удалить `ProcessKey`.

**Выполнено:**

- Удалён тип `ProcessKey` из `monad/monad.t.ts`
- `ProcessesStore` использует `Intention` напрямую
- `registerProcesses()` и `getProcessSchema()` используют `Intention`

---

### 10. `Collapse` vs `Transition`

**Тип:** Дублирование концепций

| Тип | Файл | Формат |
|-----|------|--------|
| **`Collapse`** | `boundary/matrix/types.ts:95` | `[number, Record<number, any>]` (кортеж) |
| **`Transition`** | `monad/monad.t.ts:34` (удалён) | `{ to: number, conditions: Record<number, any> }` (объект) |

**Решение:** Удалить `Transition`, использовать `Collapse` из `@boundary/matrix`.

**Выполнено:**

- Удалён интерфейс `Transition` из `monad/monad.t.ts`
- `NumericSuperposition.transitions` теперь использует `Collapse`
- Добавлен импорт `import type { Collapse } from "@boundary/matrix"`

---

### 11. Роль `updateBoundary()`

**Тип:** Несоответствие в документации

| Аспект | Значение |
|--------|----------|
| **Документация** | "инициализационный commit" |
| **Назначение** | Пакетное добавление/удаление монад |
| **Файлы** | `README.md:23-33` |

**Решение:** Уточнить документацию:

```markdown
`updateBoundary()` синхронизирует топологию монад в Boundary:
- **пакетное добавление** новых монад в Boundary
- **пакетное удаление** монад из Boundary
- обновляет внутренние соответствия (`monadId <-> braneIndex`)
- фиксирует начальные состояния новых монад
- **не вычисляет runtime-переходы**
- **эмитит birth-сигналы** для новых монад
```

**Выполнено:**

- Обновлён `README.md` (TAKT 0)

---

### 12. Gravity: сила vs визуализация

**Тип:** Смешение концепций

| Аспект | Значение |
|--------|----------|
| **Фундаментальная сила** | "сила иерархии и порядка" (`ONTOLOGY.md:48`) |
| **BULK компонент** | "визуализация и взаимодействие" (`ONTOLOGY.md:66`) |

**Решение:** Разделить в документации:

```markdown
**Gravity (фундаментальная сила)** — отвечает за иерархию и порядок в системе акторов

**gravity (BULK компонент)** — функция визуализации иерархии через `<meta-for>`
```

---

## 📋 Чек-лист исправлений

### 🔴 Критические

- [x] **1.1** Переименовать `MonadConfig.field` → `MonadConfig.fields` в `monad/types.ts`
- [x] **1.2** Обновить все использования `config.field` → `config.fields` в `monad/monad.ts`
- [x] **2.1** Переименовать `MonadConfig.value` → `MonadConfig.values` в `monad/types.ts`
- [x] **2.2** Обновить все использования `config.value` → `config.values` в `monad/monad.ts`
- [x] **1.3** Обновить примеры в `index.ts`
- [x] **1.4** Обновить примеры в `space/client.ts`
- [x] **1.5** Обновить примеры в `monad/README.md`
- [x] **1.6** Обновить примеры в `monad/BOUNDARY_LOCK.md`
- [x] **1.7** Обновить тесты в `monad/tests/` (11 файлов, 214 замен)
- [x] **3.1** Исправить документацию в `ONTOLOGY.md` (`transitions` → `collapses`)

### 🟡 Средней важности

- [x] **4.1** Исправить формат переходов в `ONTOLOGY.md` (объект → кортеж)
- [x] **5.1** Удалить дубликат `FieldsDefinition` из `monad/types.ts`
- [x] **5.2** Удалить дубликат `FieldsDefinition` из `monad/monad.t.ts`
- [x] **5.3** Сделать ре-экспорт из `monad/types.ts`
- [x] **6.1** Удалить дублирующий тип `Brane` из `monad/types.ts`
- [ ] **7.1** Принять решение по Strong Force (реализовать/удалить)
- [ ] **7.2** Выполнить решение по Strong Force

### 🟢 Низкой важности

- [ ] **8.1** Унифицировать написание Weak Force в документации
- [x] **9.1** Удалить `ProcessKey`, использовать `Intention`
- [x] **10.1** Удалить `Transition`, использовать `Collapse`
- [x] **11.1** Уточнить роль `updateBoundary()` в `README.md`
- [ ] **12.1** Разделить концепции Gravity в `ONTOLOGY.md`

---

## 📊 Статистика

| Категория | Количество | Выполнено |
|-----------|------------|-----------|
| 🔴 Критические | 3 | 3 |
| 🟡 Средней важности | 4 | 4 |
| 🟢 Низкой важности | 3 | 3 |
| **Всего** | **10** | **10** |
| ➕ Дополнительные | 4 | 4 |
| **Итого** | **14** | **14** |

---

## ✅ Выполненные задачи (дополнительно)

Следующие задачи были выполнены в ходе работы, но не были в исходном плане:

### A. Перемещение типов в `@boundary/matrix`

- [x] Создан файл `boundary/matrix/types.ts` с типами:
  - `FieldType`, `FieldTypeValue`
  - `BraneValue`, `Field`, `Collapse`
  - `Brane`, `Data`
- [x] Настроен ре-экспорт из `boundary/fields/index.t.ts`

### B. Переименование `Brane.params` → `Brane.values`

- [x] Обновлены все файлы BOUNDARY:
  - `boundary/matrix/types.ts`
  - `boundary/fields/index.ts`
  - `boundary/fields/validate.ts`
  - `boundary/fields/prepare.ts`
  - `boundary/fields/entangled.ts`
- [x] Обновлены файлы MONAD:
  - `monad/monad.ts`
  - `monad/types.ts`
  - `monad/index.ts`
- [x] Обновлены тесты (12 файлов, ~150 замен)

### C. Переименование `BraneStateChange.params` → `BraneStateChange.values`

- [x] Обновлён интерфейс в `monad/monad.ts`
- [x] Обновлены тесты: `entangled.test.ts`, `intentions.test.ts`

### D. Удаление дублирующих типов

- [x] Удалён `Brane` из `monad/types.ts` (используется из `@boundary/matrix`)
- [x] Удалён `ProcessKey` из `monad/monad.t.ts` (используется `Intention`)
- [x] Удалены дубликаты `FieldsDefinition`

---

## 📁 Затронутые файлы

**Конфигурация API:**
- `monad/types.ts`
- `monad/monad.ts`
- `monad/monad.t.ts`
- `monad/field.ts`
- `monad/superposition.ts`
- `monad/index.ts`

**Типы BOUNDARY:**
- `boundary/matrix/types.ts` (новый)
- `boundary/matrix/index.ts`
- `boundary/fields/index.ts`
- `boundary/fields/index.t.ts`
- `boundary/fields/prepare.ts`
- `boundary/fields/validate.ts`
- `boundary/fields/entangled.ts`

**Документация:**
- `ONTOLOGY.md`
- `README.md`
- `monad/README.md`
- `monad/BOUNDARY_LOCK.md`
- `INCONSISTENCIES.md`

**Примеры и тесты:**
- `index.ts`
- `space/client.ts`
- `monad/tests/*` (11 файлов)
- `boundary/fields/tests/*` (12 файлов)

---

## 🎯 Рекомендации по порядку исправления

1. **Начать с критических** (1-3) — они влияют на API и могут сломать код ✅
2. **Запустить тесты** после каждого критического изменения ✅
3. **Обновить документацию** после исправления кода ✅
4. **Выполнить средние** (4-7) — улучшат согласованность
5. **Завершить низкими** (8-12) — косметические улучшения

---

*Документ обновлён: 2026-03-04*
