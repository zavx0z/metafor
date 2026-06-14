# meta — реляционное хранилище DSL

Документ описывает **физическую раскладку** DSL-описания компонента в реляционную форму. Это полный канонический slice того, что писатель компонента положил в `MetaFor(...)...`. Никакой runtime-памяти — только декларации.

`MetaFor(...).bulk()` возвращает `MetaDSL` сразу в write-ready форме:
`fields`, `superposition`, `processes` и `reactions` остаются верхними ключами DSL,
но ключи object-map уже встроены внутрь элементов массивов.

Store при создании WIMP читает сам `dsl`: ORM не делает дополнительный слой
преобразования raw DSL.

## Force-сигнал create

После SQL commit `wimp.create(src, input)` отправляет один `Particle`:
`{ part: "graviton", op: "add", path: "wimp", value: src }`.
`value` здесь не payload WIMP, а только source-id. Получатель читает полную
декларацию из Store по `src`; `path` не содержит `/wimp/...`.

**33 таблицы** в 6 логических группах. Все каскадно связаны через FK на корень `meta(src)` — удаление меты по `src` чистит всю её декларацию.

---

## Группа 1. Идентификация и mass

### `meta`
Корневая запись на одну декларацию.

| колонка | смысл |
|---|---|
| `src` (PK) | канонический адрес компонента (`owner/path`) |
| `name` | человекочитаемое имя |
| `desc` | описание |
| `view_css` | CSS-функция из `bulk()` (как текст) |
| `has_processes` | флаг: есть ли секция `processes` |
| `has_reactions` | флаг: есть ли секция `reactions` |
| `has_matter` | флаг: есть ли секция `matter` |

**Заполняется**: один INSERT при сохранении меты. Флаги `has_*` нужны чтобы при чтении быстро понять, есть ли что искать в дочерних таблицах, без COUNT(*).

### `meta_mass_value`
Дерево mass-данных, разложенное узлами. Каждое значение mass — отдельная строка (объект, массив, скаляр).

| колонка | смысл |
|---|---|
| `uuid` (PK) | id узла |
| `meta` | FK на корень |
| `parent_value` | родительский узел (NULL только у корня) |
| `value_kind` | `object` / `array` / `string` / `number` / `boolean` / `null` |
| `entry_key` | ключ (если родитель — object) |
| `entry_order` | позиция (если родитель — array) |
| `text_value` / `number_value` / `boolean_value` | скалярное значение |

**Инвариант**: либо `entry_key` (член объекта), либо `entry_order` (член массива), либо ничего (это корень).

**Заполняется**: рекурсивный обход `meta.mass`. Для каждого узла — INSERT с указанием родителя. Корневой узел — обязательно `value_kind = 'object'` без родителя (уникальный per `meta`).

---

## Группа 2. Fields — схема полей

### `field`
Одно объявленное поле меты.

| колонка | смысл |
|---|---|
| `uuid` (PK) | id поля |
| `meta` | FK на корень |
| `key` | имя поля как в DSL (`title`, `mode`) |
| `type` | `string` / `number` / `boolean` / `array` / `enum` |
| `required` | булев флаг |
| `label` | подпись из DSL |

**Уникальность**: `(meta, key)` — одно имя поля на мету.

### `field_default`
Маркер "у этого поля есть default". Сама строка пустая (только FK), нужна как корень для типизированных дочерних таблиц.

### `field_string_default` / `field_number_default` / `field_boolean_default`
Default-значения скаляров по типам. Один FK на `field_default(field)`, одно значение в нативной колонке.

### `field_array_default_item`
Default-массив разложен поэлементно: одна строка = один элемент с `position`. Само значение хранится текстом (для array DSL не задаёт сложный type у элементов — только базовые).

### `field_enum_variant`
Допустимые значения enum-поля. Каждый variant — отдельная строка с `position` и `item_value`. На variant-uuid ссылаются:
- `field_enum_default` (какой вариант — default)
- `condition_predicate.value_variant` (предикат сравнения с конкретным enum-значением)

### `field_enum_default`
Указатель на default-вариант enum-поля. FK и на `field_default`, и на `field_enum_variant`.

**Алгоритм заполнения fields**:

