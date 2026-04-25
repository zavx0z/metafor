# Schemas diff — `store/meta/sqlite` vs `pkg/db`

> Детальное side-by-side сравнение двух реляционных схем хранилища MetaFor.
> Дополняет `task/storage-analysis.md` §9 и §11.2.

## 0. Общая статистика

| | `store/meta/sqlite/` | `pkg/db/` |
|---|---:|---:|
| Таблиц | 33 | 24 |
| Связей FK | ~50 (плотно нормализовано) | ~30 (умеренно) |
| CHECK-constraints | много, тяжёлые (составные на 5-10 столбцов) | минимум, только NOT NULL |
| UNIQUE-индексы | 5 явных partial + inline UNIQUE | **0** (полагается на `deriveUuid`) |
| JSON-blob колонок | **0** | 9 |
| Identity | `crypto.randomUUID()` | `deriveUuid(seed-strings)` |
| Schema-источник | внешние `*.sql` файлы (DDL-first) | inline в `pkg/db/sqlite.ts` (TS-литерал) |
| WAL | нет | да |
| Instance-уровень | **нет** | да (6 таблиц) |
| Entanglement | **нет** | да (4 таблицы) |
| DSL-полнота | высокая (defaults + normalized predicates + matter subtypes + env) | низкая (defaults утеряны, predicates → JSON, matter → JSON, env потерян) |

---

## 1. Зона совпадения (концептуально 1-в-1)

Обе схемы закрывают **meta-уровень DSL**. ~9 пар таблиц соответствуют друг другу.

### 1.1. `meta` ↔ `metas`

| store/meta/sqlite `meta` | pkg/db `metas` | Замечание |
|---|---|---|
| `src TEXT PK` | `id TEXT PK` + `src TEXT NOT NULL` | pkg/db имеет искусственный `id`; `src` без UNIQUE → теоретически дубли |
| `name TEXT` | `name TEXT` | ✅ |
| `desc TEXT` | — | ❌ потеряно в pkg/db |
| `view_css TEXT` | — (часть `bulkJson`) | ⚠️ |
| `has_processes/reactions/matter INTEGER 0/1` | — (вычислимо из COUNT) | ⚠️ |
| — | `bulkJson TEXT` | bulk-config DSL целиком |
| — | `massJson TEXT` | mass как JSON-blob |

### 1.2. `field` ↔ `meta_fields`

| store/meta/sqlite | pkg/db |
|---|---|
| `uuid PK` | `id PK` |
| `meta TEXT FK` | `ownerMetaId TEXT FK` |
| `key TEXT NOT NULL` | `fieldKey TEXT NOT NULL` |
| **UNIQUE (meta, key)** | (не UNIQUE) |
| `type TEXT CHECK IN (string/number/boolean/array/enum)` | `schemaType TEXT` (без CHECK) |
| `required INTEGER 0/1` | `schemaRequired INTEGER` |
| `label TEXT` | `schemaLabel TEXT` |
| — | `fieldOrder INTEGER` |
| — | `schemaTopology INTEGER` |
| — (отдельная таблица variants) | `schemaValues TEXT` (JSON) |
| **8 default-таблиц** | — (defaults утеряны) |

### 1.3. `superposition` ↔ `meta_states`

| store/meta/sqlite | pkg/db |
|---|---|
| `uuid PK` | `id PK` |
| `meta FK` | `ownerMetaId FK` |
| `name TEXT` | `stateName TEXT` |
| `position INTEGER` | `stateOrder INTEGER` |
| **UNIQUE (meta, name), UNIQUE (meta, position)** | — |
| — | **`initial INTEGER NOT NULL`** |

### 1.4. `transition` ↔ `meta_transitions`

| store/meta/sqlite | pkg/db |
|---|---|
| `from_superposition FK NOT NULL` | `ownerMetaStateId FK NOT NULL` |
| `to_superposition FK NOT NULL` | `targetMetaStateId TEXT FK` (**может быть NULL**) |
| `position INTEGER` | `transitionOrder INTEGER` |
| **UNIQUE (from, position)** | — |

