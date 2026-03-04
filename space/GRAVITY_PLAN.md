# 🌌 План реализации: Force Gravity

**Цель:** Реализовать механизм гравитации — обработку иерархии акторов через `<meta-for>` элементы.

**Контекст:**

- `space/client.ts` — точка входа, загрузка DSL, скриптовый стиль (взаимодействия)
- `force/gravity/func/` — чистые функции (силы)
- `@zavx0z/template` — парсер template literals → AST (`Node[]`)

**Архитектурные принципы:**

- ❌ **Никаких классов** — только чистые функции
- ✅ **Явное состояние модуля** — глобальные `let` в модулях
- ✅ **Прозрачный конвейер** — вход → выход, без скрытых шагов
- ✅ **Модульная структура** — `.ts` (функции), `.t.ts` (типы), `.spec.ts` (тесты)

---

## 1. Архитектура

### 1.1. Типы узлов AST

**Важно:** `gravity` описывает **только иерархию акторов**. HTML элементы (`NodeElement`) не используются.

| Тип | Интерфейс | Назначение | Пример |
| --- | --------- | ---------- | ------ |
| `meta` | `NodeMeta` | `<meta-for>` актор | `<meta-for src="zavx0z/git-start">` |
| `cond` | `NodeCondition` | Условный актор (тернарный) | `${state === "loading" ? html\`<meta-for ...>\` : null}` |
| `log` | `NodeLogical` | Логический актор (`&&`) | `${value.operation && html\`<meta-for ...>\`}` |
| `map` | `NodeMap` | Итерация по массиву акторов | `${items.map(i => html\`<meta-for ...>\`)}` |
| `text` | `NodeText` | **Игнорируется** | — |
| `el` | `NodeElement` | **Игнорируется** | — |

### 1.2. Поток данных

```
space/client.ts (скриптовый стиль)
  ↓
loadDSL() → Schema
  ↓
schema.gravity → Node[]
  ↓
processHierarchy() → ActorDeclaration[]
  ↓
applyHierarchy() → side effects (createMonad/deleteMonad)
```

### 1.3. Структура модулей

```
force/gravity/
├── func/
│   ├── process.ts       # processNode(), processHierarchy()
│   ├── process.t.ts     # типы для process
│   ├── process.spec.ts  # тесты
│   ├── eval.ts          # evaluateCondition(), evaluatePath()
│   ├── eval.t.ts        # типы для eval
│   └── eval.spec.ts     # тесты
├── load.ts              # загрузка DSL (существует)
└── README.md            # документация

space/
├── client.ts            # скриптовый стиль: явное состояние, applyHierarchy()
└── GRAVITY_PLAN.md      # этот план
```

---

## 2. Этапы реализации

### Этап 1: Чистые функции обработки AST

**Файлы:** `force/gravity/func/process.ts`, `force/gravity/func/process.t.ts`

```typescript
// process.t.ts
export interface ProcessContext {
  value: Record<string, unknown>   // значения полей
  state: string                    // текущее состояние
  mass: Record<string, unknown>    // масса
}

export interface ActorDeclaration {
  src: string                      // путь к DSL (например, "zavx0z/git-start")
  context?: Record<string, unknown> // данные для дочернего актора
  path: string                     // путь в иерархии (например, "0/1/2")
  uuid: string                     // UUID актора
}

// process.ts
export function processHierarchy(
  nodes: Node[],
  context: ProcessContext,
  basePath?: string
): ActorDeclaration[]

function processNode(
  node: Node,
  context: ProcessContext,
  path: string
): ActorDeclaration[]
```

**Задачи:**

1. [ ] `processHierarchy()` — обход массива узлов, возврат `ActorDeclaration[]`
2. [ ] `processNode()` — диспетчер по типу узла
3. [ ] Обработка `meta` — извлечение `src`, `context`, генерация UUID, возврат `ActorDeclaration`
4. [ ] Обработка `log` — вычисление условия, рекурсия по детям
5. [ ] Обработка `cond` — выбор ветки (true/false), рекурсия
6. [ ] Обработка `map` — итерация, генерация путей для каждого элемента
7. [ ] **Игнорирование** `text` и `el`

---

### Этап 2: Вычисление условий и путей

**Файлы:** `force/gravity/func/eval.ts`, `force/gravity/func/eval.t.ts`

```typescript
// eval.t.ts
export interface EvalContext {
  value: Record<string, unknown>
  state: string
  mass: Record<string, unknown>
  index?: number        // для map (текущий индекс)
  item?: unknown        // для map (текущий элемент)
}

// eval.ts
export function evaluateCondition(
  data: string | string[],
  expr: string | undefined,
  context: EvalContext
): boolean

export function evaluatePath(
  path: string | ValueDynamic | ValueStatic,
  context: EvalContext
): string
```

