# Функциональное программирование — правила для AI-агента

## 🎯 Основные принципы

### 1. Чистые функции (Pure Functions)

- Функция получает **только данные**, которые реально нужны для работы
- Функция **не принимает другие функции** как параметры
- Функция **не имеет сайд-эффектов** (не меняет внешнее состояние)
- Функция **возвращает новые данные**, не мутирует входные

✅ Правильно:

```typescript
function parseInput(input: InputType): OutputType[] {
  // вход → выход, без изменений снаружи
}
```

❌ Неправильно:

```typescript
class Parser {
  private state: Map = new Map()  // ❌ скрытое состояние
  parse(input: any, callback: (x) => void) {  // ❌ функция как параметр
    this.state.set(...)  // ❌ сайд-эффект
  }
}
```

### 2. Готовый формат данных

- Данные передаются **уже в нужном формате**, без трансформаций внутри функции
- Если нужно извлечь/преобразовать — делаем это **до вызова функции**

✅ Правильно:

```typescript
// В координаторе — подготовка
const processed = prepareData(rawData)
const mapped = transformItems(items)

// В чистой функции — только работа с готовым
function processItems(
  prepared: PreparedItem[],
  config: Config
): Result[] { ... }
```

❌ Неправильно:

```typescript
function processItems(
  rawItems: RawItem[]  // ❌ сырые данные, нужно преобразовывать внутри
): Result[] {
  // ❌ трансформации внутри чистой функции
  const prepared = rawItems.map(transform)
  // ...
}
```

### 3. Прозрачный конвейер данных

- Каждая функция — **этап конвейера**: принимает результат предыдущей, возвращает для следующей
- Все промежуточные структуры **явные**, не скрыты в `this`

```text
coordinator()
  ↓
extractData() → DataType[]
  ↓
transformItems() → TransformedItem[]
  ↓
processItems() → Result[]
  ↓
persist
```

### 4. Массивы и Map для однородных данных

- Работаем с **массивами** (`Item[]`) или **Map** (`Map<number, Item>`), не смешиваем
- Индексы — это позиции в массиве (`items[0]`), не дублируем в кортежах

✅ Правильно:

```typescript
// items — просто массив, индекс = позиция
items: Item[]

// Доступ: items[index] — O(1), прозрачно
const item = items[index]
```

❌ Неправильно:

```typescript
// Лишние индексы в кортежах, если индекс = позиция
items: [number, Item][]  // ❌ дублирование

// Лишнее преобразование
const items = data.items.map(([_, item]) => item)  // ❌ если можно сразу Item[]
```

### 5. Явное состояние модуля

- Состояние хранится **в модуле** (глобальные `let`), не в классе
- Функции работают с этим состоянием явно

✅ Правильно:

```typescript
// Глобальное состояние модуля
let cache: Map<string, any> | null = null
let config: Config | null = null

export async function init(cfg: Config) {
  config = cfg  // явное присваивание
  // ...
}
```

❌ Неправильно:

```typescript
class Manager {
  private cache: Map  // ❌ скрыто в this
  init() { this.cache = ... }  // ❌ неявное изменение
}
```

### 6. Минимум абстракций

- Не создаём классы-обёртки для одной функции
- Если логика простая — **функция в файле**, не класс

✅ Правильно:

```typescript
// validator.ts — одна функция
export function validate(input: Input): ValidationResult { ... }
```

❌ Неправильно:

```typescript
// Validator.ts — класс для одной функции
export class Validator {
  validate(input: Input): ValidationResult { ... }
}
```

### 7. Именование для мутации

**Суффикс `$` для мутабельных аргументов:**

- `store$` — мутабельный store
- `state$` — мутабельное состояние
- `heap$` — мутабельный heap

**Порядок аргументов:** `mutable$` → `data` → `options?`

✅ Правильно:

```typescript
// Грязные функции (мутация)
function write(store$: BoundaryStore, data: Data): void
function update(heap$: Uint32Array, changes: Change[]): void
function storeRestore(store$: BoundaryStore, state: BoundaryStore): void
```

❌ Неправильно:

```typescript
// Нет суффикса $ для мутабельных
function write(store: BoundaryStore, data: Data): void  // ❌ неясно что мутация

// Неправильный порядок
function update(changes: Change[], heap$: Uint32Array): void  // ❌ mutable должен быть первым
```