`pkg/db` допускает transition без target (sink/self-loop); `store/meta/sqlite` обязательно требует target.

### 1.5. `condition` ↔ `meta_transition_conditions`

| store/meta/sqlite | pkg/db |
|---|---|
| `transition FK + field FK + position` | `ownerMetaTransitionId FK + metaFieldId FK + conditionOrder` |
| **`condition_predicate`** — отдельная таблица c CHECK на operator/value | `conditionJson TEXT NOT NULL` (весь predicate в JSON) |
| **`condition_list_item`** — для in/not_in/include/not_include | (часть JSON) |

Главное расхождение по подходу. store/meta/sqlite разбирает condition вплоть до атомарного predicate; pkg/db кладёт `JSON.stringify(condition)`.

### 1.6. `process` ↔ `meta_processes`

| store/meta/sqlite (3 таблицы) | pkg/db (1 таблица) |
|---|---|
| `process` (uuid, type ∈ action/finally) | `meta_processes` всё in-line: `processKind, actionSrc?, actionImportSpecifier?, actionWrapperSrc?, successSrc?, errorSrc?, beforeSrc?` |
| `process_action` (action/success/error src) | (in `meta_processes`) |
| `process_finally` (before src) | (in `meta_processes`) |
| **`process_env`** (множество env per process) | — потеряно |

store/meta/sqlite нормализован: action и finally — отдельные таблицы 1:1 с базой `process`. pkg/db всё in-line, разделение по `processKind`.

### 1.7. process reads/writes

| store/meta/sqlite | pkg/db |
|---|---|
| `process_action_read (process, field, phase)` | `meta_process_reads (ownerMetaProcessId, metaFieldId, phase, readOrder)` |
| `process_action_write (process, field, phase)` | `meta_process_writes (..., writeOrder)` |
| `process_finally_read` (отдельная таблица) | (объединено в `meta_process_reads` через phase) |

store/meta/sqlite различает action vs finally в FK; pkg/db объединяет в одну таблицу с `phase`-маркером. pkg/db добавляет `*Order` для упорядочивания.

### 1.8. `reaction` ↔ `meta_reactions`

| store/meta/sqlite | pkg/db |
|---|---|
| `cond_source TEXT` | `cond TEXT` |
| `update_source TEXT` | `src TEXT` |
| `reaction_superposition (reaction, superposition)` PK | `meta_reaction_states (id, ownerMetaReactionId, metaStateId, **stateOrder**)` |

Концептуально 1-в-1, разные имена. pkg/db добавляет ordering.

### 1.9. `reaction_read/write` ↔ `meta_reaction_reads/writes`

1-в-1 идентично, разные имена колонок, pkg/db добавляет `readOrder`/`writeOrder`.

---

## 2. Зона расхождения

### 2.1. Только в `store/meta/sqlite`

#### A. `meta_mass_value` — рекурсивный JSON-tree в реляционной форме

```sql
meta_mass_value (
  uuid TEXT PK,
  meta TEXT FK → meta(src),
  parent_value TEXT FK → meta_mass_value(uuid),  -- self-reference
  value_kind TEXT CHECK IN (object/array/string/number/boolean/null),
  entry_key TEXT,                  -- для object-children
  entry_order INTEGER,             -- для array-items
  text_value TEXT,                 -- для kind=string
  number_value REAL,               -- для kind=number
  boolean_value INTEGER 0/1,       -- для kind=boolean
  CHECK (составной — корректность combo kind/value-колонок),
  CHECK (parent NULL ↔ root, parent NOT NULL ↔ entry_key XOR entry_order)
)
```

**5 partial UNIQUE индексов:**
- `meta_mass_root_by_meta` — макс. 1 root на meta
- `meta_mass_object_entry` — UNIQUE `(parent_value, entry_key)` для object
- `meta_mass_array_entry` — UNIQUE `(parent_value, entry_order)` для array
- `meta_mass_by_meta`, `meta_mass_by_parent` — non-unique для traversal