**Задачи:**

1. [ ] `evaluateCondition()` — вычисление логических/условных выражений
2. [ ] `evaluatePath()` — резолвинг путей к данным (`value.operation`, `state`, `[item]/id`)
3. [ ] Поддержка операторов: `===`, `!==`, `&&`, `||`, `>`, `<`
4. [ ] Поддержка литералов: строки, числа, булевы

---

### Этап 3: Применение иерархии (скриптовый стиль)

**Файл:** `space/client.ts`

```typescript
import { processHierarchy } from "force/gravity/func/process"
import { createMonad, deleteMonad } from "@boundary/monad"

// Явное состояние модуля (глобальное)
let currentMonads: Map<string, string> = new Map()  // path → monadId (uuid)

async function applyHierarchy(actors: ActorDeclaration[]) {
  const newMonads = new Map<string, string>()

  // 1. Создать/обновить акторы
  for (const actor of actors) {
    if (!currentMonads.has(actor.path)) {
      // Новый актор: создаём монаду с UUID из processHierarchy
      const monadId = createMonad({
        uuid: actor.uuid,  // ← UUID уже сгенерирован
        fields: actor.fields,
        values: actor.context || {},
        superposition: actor.superposition
      })
      newMonads.set(actor.path, monadId)
    } else {
      // Существующий — оставляем
      newMonads.set(actor.path, currentMonads.get(actor.path)!)
    }
  }

  // 2. Удалить лишние
  for (const [path, monadId] of currentMonads) {
    if (!newMonads.has(path)) {
      deleteMonad(monadId)
    }
  }

  currentMonads = newMonads
}
```

**Задачи:**

1. [ ] Глобальное состояние `currentMonads` (явное, не в классе)
2. [ ] `applyHierarchy()` — diff старых/новых, create/delete
3. [ ] Интеграция с `processHierarchy()`
4. [ ] Логирование изменений (через `log()`)

---

### Этап 4: Реактивность

**Файл:** `space/client.ts`

```typescript
// Подписка на изменения полей
let lastValues: Record<string, unknown> = {}

async function checkAndReapply(newValues: Record<string, unknown>) {
  if (hasChanged(lastValues, newValues)) {
    const actors = processHierarchy(hierarchy, { value: newValues, state, mass })
    await applyHierarchy(actors)
    lastValues = newValues
  }
}
```

**Задачи:**

1. [ ] Отслеживание изменений полей (shallow equality)
2. [ ] Пересчёт иерархии при изменениях
3. [ ] Debounce для частых обновлений (опционально)

---

### Этап 5: Тестирование на git-иерархии

**Сценарии:**

1. [ ] Старт: `operation = null` → нет детей
2. [ ] Ввод команды: `command = "clone"` → `operation = "start"`
3. [ ] Гравитация: создание `<meta-for src="zavx0z/git-start">`
4. [ ] Смена операции: `operation = "work"` → замена ребёнка
5. [ ] Ошибка: `error = "..."` → `<meta-for src="zavx0z/git-error">`

---

## 3. Критерии готовности

| Критерий | Статус |
| -------- | ------ |
| AST обход (все типы узлов) | ⬜ |
| Вычисление условий (`log`, `cond`) | ⬜ |
| Обработка `map` (итерация) | ⬜ |
| Создание/удаление монад | ⬜ |
| Diff иерархии (удаление старых) | ⬜ |
| Реактивность на изменения полей | ⬜ |
| Работа с git-иерархией | ⬜ |
| Тесты (unit + integration) | ⬜ |

---

## 4. Риски и вопросы

| Риск | Решение |
| ---- | ------- |
| Циклические зависимости в иерархии | Detect cycle, throw error |
| Утечки памяти (не удалённые монады) | Строгий `applyHierarchy()`, явная очистка |
| Частые ре-рендеры (performance) | Shallow equality check, debounce |
| Динамические `src` (не загружен DSL) | Lazy load, error boundary |

---

## 5. Следующие шаги

1. [ ] **Задача 0:** UUID — генерация в client.ts, убрать из monad.ts ([tasks/uuid-for-monads.md](./tasks/uuid-for-monads.md))
2. [ ] Начать с **Этапа 1** (чистые функции `process.ts`)
3. [ ] Затем **Этап 2** (вычисление условий `eval.ts`)
4. [ ] **Этап 3** (скриптовый стиль в `client.ts`)
5. [ ] **Этап 4** (реактивность)
6. [ ] **Этап 5** (тестирование на git-иерархии)