1. Для каждого `field` из `meta.fields`:
   1. INSERT `field` с `type`, `required`, `label`
   2. Если type = `enum`: для каждого `values[i]` — INSERT `field_enum_variant`
   3. Если есть `default`:
      - INSERT `field_default` (маркер)
      - В зависимости от типа: INSERT в одну из `field_*_default`-таблиц или, для array, серию `field_array_default_item`
2. Возвращается mapping `{ key → field.uuid }` для дальнейших ссылок (superposition, processes, reactions, matter-bindings).

---

## Группа 3. Superposition — состояния и переходы

### `superposition`
Состояние FSM меты.

| колонка | смысл |
|---|---|
| `uuid` (PK) | id состояния |
| `meta` | FK |
| `name` | имя из DSL (`idle`, `loading`) |
| `position` | порядок объявления (первое = initial) |

**Уникальность**: `(meta, name)` и `(meta, position)`.

### `transition`
Ребро от одного состояния к другому.

| колонка | смысл |
|---|---|
| `uuid` (PK) | id перехода |
| `from_superposition` | FK |
| `to_superposition` | FK |
| `position` | порядок объявления среди исходящих переходов |

**Уникальность**: `(from_superposition, position)`.

### `condition`
Условие на одном поле, привязанное к переходу. Один transition может иметь много conditions — все они должны выполниться (AND).

| колонка | смысл |
|---|---|
| `uuid` (PK) | id условия |
| `transition` | FK |
| `field` | FK на `field` (на какое поле смотрит) |
| `position` | порядок |

**Уникальность**: `(transition, field)` (одно поле — одно условие per transition) и `(transition, position)`.

### `condition_predicate`
Предикат внутри условия. На одно `condition` может быть несколько `predicate` (например, `gt 10` AND `lt 100`).

| колонка | смысл |
|---|---|
| `uuid` (PK) | id предиката |
| `condition` | FK |
| `predicate_order` | порядок применения |
| `subject_kind` | `value` (сравниваем значение) или `length` (сравниваем длину массива) |
| `operator` | `eq` / `neq` / `gt` / `lt` / `gte` / `lte` / `in` / `not_in` / `include` / `not_include` / `is_empty` |
| `value_kind` | `null` / `boolean` / `number` / `string` / `enum` / `list` |
| `value_boolean` / `value_number` / `value_text` / `value_variant` | скалярная часть, заполняется одна из в зависимости от `value_kind` |

**Инвариант**: матрица `subject_kind × operator × value_kind` жёстко проверяется CHECK-constraint-ом.

### `condition_list_item`
Элемент списка для операторов `in` / `not_in`. Используется когда `predicate.value_kind = 'list'` — раскладка `[a, b, c]` по элементам.

| колонка | смысл |
|---|---|
| `predicate` (PK) | FK |
| `item_order` (PK) | позиция |
| `value_kind` / `value_*` | элемент списка |

**Алгоритм заполнения superposition**:

1. Для каждого `state` из `meta.superposition`:
   1. INSERT `superposition` с `position` = индекс
2. Возвращается mapping `{ stateName → uuid }`.
3. Для каждой пары `state.name` / `state.transitions`:
   - Для каждого `[toState, conditionsObject]`:
     1. INSERT `transition`
     2. Для каждого `[fieldKey, predicateExpr]`:
        - INSERT `condition` (FK на `field` через mapping шага 2)
        - Парсим `predicateExpr` (DSL форма вроде `{ gt: 10 }`, `["a", "b"]`, `null`) → разворачиваем в один или несколько `condition_predicate`
        - Если оператор списочный — добавляем `condition_list_item` строки

---

## Группа 4. Processes — действия

### `process`
Один процесс меты.

| колонка | смысл |
|---|---|
| `uuid` (PK) | id |
| `meta` | FK |
| `key` | имя процесса (`saveProfile`) |
| `type` | `action` (с обработчиками) или `finally` (без, just hook) |
| `label`, `desc` | описания |

**Уникальность**: `(meta, key)`.

### `process_env`
В каких окружениях процесс запускается. Может быть несколько строк per process.

| колонка | смысл |
|---|---|
| `process` (PK) | FK |
| `env` (PK) | `browser` / `node` / `worker` / `server` / `any` |

### `process_action` (тип = `action`)
Тело процесса с обработчиками успеха/ошибки.