**Что хранит:** `meta.mass = { user: { name: "alice", age: 30 } }` разбирается в:
- 1 root node `value_kind=object, parent=NULL`
- 1 node `entry_key="user", value_kind=object, parent=root`
- 1 node `entry_key="name", value_kind=string, text_value="alice"`
- 1 node `entry_key="age", value_kind=number, number_value=30`

В pkg/db: `metas.massJson = '{"user":{"name":"alice","age":30}}'` — одна строка JSON.

**Tradeoff:**
- store/meta/sqlite — queryable: `SELECT * FROM meta_mass_value WHERE meta=? AND entry_key='user'`. Round-trip работает напрямую.
- pkg/db — читаешь весь объект как одно значение, парсишь, мутируешь, переписываешь.

#### B. Field defaults — 8 type-specific таблиц

```
field_default              — marker «у поля есть default»
field_string_default       (field PK FK → field_default, default_value TEXT)
field_number_default       (field PK FK, default_value REAL)
field_boolean_default      (field PK FK, default_value INTEGER 0/1)
field_array_default_item   (uuid PK, field FK, position, item_value TEXT)
field_enum_variant         (uuid PK, field FK → field, position, item_value TEXT)
field_enum_default         (field PK FK, variant FK → field_enum_variant)
```

В pkg/db **defaults вообще нет**. Если боундари нужно знать default — оно сейчас читает `metas.massJson`, парсит и достаёт по индексу.

#### C. Matter — 8 таблиц с реляционной нормализацией AST

```
matter_binding (
  uuid PK,
  meta FK,
  binding_kind ∈ static/variable/dynamic,
  literal_kind ∈ text/boolean | NULL,
  literal_text TEXT,
  literal_boolean 0/1,
  expr TEXT,
  CHECK (составной — корректность combo kind/literal/expr)
)

matter_binding_dep (binding FK, dep_order, path TEXT, PK (binding, dep_order))

matter_particle (
  uuid PK,
  meta FK,
  parent_particle FK self,
  particle_kind ∈ wimp/fuzzy/axion/macho,
  edge_slot ∈ root/child/then/else/branch,
  particle_order INTEGER,
  CHECK (parent NULL ↔ slot=root)
)

matter_particle_wimp (particle PK FK, src TEXT NOT NULL, fields_binding FK, mass_binding FK)
matter_particle_fuzzy (particle PK FK, fuzzy_kind ∈ dynamic-meta/cond, predicate_binding FK,
                       CHECK (fuzzy_kind=dynamic-meta ↔ predicate_binding NULL))
matter_particle_axion (particle PK FK, predicate_binding FK NOT NULL)
matter_particle_macho (particle PK FK, collection_binding FK NOT NULL)
```

**3 partial UNIQUE индекса:**
- `matter_root_particle_order` — UNIQUE `(meta, particle_order)` для root
- `matter_particle_child_order` — UNIQUE `(parent, edge_slot, particle_order)` для children
- `matter_particle_branch_slot` — UNIQUE `(parent, edge_slot)` для then/else (один на parent)

В pkg/db всё уплощено до:

```
meta_matter_nodes (id PK, ownerMetaId FK, nodeType TEXT, nodeOrder INTEGER, payloadJson TEXT NOT NULL)
meta_matter_edges (id PK, ownerMetaId FK, parentNodeId FK NULL, childNodeId FK, edgeOrder INTEGER)
```

`payloadJson` — generic blob со ВСЕМИ subtype-данными (src, bindings, predicates, collection). Тип частицы хранится в `nodeType`, остальное — JSON.

#### D. `process_env` — окружения процесса

```sql
process_env (process FK, env ∈ browser/node/worker/server/any, PK (process, env))
```

В pkg/db **нет вообще**. После materialize мы не знаем, в каком окружении запускать процесс.

### 2.2. Только в `pkg/db`

#### E. Instance-уровень — 6 таблиц wimp

