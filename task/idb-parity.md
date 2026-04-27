# IDB parity — будущий browser store

Дата: 2026-04-26. Детализация к `task/store-unification.md`.

## Проверенный текущий факт

В `store/` сейчас нет `store/browser.ts`, `@store/meta/idb` или
`@store/actor/idb`. `store/package.json` экспортирует только `./server`.

Единственный текущий IndexedDB path в проекте — UI settings:
`app/web/ui-settings-idb.ts`. Старые browser imports `store/db/browser` уже
сломаны.

## Что важно не перепутать

IDB parity не является механическим переносом SQL-классов:

- текущие ORM-классы получают `Bun.SQL` и выполняют raw SQL;
- IDB не имеет JOIN, read model нужно собирать через object stores и indexes;
- IDB transaction может охватывать несколько object stores, но набор stores
  должен быть известен при открытии transaction;
- parity tests должны сравнивать поведение store API, а не внутреннюю форму
  таблиц/object stores.

## Минимальная цель

После SQLite-first этапа нужен тот же public API:

```ts
import { open } from "store/browser"

const store = await open(...)
```

Поведение должно совпадать с `store/server` для:

- meta create/get/delete;
- actor create/get/delete;
- value read/set/list item write/truncate;
- link share/fork;
- owners by value;
- state set/get;
- Boundary adapter read equivalence.

## Не делать сейчас

Не проектировать IDB до того, как SQLite actor/materializer/Boundary path станет
рабочим. Иначе придётся переносить неустойчивый контракт.
