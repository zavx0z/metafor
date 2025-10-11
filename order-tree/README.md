# order-tree (TypeScript)

TypeScript библиотека для управления иерархическим деревом акторов в стиле arena (плоское хранение узлов) с устойчивым порядком детей на основе фракционных ключей `order`.

Интегрирована в ActorCommunication как основное хранилище для иерархии акторов с поддержкой позиционных путей VDOM.

## Цели

- O(1) перемещения/перепривязки узлов за счёт изменения ссылок и `order`
- Быстрый доступ по индексам на глубину через ленивую витрину `childrenView`
- Типобезопасность с TypeScript
- Работа с позиционными путями VDOM в виде строк индексов через слеш

## Особенности

- Узлы хранятся в `arena: Map<string, ActorNode>`
- Порядок детей определяется числом `order` у каждого узла
- Витрина детей `childrenView: Map<string, string[]>` сортируется лениво при чтении
- Позиционные пути VDOM: `"0"`, `"0/1"`, `"0/1/2"` и т.д.
- **Автоматическая генерация корневых путей**: `"0"`, `"1"`, `"2"` для новых акторов
- Интеграция с ActorCommunication для автоматического управления иерархией

## Быстрый старт

```typescript
import {
  createActorStore,
  createActorNode,
  appendChild,
  insertBetween,
  getByIndexPath,
  getChildren,
  getActor,
} from "./index"

const store = createActorStore()

// Создание акторов с автоматической генерацией корневых путей
const rootActor = new Actor("root", "root-id", "Root Actor", ...)  // path = "0"
const actor1 = new Actor("child1", "child1-id", "Child 1", ...)   // path = "1"
const actor2 = new Actor("child2", "child2-id", "Child 2", ...)   // path = "2"

// Или создание с явным указанием позиционных путей VDOM
const childActor = new Actor("child", "child-id", "Child", ..., {}, "0/0") // path = "0/0"

// Добавление в иерархию
appendChild(store, "0", "0/0")
appendChild(store, "0", "0/1")

// Вставка между первым и вторым ребенком без сдвига остальных
const actorX = new Actor("actorX", "x-id", "Actor X", ...)
insertBetween(store, "0/0", "0/1", actorX.path)

// Доступ по пути индексов [1] (второй ребёнок root)
const childPath = getByIndexPath(store, "0", [1]) // => "0/2"
const actor = getActor(store, childPath)
```

## API

### Основные функции

- `createActorStore()` → `ActorStore` — создает новое хранилище акторов
- `createActorNode(store, path, actor)` — регистрирует актор в хранилище
- `appendChild(store, parentPath, actorPath)` — вставка в конец списка детей
- `insertBetween(store, leftPath, rightPath, actorPath)` — вставка между соседями
- `moveAfter(store, targetPath, actorPath)` / `moveBefore(store, targetPath, actorPath)` — перемещение
- `reparentActor(store, newParentPath, actorPath, opts)` — перепривязка к новому родителю
- `getChildren(store, parentPath)` — возвращает отсортированный массив детей
- `getByIndexPath(store, rootPath, indexPath)` — доступ по индексному пути

### Утилиты

- `getActor(store, actorPath)` — получить актор по пути
- `hasActor(store, actorPath)` — проверить существование актора
- `removeActor(store, actorPath, recursive?)` — удалить актор (с поддеревом)
- `normalizeChildren(store, parentPath)` — нормализовать порядок в целые числа

### Интеграция с ActorCommunication

- `ActorCommunication.addChildActor(parentPath, childActor)` — добавить дочерний актор
- `ActorCommunication.getActorChildren(parentPath)` — получить детей актора
- `ActorCommunication.getActorByPath(path)` — получить актор по пути
- `ActorCommunication.hasActorByPath(path)` — проверить существование актора
- `ActorCommunication.getHierarchy().generateRootPath()` — генерировать уникальный корневой путь
- `ActorCommunication.getHierarchy().resetPathCounter()` — сбросить счетчик путей

## Автоматическая генерация корневых путей

При создании новых акторов без явного указания `path`, система автоматически генерирует уникальные корневые пути:

```typescript
const actor1 = new Actor("name1", "id1", "desc1", ...) // path = "0"
const actor2 = new Actor("name2", "id2", "desc2", ...) // path = "1"
const actor3 = new Actor("name3", "id3", "desc3", ...) // path = "2"

// Явное указание path переопределяет автогенерацию
const childActor = new Actor("child", "child-id", "Child", ..., {}, "0/0") // path = "0/0"
```

**Особенности:**

- Счетчик управляется в `Fields` для централизованного контроля
- Генерируются только корневые пути (`"0"`, `"1"`, `"2"`, ...)
- Дочерние пути создаются явно при построении иерархии
- Методы `Actor.resetPathCounter()` и `Fields.resetPathCounter()` для сброса счетчика
- Метод `clear()` в `Fields` автоматически сбрасывает счетчик

## Почему фракционный order

Вместо целых индексов храним `order` как число. Вставка «между» = среднее арифметическое соседей. Это позволяет не переиндексировать всех детей.

При большом количестве операций периодически делайте нормализацию в целые: `normalizeChildren(store, parentPath)`.

## Производительность

- **Частые вставки**: используйте `insertBetween` или `moveBefore/After`, меняя только `order` перемещаемого узла
- **Частые чтения**: витрина `childrenView` сортируется лениво и кешируется до первой мутации
- **Безопасность**: `getChildren` возвращает неизменяемую копию для предотвращения случайных мутаций
- **Типобезопасность**: все операции проверяются на этапе компиляции TypeScript
- **Очень большие списки**: можно заменить витрину на структуру order-statistics tree (не входит в данный пакет)

## Архитектурная интеграция

Order-tree автоматически интегрирован в `ActorCommunication` как основное хранилище иерархии акторов:

- При создании актора он автоматически добавляется в order-tree
- При удалении актора он автоматически удаляется из дерева
- Поддерживается как старый реестр по id, так и новое иерархическое хранилище для обратной совместимости
- Сообщения рассылаются через оба механизма

## Типы

```typescript
interface ActorNode {
  /** Позиционный путь актора в VDOM (строка индексов через слеш) */
  readonly path: string
  /** Ссылка на родительский узел (null для корня) */
  parent: string | null
  /** Порядок среди соседей (фракционный) */
  order: number
  /** Ссылка на актор */
  actor: ActorCommunication
}

interface ActorStore {
  /** Арена узлов: path -> ActorNode */
  readonly arena: Map<string, ActorNode>
  /** Витрина детей: parentPath -> path[] (отсортированные по order) */
  readonly childrenView: Map<string, string[]>
  /** Родители, требующие пересортировки витрины */
  readonly dirty: Set<string>
}

interface ReparentOptions {
  /** Позиция вставки */
  at: "start" | "end" | "after"
  /** После какого актора вставить (только для at: "after") */
  after?: string | null
}
```
