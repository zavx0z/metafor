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
| | fieldUuids | ✅ | ✅ (вложен) | ❌ | ✅ |
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

## 🔴 Критические несоответствия

### 1. Field Store — поле `values` для enum

| Документ | Статус |
|----------|--------|
| `entangled-analysis-plan.md` | ✅ **Есть `values?: unknown[]`** |
| `entangled-dataflow.drawio` | ✅ **Есть `values`** (any[]?) — 5-я строка |
| `entangled-plan.md` | ❌ **Нет упоминания** |

**Статус:** ✅ **Выполнено** — поле добавлено в анализ и drawio

---

### 2. Field Store — поле `default`

| Документ | Описание |
|----------|----------|
| `entangled-analysis-plan.md` | ✅ `default?: unknown ← runtime default (от родителя)` |
| `entangled-dataflow.drawio` | ✅ "Значение по умолчанию" |
| `entangled-plan.md` | ❌ **Нет упоминания** |

**Статус:** ✅ **Выполнено** — поле есть в анализе и drawio

---

### 3. Schema Store — описание `default`

| Документ | Описание |
|----------|----------|
| `entangled-analysis-plan.md` | ✅ `default?: unknown ← design-time default (fallback)` |
| `entangled-dataflow.drawio` | ✅ "Значение по умолчанию" |
| `entangled-plan.md` | ❌ **Нет Schema Store** |

**Статус:** ✅ **Выполнено** — описание есть в анализе

---

### 4. Entangled Groups — поле `fieldUuids`

| Документ | Структура |
|----------|-----------|
| `entangled-analysis-plan.md` | ✅ `uuid`, `braneIndices`, `fieldUuids`, `value` |
| `entangled-dataflow.drawio` | ✅ `uuid`, `Group` (`{braneIndices, value}`) — fieldUuids вложен в Group |
| `entangled-plan.md` | ❌ **Нет описания** |

**Статус:** ✅ **Выполнено** — fieldUuids передаётся обезличено в Boundary (вложен в Group)

---

### 5. Blocks Store — поле `ptr`

| Документ | Статус |
|----------|--------|
| `entangled-analysis-plan.md` | ✅ `ptr: number` |
| `entangled-dataflow.drawio` | ❌ **Нет `ptr`** |
| `entangled-plan.md` | ❌ **Нет упоминания** |

**Проблема:** В drawio отсутствует поле `ptr` (позиция в heap).

**Вопрос:** Добавить `ptr` в Blocks Store?

**Решение:** ⬜ Ожидает обсуждения

---

### 6. Manifests Store — тип поля `fields`

| Документ | Структура |
|----------|-----------|
| `entangled-analysis-plan.md` | `actor`, `fields` (ManifestPath[]) |
| `entangled-dataflow.drawio` | `actor`, `fields` (Manifest[]) |
| `entangled-plan.md` | `manifests` с `src`, `fields` |

**Проблема:** В drawio тип `Manifest[]`, но в анализе — структура с `actorUuid`.

**Вопрос:** Уточнить тип поля `fields` в drawio?

**Решение:** ⬜ Ожидает обсуждения

---

### 7. Output (Map) — ключ и значение

| Документ | Ключ | Значение |
|----------|------|----------|
| `entangled-analysis-plan.md` | ❌ **Нет Output** | ❌ **Нет Output** |
| `entangled-dataflow.drawio` | `key: uuid` | `value: EntangledGroup[]` |
| `entangled-plan.md` | ❌ **Нет Output** | ❌ **Нет Output** |

**Вопрос:** Что является ключом Map? UUID группы? UUID актора?

**Решение:** ⬜ Ожидает обсуждения
