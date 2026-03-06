# 🔴 Несоответствия: entangled-analysis-plan.md vs entangled-dataflow.drawio vs entangled-plan.md

**Дата:** 5 марта 2026  
**Статус:** На утверждении

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

### 2. Output (Map) — удалить как лишний

| Документ | Статус |
|----------|--------|
| `entangled-analysis-plan.md` | ❌ **Нет Output** |
| `entangled-dataflow.drawio` | ✅ `key: uuid`, `value: EntangledGroup[]` |
| `entangled-plan.md` | ❌ **Нет Output** |

**Проблема:** Output (Map) в @space/strong-force **не используется**.

**Контекст:**
- Strong Force **НЕ передаёт** `fieldUuids` в Boundary
- Boundary **сам вычисляет** запутанность из значений полей (`findEntangledGroups(values)`)
- Output с `key: uuid, value: EntangledGroup[]` **лишний**

**Решение:** ❌ **Удалить Output (Map)** из drawio

**Статус:** ⬜ Ожидает подтверждения

---

## ✅ Выполненные несоответствия

### 1. Field Store — переименовано `fieldUuid` → `field` ✅

**Решено:** Постфикс `Uuid` удалён из имени поля.

---

### 2. Entangled Groups — переименовано `fieldUuids` → `fields` ✅

**Решено:** Постфикс `Uuids` удалён из имени поля.

---

### 3. Matrix — переименовано `field_id` → `field_idx` ✅

**Решено:** Поле переименовано для точности (это индекс, не идентификатор).

**Где используется:**
- `evolution.wgsl:find_field()` — поиск поля в heap по индексу
- `evolution.wgsl:get_field_value_recursive()` — рекурсивный поиск в shared блоках
- `evolution.wgsl:execute_transitions()` — чтение условий из bytecode

---

## 📋 Итого

| Статус | Количество |
|--------|------------|
| ✅ Выполнено | 3 |
| 🔴 Требует обсуждения | 2 |

---

## 🔗 Ссылки

- [tasks/entangled-analysis-plan.md](./entangled-analysis-plan.md) — анализ архитектуры
- [tasks/entangled-dataflow.drawio](./entangled-dataflow.drawio) — схема потока данных
- [tasks/entangled-plan.md](./entangled-plan.md) — план реализации
