# Задача: Func Parse — парсинг AST в ActorDeclaration[]

**Приоритет:** Высокий  
**Зависимости:** ✅ Gravity Stores завершены  
**Оценка:** 3-4 часа

---

## 📋 Контекст

После реализации store модулей (order, graph, actor) следующий этап — **парсинг AST**.

**Вход:** `Node[]` от `@zavx0z/template` (результат `schema.gravity`)  
**Выход:** `ActorDeclaration[]` — готовые декларации для создания акторов

**Типы узлов для обработки:**

| Узел | Тип | Описание |
| ---- | --- | -------- |
| `NodeMeta` | `"meta"` | Метаданные: `tag`, `core`, `context`, `child` |
| `NodeLogical` | `"log"` | Логический блок: `data`, `expr`, `child` |
| `NodeCondition` | `"cond"` | Ветвление: `data`, `expr`, `child[true, false]` |
| `NodeMap` | `"map"` | Итерация: `data`, `child` |
| `NodeText` | `"text"` | **Игнорируется** (текстовое содержимое) |
| `NodeElement` | `"el"` | **Игнорируется** (HTML элементы) |

---

## 🎯 Цель

1. Создать 3 файла в `force/gravity/func/`
2. Реализовать `parseHierarchy()` — обход AST
3. Реализовать `parseNode()` — диспетчер по типу узла
4. TSDoc документация по стандарту
5. Тесты на каждый тип узла

---

## 📚 TSDoc Правило

**Обязательно:** Следовать стандарту [@create-metafor/rules/tsdoc.md](./create-metafor/rules/tsdoc.md)

**Ключевые требования:**

1. **High Signal-to-Noise Ratio:**
   - ❌ Не переводить названия переменных на русский
   - ❌ Не создавать TSDoc ради галочки
   - ✅ Описывать неявные связи, ограничения, алгоритмы

2. **@param теги:**
   - Для generic имён (`data`, `config`) — описывать структуру
   - Для чисел — указывать диапазон

3. **@returns:**
   - Описывать результат, не тип

4. **@example:**
   - Обязателен для функций с неочевидными параметрами

5. **Модульный уровень:**
   - Первый export в файле — `@packageDocumentation`

---

## ✅ Требования

### 1. Типы (`parse.t.ts`)

```typescript
/**
 * Контекст для парсинга.
 * @packageDocumentation
 */

import type { Node as ParseNode } from "@zavx0z/template"

/**
 * Контекст выполнения для вычисления условий.
 *
 * @property value - текущие данные (value.*)
 * @property state - состояние автомата (state.*)
 * @property mass - общие данные (mass.*)
 */
export interface ParseContext {
  value: Record<string, unknown>
  state: string
  mass: Record<string, unknown>
}

/**
 * Декларация актора для создания.
 *
 * @property src - путь к DSL (например, "zavx0z/git-start")
 * @property context - контекст для value (опционально)
 * @property fields - начальные поля монады
 *
 * ## Пример
 *
 * ```typescript
 * const declaration: ActorDeclaration = {
 *   src: "zavx0z/git-start",
 *   context: { operation: "clone" },
 *   fields: { count: 0 }
 * }
 * ```
 */
export interface ActorDeclaration {
  src: string
  context?: Record<string, unknown>
  fields: Record<string, unknown>
}
```

---

### 2. Парсинг (`parse.ts`)

**Файл:** `force/gravity/func/parse.ts`

**Импорты:**

```typescript
import type {
  Node,
  NodeMeta,
  NodeLogical,
  NodeCondition,
  NodeMap,
} from "@zavx0z/template"
import type { ActorDeclaration, ParseContext } from "./parse.t"
```

**API:**