```
wimps (id PK, metaId FK, wimpOrder INTEGER, massOverrideJson TEXT)
wimp_fields (id PK, ownerWimpId FK, metaFieldId FK, fieldOrder INTEGER)
wimp_edges (id PK, parentWimpId FK NULL, childWimpId FK, edgeOrder INTEGER)
wimp_states (id PK, ownerWimpId FK, metaStateId FK)
field_values (id PK, ownerWimpFieldId FK, valueJson TEXT NOT NULL)
field_sources (id PK, childWimpFieldId FK, parentWimpFieldId FK)
```

Это **runtime-данные**: живые экземпляры мет, текущие значения полей, текущее состояние, entanglement-источники.

store/meta/sqlite — **DSL-only**, instance-уровня вообще нет. Это его границы.

#### F. Entanglement — 4 таблицы

```
entanglements (id PK, membershipKey TEXT, provenance TEXT)
entanglement_members (id PK, ownerEntanglementId FK, wimpId FK, memberOrder)
entanglement_fields (id PK, ownerEntanglementId FK, fieldOrder, semanticKey, fieldName,
                     provenance, representativeWimpFieldId FK, payloadIdsJson, semanticKeysJson)
entanglement_field_members (id PK, ownerEntanglementFieldId FK, ownerWimpId FK, wimpFieldId FK, memberOrder)
```

store/meta/sqlite ничего этого не имеет — это уровень runtime-связи между wimps, не DSL.

#### G. Дополнительные ordering-поля

pkg/db везде добавляет `*Order INTEGER`:
- `fieldOrder`, `stateOrder`, `transitionOrder`, `conditionOrder`, `readOrder`, `writeOrder`, `reactionOrder`, `processOrder`, `edgeOrder`, `memberOrder`, `wimpOrder`, `nodeOrder`.

store/meta/sqlite использует `position` где нужен; в reaction-state/reads/writes порядка вообще нет (только set-membership через PK).

#### H. `meta_states.initial`

pkg/db явно знает «какой state стартовый» (`initial INTEGER NOT NULL` в `meta_states`). store/meta/sqlite — нет (по соглашению `position=0`?).

#### I. `meta_fields.schemaTopology`

Топологический флаг поля (enum=массив или скаляр). store/meta/sqlite не имеет — неявно из `type='enum'`.

---

## 3. Стилистические различия

### 3.1. Identity и idempotency

| | store/meta/sqlite | pkg/db |
|---|---|---|
| ID | `crypto.randomUUID()` | `deriveUuid("kind", parent_id, key, ...)` |
| Стабильность | **нет** (новый UUID каждый прогон) | **да** (одинаковый при том же DSL) |
| Идемпотентность writes | требует DROP+CREATE | работает `put()` поверх существующих |
| Реактивность на изменения | надо переписать всё | можно перезаписать только diff |

### 3.2. CHECK-constraints

store/meta/sqlite — **очень много CHECK**, в т.ч. составные на 5-10 колонок. См. `condition_predicate` — половина файла это CHECK блок:

```sql
CHECK (
  (subject_kind = 'length' AND operator IN ('eq', 'neq', 'gt', 'lt', 'gte', 'lte') AND
   value_kind = 'number' AND value_number IS NOT NULL AND ...) OR
  (subject_kind = 'value' AND (
    (operator IN ('eq', 'neq', 'gt', 'lt', 'gte', 'lte') AND (
      (value_kind = 'null' AND ...) OR
      (value_kind = 'boolean' AND ...) OR ...
    )) OR ...
  ))
)
```

Защита от невалидных состояний на уровне БД.

pkg/db — почти нет CHECK, только NOT NULL. Полагается на TypeScript-валидацию **до** записи.

### 3.3. UNIQUE-индексы

| store/meta/sqlite | pkg/db |
|---|---|
| 5 явных partial UNIQUE индексов + inline UNIQUE в большинстве таблиц | **0 UNIQUE** (полагается на детерминированный `deriveUuid` для idempotency) |

store/meta/sqlite ловит дубли на уровне БД через `UNIQUE (meta, key)` и т.п. pkg/db — через `INSERT OR REPLACE` при `put()`-семантике.

### 3.4. JSON-стратегия

| store/meta/sqlite | pkg/db |
|---|---|
| **0 JSON-полей**, всё реляционно нормализовано | 9 JSON-blob колонок |

