# @metafor/inspect

[← Корень](../../README.ru.md) | **Русский** | [English](README.md)

## Назначение

- Инструменты наблюдения за полем MetaFor: стек импульсов, управление временем, логирование.
- Работает поверх `BroadcastChannel` и `EM` — видит те же импульсы, что получают атомы.
- README описывает возможности, а полный API доступен в Typedoc (`infra/inspect/docs/typedoc/index.html`).

## Модули

| Модуль                         | Описание                                              |
| ----------------------------- | ----------------------------------------------------- |
| `web/debugger` (`meta-inspect`) | Веб-компонент с панелью управления временем и стеком |
| `web/logger`                  | Лёгкий логгер импульсов в консоль/панель              |
| `server/logger`               | Node/Bun-логгер, сохраняющий импульсы на сервере      |

## Быстрый старт (web)

```html
<script type="module" src="@metafor/inspect/web/debugger"></script>
<meta-inspect brk></meta-inspect>
```

- Атрибут `brk` ставит систему на паузу сразу после подключения (`EM.break()`).
- Удаление атрибута или клик по кнопке ▶ вызывает `EM.resume()`.

### Программное подключение

```ts
import { startInspect } from "@metafor/inspect"

startInspect({
  target: document.body,
  breakpoint: true,
  slowmo: 250, // задержка между шагами в мс
})
```

## Возможности

- Паузa/продолжение (`EM.break`/`EM.resume`).
- Пошаговое выполнение (`EM.step()`), в том числе в режиме slow-mo.
- Просмотр стека импульсов, инициаторов и JSON Patch.
- Синхронизация с панелью управления (debugger UI + stack UI).
- Автоматическое выполнение накопленных импульсов при выходе из паузы.

### Что показывает debugger

- **Интенсивность** — количество патчей в каждом импульсе.
- **Цвет источника** — `meta`/`atom`, отражающие «частоту» фотона.
- **Поляризацию** — `path`/`op`, показывающие направление изменения.
- **Фазу** — `timestamp` и позицию в стеке EM.

Таким образом UI буквально визуализирует ту же информацию, что несёт фотон в физической аналогии.

### В плане

- Точки останова по `meta`, `atom`, `path`, `op`.
- Интеграция с визуализатором (`@metafor/virtual`) и серверным логгером.
- Управление историей (`Field` checkpoints) напрямую из UI.

## Серверный логгер

```ts
import { createServerLogger } from "@metafor/inspect/server"

const logger = createServerLogger({ port: 8777 })
logger.start()
```

- Сериализует импульсы в stdout или произвольный транспорт.
- Работает в Bun/Node, слушает сообщения от EM через BroadcastChannel/WS.

## Команды

| Команда            | Назначение                               |
| ------------------ | ---------------------------------------- |
| `bun run build`    | Сборка web и server пакетов              |
| `bun run web:build`| Сборка только web-инструментов           |
| `bun run server:build` | Сборка server логгера               |
| `bun run typegen`  | Генерация d.ts для web/server            |
| `bun run docs`     | Typedoc (`infra/inspect/docs/typedoc/index.html`) |
| `bun run clear`    | Очистка `dist` и `node_modules`          |

## Документация и тесты

- **Typedoc** описывает публичные функции `startInspect`, `createServerLogger`, опции веб-компонента и события.
- **Примеры** — в `infra/inspect/web/*.ts` и `infra/inspect/server/logger.ts`.
- **Тесты** пока ручные; для регрессии используйте Happy DOM и тесты верхнего уровня `bun test --filter inspect`.

Системные правила управления импульсами и временем описаны в `../.cursor/rules/metafor.mdc`.