```typescript
/**
 * Парсит иерархию AST в массив деклараций акторов.
 *
 * @param nodes - массив узлов от @zavx0z/template
 * @param context - контекст выполнения (value, state, mass)
 * @returns массив ActorDeclaration для создания акторов
 *
 * @example
 * ```typescript
 * const declarations = parseHierarchy(nodes, {
 *   value: { operation: "start" },
 *   state: "idle",
 *   mass: {}
 * })
 * ```
 */
export function parseHierarchy(
  nodes: Node[],
  context: ParseContext
): ActorDeclaration[]

/**
 * Рекурсивно обрабатывает узел AST.
 *
 * @param node - узел для обработки
 * @param context - контекст выполнения
 * @param parentUuid - UUID родителя (null для корневых)
 * @returns массив деклараций акторов
 *
 * @internal
 */
function parseNode(
  node: Node,
  context: ParseContext,
  parentUuid: string | null
): ActorDeclaration[]

/**
 * Обрабатывает NodeMeta — извлекает src из tag.
 *
 * ## Структура NodeMeta
 *
 * ```typescript
 * interface NodeMeta {
 *   type: "meta"
 *   tag: ValueStatic | ValueDynamic | ValueVariable
 *   core?: ValueStatic | ValueDynamic | ValueVariable
 *   context?: ValueStatic | ValueDynamic | ValueVariable
 *   child?: Node[]
 * }
 * ```
 *
 * @param node - узел NodeMeta
 * @param context - контекст выполнения
 * @returns ActorDeclaration или null если нет src
 *
 * @internal
 */
function parseMeta(
  node: NodeMeta,
  context: ParseContext
): ActorDeclaration | null

/**
 * Обрабатывает NodeLogical — вычисляет условие, рекурсия по детям.
 *
 * ## Структура NodeLogical
 *
 * ```typescript
 * interface NodeLogical {
 *   type: "log"
 *   data: string | string[]
 *   expr?: string
 *   child: Node[]
 * }
 * ```
 *
 * @param node - узел NodeLogical
 * @param context - контекст выполнения
 * @param parentUuid - UUID родителя
 * @returns массив деклараций акторов
 *
 * @internal
 */
function parseLogical(
  node: NodeLogical,
  context: ParseContext,
  parentUuid: string | null
): ActorDeclaration[]

/**
 * Обрабатывает NodeCondition — выбор ветки (true/false), рекурсия.
 *
 * ## Структура NodeCondition
 *
 * ```typescript
 * interface NodeCondition {
 *   type: "cond"
 *   data: string | string[]
 *   expr?: string
 *   child: Node[]  // [true-ветка, false-ветка]
 * }
 * ```
 *
 * @param node - узел NodeCondition
 * @param context - контекст выполнения
 * @param parentUuid - UUID родителя
 * @returns массив деклараций акторов
 *
 * @internal
 */
function parseCondition(
  node: NodeCondition,
  context: ParseContext,
  parentUuid: string | null
): ActorDeclaration[]

/**
 * Обрабатывает NodeMap — итерация, рекурсия для каждого элемента.
 *
 * ## Структура NodeMap
 *
 * ```typescript
 * interface NodeMap {
 *   type: "map"
 *   data: string  // путь к массиву (например, "/core/items")
 *   child: Node[]
 * }
 * ```
 *
 * @param node - узел NodeMap
 * @param context - контекст выполнения
 * @param parentUuid - UUID родителя
 * @returns массив деклараций акторов
 *
 * @internal
 */
function parseMap(
  node: NodeMap,
  context: ParseContext,
  parentUuid: string | null
): ActorDeclaration[]
```

---

### 3. Тесты (`parse.spec.ts`)

**Файл:** `force/gravity/func/parse.spec.ts`

**Тесты:**

**parseHierarchy:**
- [ ] Возвращает пустой массив для пустых nodes
- [ ] Обрабатывает одиночный NodeMeta
- [ ] Обрабатывает вложенные узлы

**parseMeta:**
- [ ] Извлекает `src` из NodeMeta (статический tag)
- [ ] Извлекает `src` из NodeMeta (динамический tag)
- [ ] Возвращает null если tag не строка

**parseLogical:**
- [ ] Рекурсия по детям если условие истинно
- [ ] Возвращает пустой массив если условие ложно
- [ ] Игнорирует text/el узлы

**parseCondition:**
- [ ] Выбирает true ветку (child[0]) если условие истинно
- [ ] Выбирает false ветку (child[1]) если условие ложно
- [ ] Обрабатывает отсутствие ветки

**parseMap:**
- [ ] Итерация по массиву из mass
- [ ] Рекурсия для каждого элемента
- [ ] Обрабатывает пустой массив

---

## 📁 Структура файлов

```
force/gravity/
└── func/
    ├── parse.ts       # parseHierarchy(), parseNode(), ...
    ├── parse.t.ts     # ActorDeclaration, ParseContext
    └── parse.spec.ts  # тесты
```

---

## 🔗 Зависимости

```
parse.ts → импортирует → @zavx0z/template (Node*, Node)
parse.ts → импортирует → ./parse.t (типы)
parse.ts → нет зависимостей от store
```