JSON-колонки в pkg/db:
- `metas.bulkJson`, `metas.massJson`, `wimps.massOverrideJson`
- `meta_fields.schemaValues`
- `meta_transition_conditions.conditionJson`
- `meta_matter_nodes.payloadJson`
- `field_values.valueJson`
- `entanglement_fields.payloadIdsJson`, `semanticKeysJson`

### 3.5. CASCADE-семантика

Обе используют `ON DELETE CASCADE` на FK. Поведение одинаковое.

### 3.6. Naming

| store/meta/sqlite | pkg/db |
|---|---|
| `snake_case`, единственное число (`field`, `condition`, `superposition`) | `camelCase` колонки, plural таблицы (`meta_fields`, `wimps`) |
| `meta` (PK = src) | `metas` (искусственный id + src) |
| `key` | `fieldKey`, `processKey`, `reactionKey` (явные префиксы) |

### 3.7. WAL и pragma

| store/meta/sqlite | pkg/db |
|---|---|
| `new Database(path, { strict: true, create: true })` | `new Database(filename)` + `PRAGMA journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000` |

pkg/db готов к concurrent-доступу из нескольких worker-ов; store/meta/sqlite — нет (рассчитан на single-writer).

---

## 4. Структурное соответствие — таблица-в-таблицу

| Концепт | store/meta/sqlite | pkg/db | Совпадение |
|---|---|---|---|
| **Корень мета** | `meta` (src PK) | `metas` (id PK + src) | концепция, разные identity |
| **Mass-config** | `meta_mass_value` (рекурсивно) | `metas.massJson` (blob) | разные подходы |
| **View CSS** | `meta.view_css` | часть `metas.bulkJson` | разная гранулярность |
| **Поле** | `field` | `meta_fields` | 1-в-1 |
| **Default поля** | `field_default` + 6 type-specific | — | только store/meta/sqlite |
| **Enum-варианты** | `field_enum_variant` (multi-row) | `meta_fields.schemaValues` (JSON-array) | разные подходы |
| **State** | `superposition` | `meta_states` | 1-в-1 |
| **Initial state** | (по `position=0`?) | `meta_states.initial` явно | только pkg/db |
| **Topology флаг** | (по `type='enum'`) | `meta_fields.schemaTopology` явно | только pkg/db |
| **Transition** | `transition` | `meta_transitions` | 1-в-1; pkg/db допускает NULL target |
| **Condition** | `condition` | `meta_transition_conditions` | 1-в-1 базы |
| **Predicate** | `condition_predicate` (нормализованно) | (внутри `conditionJson`) | разные подходы |
| **Predicate-list** | `condition_list_item` | (внутри `conditionJson`) | только store/meta/sqlite |
| **Process база** | `process` | `meta_processes` (in-line all) | разная нормализация |
| **Action src** | `process_action` (отдельная) | `meta_processes.actionSrc` | inline в pkg/db |
| **Finally src** | `process_finally` | `meta_processes.beforeSrc` | inline в pkg/db |
| **Env** | `process_env` (multi) | — | только store/meta/sqlite |
| **Process reads** | `process_action_read` + `process_finally_read` | `meta_process_reads` (объединённая через phase) | разная нормализация |
| **Process writes** | `process_action_write` | `meta_process_writes` | 1-в-1 |
| **Reaction** | `reaction` | `meta_reactions` | 1-в-1 |
| **Reaction state-binding** | `reaction_superposition` (set) | `meta_reaction_states` (с order) | pkg/db добавляет ordering |
| **Reaction reads/writes** | `reaction_read`, `reaction_write` | `meta_reaction_reads`, `meta_reaction_writes` | 1-в-1 |
| **Matter binding** | `matter_binding` + `matter_binding_dep` | (внутри `meta_matter_nodes.payloadJson`) | разные подходы |
| **Matter particle** | `matter_particle` + 4 subtypes | `meta_matter_nodes` (generic + JSON) | разные подходы |
| **Matter edge** | (через `parent_particle` self-FK) | `meta_matter_edges` (отдельная таблица) | разные подходы |
| **Wimp** | — | `wimps` | только pkg/db |
| **Wimp field** | — | `wimp_fields` | только pkg/db |
| **Wimp edge** | — | `wimp_edges` | только pkg/db |
| **Wimp state** | — | `wimp_states` | только pkg/db |
| **Field value** | — | `field_values` | только pkg/db |
| **Field source** | — | `field_sources` | только pkg/db |
| **Entanglement (4 таблицы)** | — | `entanglements`, `entanglement_members`, `entanglement_fields`, `entanglement_field_members` | только pkg/db |