| колонка | смысл |
|---|---|
| `process` (PK) | FK |
| `action` | сериализованный исходник action-функции |
| `action_import_specifier` | модуль для динамического импорта |
| `action_wrapper_src` | wrapper-обёртка |
| `success` | исходник success-handler-а |
| `error` | исходник error-handler-а |

### `process_action_read`
Какие поля процесс **читает** на каждой фазе.

| колонка | смысл |
|---|---|
| `process` (PK) | FK |
| `field` (PK) | FK на `field` |
| `phase` (PK) | `action` / `success` / `error` |

### `process_action_write`
Какие поля процесс **пишет** на каждой фазе. То же, но `phase` ограничен `success` / `error` (action-фаза не пишет).

### `process_finally` (тип = `finally`)
Лёгкий процесс — только `before`-hook.

| колонка | смысл |
|---|---|
| `process` (PK) | FK |
| `before` | исходник before-handler-а |

### `process_finally_read`
Поля, читаемые before-hook-ом.

**Алгоритм заполнения processes**:

1. Для каждого `process` из `meta.processes`:
   1. INSERT `process` с `type` = `action` или `finally`
   2. INSERT `process_env` для каждого окружения
   3. Если `action`:
      - INSERT `process_action` с исходниками
      - Анализ AST handler-а извлекает `reads`/`writes` поля
      - INSERT `process_action_read` per (phase, field)
      - INSERT `process_action_write` per (phase, field) — только success/error
   4. Если `finally`:
      - INSERT `process_finally`
      - INSERT `process_finally_read` per field

---

## Группа 5. Reactions — реактивные подписки

### `reaction`
Одна реакция меты.

| колонка | смысл |
|---|---|
| `uuid` (PK) | id |
| `meta` | FK |
| `key` | имя реакции |
| `label` | обязательная подпись |
| `desc` | описание |
| `cond_source` | исходник `cond`-функции (фильтр события) |
| `update_source` | исходник `update`-функции (как реагирует) |

**Уникальность**: `(meta, key)`.

### `reaction_superposition`
В каких состояниях реакция активна. `key`-таблица: реакция × состояние.

### `reaction_read` / `reaction_write`
Поля, которые `update`-функция читает / пишет.

**Алгоритм заполнения reactions**:

1. Для каждой `reaction` из `meta.reactions`:
   1. INSERT `reaction`
   2. Для каждого state из `reaction.states` — INSERT `reaction_superposition`
   3. Готовые `reaction.read` / `reaction.write` → INSERT `reaction_read` / `reaction_write`

---

## Группа 6. Matter — иерархия дочерних компонентов

### `matter_binding`
Выражение-биндинг (подстановка из родителя в дочерний компонент).

| колонка | смысл |
|---|---|
| `uuid` (PK) | id |
| `meta` | FK |
| `binding_kind` | `static` (литерал) / `variable` (просто ссылка на путь) / `dynamic` (выражение) |
| `literal_kind` | `text` / `boolean` (для `static`) |
| `literal_text` / `literal_boolean` | литеральное значение |
| `expr` | сериализованное выражение (для `dynamic`) |

**Инвариант**: для `static` — заполнен один из literal-полей; для `variable` — все NULL; для `dynamic` — `expr` обязателен.

### `matter_binding_dep`
Пути зависимостей биндинга (какие поля родителя он читает).

| колонка | смысл |
|---|---|
| `binding` (PK) | FK |
| `dep_order` (PK) | позиция аргумента в выражении |
| `path` | dot-path к полю родителя (`/value/title`) |

### `matter_particle`
Узел иерархии matter (компонент-в-компоненте).

| колонка | смысл |
|---|---|
| `uuid` (PK) | id частицы |
| `meta` | FK на родительскую мету (где этот matter объявлен) |
| `parent_particle` | FK на родительскую частицу (NULL у корней matter-дерева) |
| `particle_kind` | `wimp` (актор) / `fuzzy` (ветвление) / `axion` (логическая группа) / `macho` (множественность) |
| `edge_slot` | `root` (без родителя) / `child` / `then` / `else` / `branch` |
| `particle_order` | позиция среди братьев в том же slot-е |

**Уникальные индексы**:
- корни упорядочены per meta: `(meta, particle_order) WHERE parent_particle IS NULL`
- дети упорядочены per (parent, slot): `(parent_particle, edge_slot, particle_order)`
- слоты `then`/`else` уникальны per родитель: `(parent_particle, edge_slot)`