**Важно:** Func модули **не зависят** от store — это чистые функции.

---

## 🧪 Примеры тестов

### parseHierarchy

```typescript
import { describe, it, expect } from "bun:test"
import { parseHierarchy } from "./parse"
import type { NodeMeta } from "@zavx0z/template"

describe("parseHierarchy", () => {
  it("возвращает пустой массив для пустых nodes", () => {
    const result = parseHierarchy([], {
      value: {},
      state: "idle",
      mass: {},
    })
    expect(result).toEqual([])
  })

  it("обрабатывает одиночный NodeMeta", () => {
    const nodes: NodeMeta[] = [
      {
        type: "meta",
        tag: "zavx0z/git-start",
        child: [],
      },
    ]

    const result = parseHierarchy(nodes, {
      value: {},
      state: "idle",
      mass: {},
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.src).toBe("zavx0z/git-start")
  })
})
```

### parseCondition

```typescript
import { describe, it, expect } from "bun:test"
import { parseHierarchy } from "./parse"
import type { NodeCondition, NodeMeta } from "@zavx0z/template"

describe("parseCondition", () => {
  it("выбирает true ветку если условие истинно", () => {
    const nodes: NodeCondition[] = [
      {
        type: "cond",
        data: "/value/operation",
        expr: "${[0]} === 'start'",
        child: [
          // true ветка (child[0])
          [
            {
              type: "meta",
              tag: "zavx0z/git-start",
              child: [],
            },
          ],
          // false ветка (child[1])
          [],
        ],
      },
    ]

    const result = parseHierarchy(nodes, {
      value: { operation: "start" },
      state: "idle",
      mass: {},
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.src).toBe("zavx0z/git-start")
  })

  it("выбирает false ветку если условие ложно", () => {
    const nodes: NodeCondition[] = [
      {
        type: "cond",
        data: "/value/operation",
        expr: "${[0]} === 'start'",
        child: [
          // true ветка
          [],
          // false ветка
          [
            {
              type: "meta",
              tag: "zavx0z/git-error",
              child: [],
            },
          ],
        ],
      },
    ]

    const result = parseHierarchy(nodes, {
      value: { operation: "work" },
      state: "idle",
      mass: {},
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.src).toBe("zavx0z/git-error")
  })
})
```

### parseMap

```typescript
import { describe, it, expect } from "bun:test"
import { parseHierarchy } from "./parse"
import type { NodeMap, NodeMeta } from "@zavx0z/template"

describe("parseMap", () => {
  it("итерация по массиву", () => {
    const nodes: NodeMap[] = [
      {
        type: "map",
        data: "/mass/items",
        child: [
          {
            type: "meta",
            tag: "zavx0z/git-item",
            child: [],
          },
        ],
      },
    ]

    const result = parseHierarchy(nodes, {
      value: {},
      state: "idle",
      mass: {
        items: ["item1", "item2", "item3"],
      },
    })

    expect(result).toHaveLength(3)
    expect(result.every((r) => r.src === "zavx0z/git-item")).toBe(true)
  })
})
```

---

## ✅ Критерии готовности

### Файлы
- [ ] `parse.t.ts` — типы `ActorDeclaration`, `ParseContext`
- [ ] `parse.ts` — 5 функций (`parseHierarchy`, `parseNode`, `parseMeta`, `parseLogical`, `parseCondition`, `parseMap`)
- [ ] `parse.spec.ts` — тесты на каждую функцию

### TSDoc
- [ ] `@packageDocumentation` в parse.t.ts и parse.ts
- [ ] `@param` с описанием для всех параметров
- [ ] `@returns` с описанием результата
- [ ] `@example` для `parseHierarchy()`

### Тесты
- [ ] `bun test force/gravity/func/parse.spec.ts` — ✅
- [ ] Минимум 10 тестов
- [ ] Покрытие всех типов узлов

### Интеграция
- [ ] `parse.ts` импортирует типы из `@zavx0z/template`
- [ ] `parse.ts` импортирует типы из `./parse.t`
- [ ] Нет зависимостей от store модулей
- [ ] `bun run build` — ✅ без ошибок

---

## 📚 Ссылки

- [GRAVITY_PLAN.md](./space/GRAVITY_PLAN.md) — общий план
- [@zavx0z/template types](./node_modules/@zavx0z/template/dist/index.d.ts) — типы узлов
- [old.md](./force/gravity/old.md) — концепция гравитации