---

## 5. Что теряется при переходе

### store/meta/sqlite → pkg/db (текущий materialize-pipeline)

1. **Field defaults** (8 таблиц → ничего; есть только косвенно в `metas.massJson`).
2. **Process env** (`process_env` → нигде).
3. **Структурированные condition-predicates** → JSON-blob.
4. **Particle subtypes** → generic node + JSON-blob.
5. **`meta.desc`** → потеряно полностью.
6. **`meta.view_css` отдельным полем** → часть `bulkJson`.
7. **CHECK-constraints на корректность** → только NOT NULL.
8. **UNIQUE-гарантии** → нет.

### pkg/db → store/meta/sqlite (если бы шли наоборот)

1. **Instance-уровень** (wimps + всё что про runtime).
2. **Entanglement** (4 таблицы).
3. **`meta_states.initial`** — какой state стартовый.
4. **`schemaTopology`** — топологический флаг поля.
5. **`bulkJson`** — view-конфигурация.
6. **`*Order`** — позиционирование reaction-states, reads, writes.
7. **Стабильные `deriveUuid`** — store/meta/sqlite перегенерирует все ID.

---

## 6. Резюме для финального дизайна

### Что забрать в superset-схему

**От store/meta/sqlite:**
- `meta_mass_node` (рекурсивная) — для DSL round-trip
- 8 default-таблиц — для field defaults
- `meta_transition_predicate` + `meta_transition_predicate_list_item` — нормализованные predicates
- `meta_process_env` — список окружений
- `meta_matter_binding` + `meta_matter_binding_dep` + `meta_matter_particle` + 4 subtype — реляционная matter
- `meta.desc`, `meta.view_css` отдельными полями
- Тяжёлые CHECK-constraints (могут быть для SQLite, IDB их игнорирует)
- partial UNIQUE индексы

**От pkg/db:**
- Instance-уровень (6 таблиц): `wimp`, `wimp_field`, `wimp_edge`, `wimp_state`, `field_value`, `field_source`
- Entanglement (4 таблицы)
- `meta_state.initial` явно
- `meta_field.schemaTopology` явно
- Все `*_order` поля для стабильного ordering
- WAL и concurrent-доступ
- Детерминированные `deriveUuid` identity

### Что выбрасываем

**Дубликаты и несогласованности:**
- `crypto.randomUUID()` в store/meta/sqlite → заменяем на `deriveUuid` везде
- `meta.bulkJson` (JSON-blob) → разворачиваем в реляционную форму (как mass tree)
- `meta_matter_nodes.payloadJson` (generic) → 4 subtype-таблицы
- `meta_transition_conditions.conditionJson` → нормализованные predicates
- `meta_fields.schemaValues` (JSON-array) → multi-row `meta_field_enum_variant`
- 9 JSON-blob колонок → 0 (всё реляционно)
- Двойственное хранение (massJson + meta_mass_value) → одна форма

### Итог финальной схемы

~41 таблица в одной базе:
- **meta_*** ≈ 28 таблиц (DSL-canonical, superset обеих текущих)
- **wimp_*** = 6 таблиц (runtime-instance, как сейчас в pkg/db)
- **entanglement_*** = 4 таблицы (как сейчас в pkg/db)
- **view_*** = 2 таблицы (render, как сейчас в DbInstanceStore)
- **app_*** = 1 таблица (KV settings)

См. `task/storage-analysis.md` §11.2 для полного breakdown.