**Чистые функции (без `$`):**

```typescript
function validate(data: Data): ValidationResult
function compile(rules: Rules): Bytecode
function encode(value: unknown): number
```

**Поиск мутаций:**

```bash
grep "function.*\$" .  # Все грязные функции
```

## 📋 Чек-лист для кода

Перед созданием функции спроси:

- [ ] Принимает ли функция **только данные**, которые реально нужны?
- [ ] Возвращает ли функция **новые данные**, не мутируя вход?
- [ ] Есть ли **сайд-эффекты** (логирование, изменение внешних переменных)?
- [ ] Нужно ли **преобразовывать данные** внутри функции (значит, подготовка должна быть снаружи)?
- [ ] Можно ли заменить класс на **простую функцию**?
- [ ] Прозрачен ли **поток данных** (вход → выход, без скрытых шагов)?

---

## 🎭 Типы функций

### Чистые функции (Pure)

**Назначение:** обработка данных, валидация, кодирование, трансформация.

**Признаки:**
- Нет сайд-эффектов
- Нет мутабельных аргументов
- Вход → выход

**Примеры:** `validate()`, `encode()`, `compile()`, `buildHeap()`

### Грязные функции (Dirty)

**Назначение:** мутация состояния, запись в хранилище.

**Признаки:**
- Мутабельные аргументы с `$`
- Явная мутация входа

**Примеры:** `write(store$: Store, data)`, `update(heap$: Uint32Array, changes)`

**Именование:** суффикс `$` для мутабельных аргументов.

### Функции-оркестраторы (Orchestrator)

**Назначение:** координация конвейера данных, управление потоком выполнения.

**Признаки:**
- **Имеют сайд-эффекты** (вызывают грязные функции, меняют глобальное состояние)
- **Не имеют мутабельных аргументов** (нет `$`)
- Вызывают последовательность чистых и грязных функций
- Возвращают результат конвейера

**Примеры:** `prepareData()`, `write()`, `update()`

**Пример оркестратора:**

```typescript
/**
 * Этап 1: Подготовка данных (кодирование, компиляция, построение heap).
 *
 * @remarks
 * **Функция-оркестратор с side effects:**
 * - Вызывает `getStringAtlas().intern()` для строк (изменяет состояние атласа)
 * - Вызывает `compileEnsemble()` (интернирует строки из правил)
 *
 * **Не является чистой функцией** — имеет side effects через StringAtlas.
 */
export function prepareData(data: Data): PreparedData {
  // 1. Чистые функции
  const entangledAnalysis = findEntangledGroups(values)
  const braneMapping = buildBraneMapping(values, entangledBraneIds, entangledAnalysis)
  
  // 2. Side effect через глобальный реестр
  const compiledRules = compileEnsemble(branes, fieldDefs)
  // ↑ внутри: getStringAtlas().intern(string)
  
  // 3. Чистые функции
  const heapLayout = buildHeap(heapInput)
  
  return { ... }
}
```

**Где размещать:**
- Оркестраторы — в `boundary.ts` (или `{domain}.ts`)
- Чистые функции — в отдельных файлах (`validate.ts`, `encode.ts`, `heap.ts`)
- Грязные функции — с суффиксом `$` для мутабельных аргументов

**Иерархия:**

```text
boundary.ts (оркестраторы)
  ↓
fields/ (чистые функции)
  ↓
matrix/ (GPU backend)
  ↓
store/ (состояние)
```

**Важно:** оркестратор — это **допустимый тип функции** с side effects, но без мутабельных аргументов. Используется для координации конвейера данных.

## 🚫 Запрещено

- Передавать функции как параметры в чистые функции
- Хранить состояние в `this` вместо явных переменных
- Делать трансформации данных внутри чистых функций
- Создавать классы для одной-двух функций
- Использовать кортежи `[index, value]` если индекс = позиция в массиве

## ✅ Разрешено

- Глобальные `let` для состояния модуля
- Классы только для **неизбежного состояния** (внешние API, драйверы, работа с ресурсами)
- Массивы и Map для однородных данных
- Промежуточные структуры с явными именами
