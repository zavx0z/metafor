# 🔴 Несоответствия: entangled-analysis-plan.md vs entangled-dataflow.drawio vs entangled-plan.md

**Дата:** 5 марта 2026
**Статус:** На утверждении

---

## 📊 Сводная таблица

| Компонент | Поле | Analysis | Drawio | Plan | Статус |
|-----------|------|----------|--------|------|--------|
| **Field Store** | uuid | ✅ | ✅ | ❌ | ⚠️ |
| | type | ✅ | ✅ | ❌ | ⚠️ |
| | schemas[] | ✅ | ✅ | ❌ | ⚠️ |
| | default | ✅ | ✅ | ❌ | ✅ |
| | values | ✅ | ✅ | ❌ | ✅ |
| **Schema Store** | field | ✅ | ✅ | ❌ | ⚠️ |
| | name | ✅ | ✅ | ❌ | ⚠️ |
| | label | ✅ | ✅ | ❌ | ⚠️ |
| | default | ✅ | ✅ | ❌ | ✅ |
| **Entangled Groups** | uuid | ✅ | ✅ | ❌ | ⚠️ |
| | braneIndices | ✅ | ✅ (вложен) | ❌ | ✅ |
| | fields | ✅ | ✅ (вложен) | ❌ | ✅ |
| | value | ✅ | ✅ (вложен) | ❌ | ✅ |
| **Blocks Store** | uuid | ✅ | ✅ | ❌ | ⚠️ |
| | groups | ✅ | ✅ | ❌ | ⚠️ |
| | shared | ✅ | ✅ | ❌ | ⚠️ |
| | ptr | ✅ | ❌ | ❌ | 🔴 |
| **Manifests Store** | actor | ✅ | ✅ | ❌ | ⚠️ |
| | fields | ✅ | ✅ | ❌ | ⚠️ |
| **Output** | key | ❌ | ✅ | ❌ | 🔴 |
| | value | ❌ | ✅ | ❌ | 🔴 |

**Условные обозначения:**
- ✅ — есть в документе / выполнено
- ❌ — нет в документе
- ⚠️ — не критично (план не описывает детали)
- 🔴 — критично (требует обсуждения)

---

## ✅ Выполненные несоответствия

### 1. Field Store — поле `values` для enum ✅

**Решено:** Поле добавлено в `entangled-analysis-plan.md` и `entangled-dataflow.drawio`.

```typescript
// FieldRecord
values?: unknown[]  // Значения для enum
```

---

### 2. Field Store — поле `default` ✅

**Решено:** Поле есть в анализе и drawio с описанием семантики.

```typescript
// FieldRecord
default?: unknown  // Runtime default (от родителя)
```

---

### 3. Schema Store — описание `default` ✅

**Решено:** Описание добавлено в анализ.

```typescript
// SchemaRecord
default?: unknown  // Design-time default (fallback)
```

---

### 4. Entangled Groups — поле `fields` (было `fieldUuids`) ✅

**Решено:** Поле переименовано (убран постфикс `Uuids`), передаётся обезличено в Boundary.

```typescript
// EntangledGroup
fields: string[]  // UUID полей из Gravity
```

---

### 5. Убраны постфиксы `Uuid`/`Uuids` ✅

**Решено:** Все поля переименованы:
- `fieldUuid` → `field`
- `fieldUuids` → `fields`
- `schemaUuid` → `schema`

---

### 6. Валидация запутанных enum ✅

**Решено:** Добавлен раздел **1.5. Валидация запутанных enum**.

**Правило:**
- ✅ **Runtime значения** запутанных **enum** должны совпадать
- ✅ **Default значения** не обязаны совпадать (для всех полей)

---

### 7. Механизм установки default значений ✅

**Решено:** Добавлен раздел **1.6. Механизм установки default значений**.

**Правила:**
1. Gravity определяет default из DSL → Schema.default
2. Field.default для запутанных полей = default корневого родителя
3. При перемещении дерева создаётся новая Field запись с default от отсоединённого актора

---

## 🔴 Критические несоответствия (требуют обсуждения)

### 1. Blocks Store — поле `ptr`

| Документ | Статус |
|----------|--------|
| `entangled-analysis-plan.md` | ✅ `ptr: number` |
| `entangled-dataflow.drawio` | ❌ **Нет `ptr`** |
| `entangled-plan.md` | ❌ **Нет упоминания** |

**Проблема:** В drawio отсутствует поле `ptr` (позиция в heap).

**Вопрос:** Добавить `ptr` в Blocks Store в drawio?

**Решение:** ⬜ Ожидает обсуждения

---

### 2. Output (Map) — ключ и значение

| Документ | Ключ | Значение |
|----------|------|----------|
| `entangled-analysis-plan.md` | ❌ **Нет Output** | ❌ **Нет Output** |
| `entangled-dataflow.drawio` | `key: uuid` | `value: EntangledGroup[]` |
| `entangled-plan.md` | ❌ **Нет Output** | ❌ **Нет Output** |

**Вопрос:** Что является ключом Map? UUID группы? UUID актора?

**Решение:** ⬜ Ожидает обсуждения

---

## 📋 Итого

| Статус | Количество |
|--------|------------|
| ✅ Выполнено | 7 |
| 🔴 Требует обсуждения | 2 |
