# `@internal/visual`

`@internal/visual` — текущая визуальная возможность Cosmos.

Пакет является частью сменяемого release и имеет две среды:

```text
internal:main    -> ./main/index.ts
internal:server  -> ./server/index.ts
```

## `main`

Window environment создаёт визуальный runtime поверх существующего
`#visual-canvas`.

Текущий composition root:

1. получает canvas из статической оболочки Cosmos;
2. создаёт `UiRuntime` из `@ui/elements`;
3. подключает шрифт `/assets/fonts/JetBrainsMono-Bold.ttf`;
4. создаёт пространственную сетку `GridHelper`;
5. настраивает viewpoint;
6. создаёт основной display;
7. добавляет `DisplayDockSurface` в HUD;
8. синхронизирует display с размером canvas через `ResizeObserver`.

Публично экспортируются:

```ts
export const environment = "main"
export const runtime = ...
```

То есть текущий `main` предоставляет готовое визуальное окружение, а не отдельный
прототипный orchestration/lifecycle слой. Удалённый Visual-прототип не является
частью этого пакета и не должен восстанавливаться как скрытая зависимость.

## `server`

Текущий server environment минимален и экспортирует только точную выбранную
среду:

```ts
export const environment = "server"
```

Это сохраняет единый package/environment contract без выдумывания серверной
визуальной логики, которой сейчас нет.

## Зависимости

`main` использует существующие инфраструктурные пакеты:

- `@metafor/engine` — пространственные примитивы;
- `@ui/elements` — `UiRuntime`;
- `@ui/hud` — HUD-компоненты через `DisplayDockSurface`.

## Граница с Quantum

Visual может показывать состояние, предоставленное системой, но не должен
становиться владельцем доменных законов, причинных переходов или canonical
состояния Quantum. Его ответственность — визуальная среда и проекция, а не
семантика наблюдаемого мира.
