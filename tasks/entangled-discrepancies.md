# 🔴 Несоответствия: entangled-analysis-plan.md vs entangled-dataflow.drawio vs entangled-plan.md

**Дата:** 5 марта 2026  
**Статус:** На утверждении

---

## 🔴 Критические несоответствия (требуют обсуждения)

### 1. Blocks Store — поле `blockPtr`

| Документ | Статус |
|----------|--------|
| `entangled-analysis-plan.md` | ✅ `blockPtr: number` |
| `entangled-dataflow.drawio` | ❌ **Нет `blockPtr`** |
| `entangled-plan.md` | ❌ **Нет упоминания** |

**Проблема:** В drawio отсутствует поле `blockPtr` (позиция в heap).

**Вопрос:** Добавить `blockPtr` в Blocks Store в drawio?

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
| 🔴 Требует обсуждения | 2 |

---

## 🔗 Ссылки

- [tasks/entangled-analysis-plan.md](./entangled-analysis-plan.md) — анализ архитектуры
- [tasks/entangled-dataflow.drawio](./entangled-dataflow.drawio) — схема потока данных
- [tasks/entangled-plan.md](./entangled-plan.md) — план реализации
