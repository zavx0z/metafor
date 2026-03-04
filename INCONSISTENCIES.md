# План устранения несоответствий в MetaFor

> Документ содержит выявленные несоответствия между документацией и кодом, а также план их устранения.

**Дата создания:** 2026-03-04  
**Статус:** Требуется исправление

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
| **MONAD** (`monad/types.ts:97`) | `params: Record<string, unknown>, state: string, superposition: Superposition` |
| **BOUNDARY** (`boundary/fields/index.ts:178`) | `params: [number, value][], state: number, transitions: Collapse[][]` |

**Проблема:** Одинаковое имя для разных структур вызывает путаницу при импорте.

**Решение:**

```typescript
// monad/types.ts
export interface MonadBrane {  // было: Brane
  params: Record<string, unknown>
  state: string
  superposition: Superposition
}
```

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
| `ProcessKey` | `monad/monad.t.ts:52` | `export type ProcessKey = string` |
| `Intention` | `monad/types.ts:42` | `export type Intention = string` |

**Проблема:** Оба типа — алиасы на `string` для одной концепции.

**Решение:**

```typescript
// Удалить Intention, использовать ProcessKey везде
// monad/types.ts
export type Intention = ProcessKey  // алиас для обратной совместимости
```

---

### 10. `Collapse` vs `Transition`

**Тип:** Дублирование концепций

| Тип | Файл | Формат |
|-----|------|--------|
| **`Collapse`** | `boundary/fields/index.t.ts:95` | `[number, Record<number, any>]` (кортеж) |
| **`Transition`** | `monad/monad.t.ts:34` (удалён) | `{ to: number, conditions: Record<number, any> }` (объект) |

**Решение:** Удалить `Transition`, использовать `Collapse` из `@boundary/fields`.

**Выполнено:**

- Удалён интерфейс `Transition` из `monad/monad.t.ts`
- `NumericSuperposition.transitions` теперь использует `Collapse`
- Добавлен импорт `import type { Collapse } from "@boundary/fields"`

---

### 11. Роль `updateBoundary()`

**Тип:** Несоответствие в документации

| Аспект | Значение |
|--------|----------|
| **Документация** | "не вычисляет runtime-переходы" |
| **Код** | Снимает lock через `_updateMatrixHeap()` |
| **Файлы** | `README.md:23-33`, `monad/monad.ts:222-248` |

**Решение:** Уточнить документацию:

```markdown
`updateBoundary()` выполняет **инициализационный commit**:
- пересобирает/синхронизирует boundary под текущий набор монад
- **не выполняет step() FSM** (runtime-эволюцию)
- **может модифицировать lock-флаги** для инициализации birth-событий
- эмитит birth-сигналы для новых монад
```

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

- [ ] **4.1** Исправить формат переходов в `ONTOLOGY.md` (объект → кортеж)
- [ ] **5.1** Удалить дубликат `FieldsDefinition` из `monad/types.ts`
- [ ] **5.2** Удалить дубликат `FieldsDefinition` из `monad/monad.t.ts`
- [ ] **5.3** Сделать ре-экспорт из `monad/types.ts`
- [ ] **6.1** Переименовать `Brane` → `MonadBrane` в `monad/types.ts`
- [ ] **7.1** Принять решение по Strong Force (реализовать/удалить)
- [ ] **7.2** Выполнить решение по Strong Force

### 🟢 Низкой важности

- [x] **8.1** Унифицировать написание Weak Force в документации
- [x] **9.1** Заменить `Intention` → `ProcessKey` или сделать алиасом
- [x] **10.1** Удалить `Transition`, использовать `Collapse`
- [ ] **11.1** Уточнить роль `updateBoundary()` в `README.md`
- [ ] **12.1** Разделить концепции Gravity в `ONTOLOGY.md`

---

## 📊 Статистика

| Категория | Количество | Выполнено |
|-----------|------------|-----------|
| 🔴 Критические | 3 | 3 |
| 🟡 Средней важности | 4 | 0 |
| 🟢 Низкой важности | 3 | 3 |
| **Всего** | **10** | **6** |

**Затронутые файлы:**

- `monad/types.ts`
- `monad/monad.ts`
- `monad/monad.t.ts`
- `monad/field.ts`
- `monad/superposition.ts`
- `boundary/fields/index.ts`
- `boundary/fields/index.t.ts`
- `boundary/fields/prepare.ts`
- `boundary/fields/superposition.ts`
- `ONTOLOGY.md`
- `README.md`
- `monad/README.md`
- `monad/BOUNDARY_LOCK.md`
- `index.ts`
- `space/client.ts`
- `monad/tests/*` (11 файлов)

---

## 🎯 Рекомендации по порядку исправления

1. **Начать с критических** (1-3) — они влияют на API и могут сломать код
2. **Запустить тесты** после каждого критического изменения
3. **Обновить документацию** после исправления кода
4. **Выполнить средние** (4-7) — улучшат согласованность
5. **Завершить низкими** (8-12) — косметические улучшения

---

*Документ будет обновляться по мере исправления несоответствий.*
