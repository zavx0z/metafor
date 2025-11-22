# @metafor/virtual

[← Корень](../../README.ru.md) | **Русский** | [English](README.md)

## Назначение

- Визуализирует поле MetaFor виртуальными частицами: дерево акторов, потоки импульсов, плотность связей.
- Работает в связке с `@metafor/inspect`: читает те же `Photon`-сообщения, но отображает их на canvas/WebGL.
- README описывает концепции; полный API — в Typedoc (`infra/virtual/docs/typedoc/index.html`).

## Модули

| Модуль        | Описание                                               |
| ------------- | ------------------------------------------------------ |
| `virtual.ts`  | Основной API (`startVirtual`, управление сценой)       |
| `worker.ts/js`| Worker, который получает импульсы и обновляет частиц   |
| `example.*`   | Примеры подключения в приложении без сборщика          |

## Быстрый старт

```ts
import { startVirtual } from "@metafor/virtual"

const stop = await startVirtual({
  target: document.body,
  src: new URL("./dist/worker.js", import.meta.url),
  mode: "tree",
  showPaths: true,
})

// ... позже
stop()
```

- `target` — DOM-элемент, куда будет внедрён canvas (по умолчанию `document.body`).
- `src` — ссылка на воркер (обязательный параметр).
- `mode` — режим визуализации (`"tree"`, `"line"`, `"quantum"`).
- `showPaths`, `follow`, `debug` — дополнительные опции (см. Typedoc).

## Что отображается

- **Дерево акторов** — позиционные пути (`Field`) превращаются в узлы, связи строятся автоматически.
- **Импульсы** — реакция на `Photon`: цвет/скорость частицы меняется при `replace`, `add`, `remove`.
- **Нагрузка** — толщина линий показывает, сколько импульсов прошло через ветку.

### Соответствие физике

- Яркость/размер частицы отражает интенсивность (`impulses.length`).
- Цвет — `meta`/`atom`, то есть «частота» источника.
- Вращение/угол — `path`/`op`, аналог поляризации.
- Временные хвосты — `timestamp`, отображающий фазу.

Таким образом визуализация делает наглядными все свойства фотона, описанные в правилах MetaFor.

## Worker-протокол

- Сообщения от основного потока: `{ type: "init" | "update" | "destroy", payload }`.
- Worker отправляет назад `{ type: "ready" | "log" }`.
- События `visibilitychange` и `resize` приостанавливают/возобновляют рендер.

## Команды

| Команда            | Назначение                                      |
| ------------------ | ----------------------------------------------- |
| `bun run build`    | Сборка `virtual.ts` и `worker.js` (с sourcemap) |
| `bun run build:watch` | Дев-сборка с наблюдением                   |
| `bun run typegen`  | Генерация `dist/virtual.d.ts`                   |
| `bun run docs`     | Typedoc (`infra/virtual/docs/typedoc/index.html`) |
| `bun run clear`    | Очистка `dist` и `node_modules`                 |

## Документация

- **Typedoc** описывает `startVirtual`, структуру сообщений и все доступные режимы.
- **Примеры** — `infra/virtual/example.*`.
- **Тесты** пока ручные; используйте Happy DOM + скриншоты при проверке визуальной регрессии.

Правила визуализации опираются на те же инварианты, что и `Field`/`EM`; подробности в `../.cursor/rules/metafor.mdc`.