### `matter_particle_wimp` / `_fuzzy` / `_axion` / `_macho`
Type-specific подтаблицы. Одна строка на каждую частицу — в той подтаблице, которая соответствует её `particle_kind`.

- **wimp**: `src` (адрес дочерней меты), `fields_binding` (FK на `matter_binding`), `mass_binding` (FK)
- **fuzzy**: `fuzzy_kind` (`dynamic-meta` / `cond`), `predicate_binding` (FK; для `cond` обязателен, для `dynamic-meta` NULL)
- **axion**: `predicate_binding` (FK, обязателен)
- **macho**: `collection_binding` (FK, обязателен — что итерировать)

**Алгоритм заполнения matter**:

Matter в DSL — это вложенное дерево узлов разного вида. Создание идёт в **два прохода**:

1. **Pass 1: bindings**.
   Обход дерева, для каждого encountered binding-выражения (fields, mass, predicate, collection):
   1. Парсинг выражения → `binding_kind`, `expr`, список depend-paths
   2. INSERT `matter_binding`
   3. Для каждого dep-path → INSERT `matter_binding_dep` с `dep_order`
   4. Сохранить `binding.uuid` в локальном mapping для второго прохода

2. **Pass 2: particles**.
   Рекурсивный обход дерева сверху вниз, с stack-ом `parent_particle`:
   1. INSERT `matter_particle` с `parent_particle`, `edge_slot`, `particle_order`, `particle_kind`
   2. INSERT в одну из подтаблиц `matter_particle_<kind>` со ссылками на `matter_binding.uuid` из шага 1
   3. Рекурсивно обработать детей

Slot `then`/`else` используется для `cond`-fuzzy узлов (двухветочное условие). Slot `branch` — для `dynamic-meta`-fuzzy (множество ветвей по enum-значению или массиву). Slot `child` — для `wimp` / `axion` / `macho` (произвольное число потомков).

---

## Сводный порядок записи меты

При сохранении одной меты в БД операции идут в **строгом порядке** (FK-граф расходится сверху вниз):

1. **`meta`** — корневая запись (все остальные ссылаются на `meta(src)`)
2. **`meta_mass_value`** — рекурсивный обход mass-дерева
3. **`field` + варианты + defaults** — собирается mapping `key → field.uuid`
4. **`superposition`** — собирается mapping `name → superposition.uuid`
5. **`transition` + `condition` + `condition_predicate` + `condition_list_item`** — используют оба mapping-а из шагов 3 и 4
6. **`process` + `process_env` + `process_action`/`process_finally` + `*_read`/`*_write`** — ссылается на `field.uuid` из шага 3
7. **`reaction` + `reaction_superposition` + `reaction_read`/`reaction_write`** — ссылается на `field.uuid` (шаг 3) и `superposition.uuid` (шаг 4)
8. **`matter_binding` + `matter_binding_dep`** — pass 1 для matter
9. **`matter_particle` + type-specific подтаблицы** — pass 2 для matter

**Транзакционность**: вся запись меты — одна SQL-транзакция. Либо записалось целиком, либо ничего.

**Идемпотентность**: повторная запись той же меты по тому же `src` сначала делает `DELETE FROM meta WHERE src = ?`. Каскадные FK с `ON DELETE CASCADE` снимают всё дерево автоматически. Затем идёт обычная вставка.

---

## Чтение

Чтение организовано симметрично записи: один корневой запрос по `src`, потом адресные подзапросы по дочерним таблицам. Никогда не делается полный дамп — потребитель запрашивает то, что ему нужно (только fields, или только superposition, или только matter), и получает ровно эту часть.

Сборка runtime-объекта `Meta` из реляционных строк — отдельный модуль чтения (`read.ts`), который собирает структурный объект из 33-таблиц-снимка по адресу `src`.

---

## Что хранится здесь vs где-то ещё

В этой группе хранится **только декларация** компонента. Здесь нет:
- Текущих значений полей (это `view`)
- Состояния запущенного экземпляра (это `view`)
- Привязки к конкретному инстансу (это `view`)
- Render-данных (это `actor`)
- Production-импортов модулей (исходники процессов хранятся как **текст**, импорт — runtime concern)

Декларация **не зависит** от того, сколько экземпляров компонента сейчас живёт. Один и тот же `meta(src)` обслуживает любое число `view_wimps`, ссылающихся на него.
