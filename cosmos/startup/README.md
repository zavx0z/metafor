# `@cosmos/startup`

`@cosmos/startup` — минимальная неизменяемая оболочка Cosmos, которая создаёт
устойчивую границу между browser либо server platform и сменяемым
`@cosmos/release`.

`startup` не владеет политикой выпуска, составом пакетов или предметным
состоянием MetaFor. Его задача — получить release runtime, запустить кандидата,
переключить на него новые события и корректно завершить предыдущее исполнение.

## Среды

Пакет имеет две browser-среды и одну server-среду:

```text
cosmos:main     -> ./main/index.ts
cosmos:service  -> ./service/index.ts
cosmos:server   -> ./server/index.ts
```

### `main`

`main` выполняется в Window:

1. регистрирует `/@cosmos/startup?env=service` как Service Worker;
2. ждёт готовности регистрации и появления controller;
3. загружает `@cosmos/release` для Window.

На этом ответственность `startup/main` заканчивается.

### `server`

`server` читает последнюю завершённую version package release, проверяет exact
`server.js` по package/env/version/SHA-256/size и запускает его отдельным Bun
process через общий package executor. Release child сам создаёт единственный
`Bun.serve` и напрямую владеет HTTP/WebSocket surface. Startup ждёт IPC
`ready`, наблюдает process exit и при ошибке не выполняет автоматический restart
или rollback.

### `service`

`service` является минимальной Service Worker оболочкой. Она синхронно
регистрирует browser events и создаёт `ReleaseHost` для
`/@cosmos/release?env=service`.

`ReleaseHost` предоставляет четыре операции:

- `boot()` — подготовить и активировать первый release runtime;
- `prepare()` — создать inert candidate runtime;
- `activate()` — запустить кандидата и сделать его текущим;
- `fetch()` / `message()` — передать browser events действующему runtime.

При замене runtime новые события после успешного `start()` идут кандидату.
Операции, уже принятые предыдущим runtime, дожидаются завершения перед его
`destroy()`.

## Зависимость

Browser Service Worker и server adapters `startup` зависят от общего
публичного execution-контракта `@cosmos/release`:

```text
browser/server adapter
  -> VerifiedArtifact + PackageExecutor
  -> ActivePackage + PackageExit
```

Только Service Worker adapter дополнительно зависит от browser-specific
service runtime contracts `ReleaseLoader`, `ReleaseDependencies`,
`ReleaseFactory` и `ReleaseRuntime`.

Физическая политика cache, RPC, обновления и публикации принадлежит `release`.
`startup` не импортирует `@internal/*` и не знает состав Quantum.

## Инвариант

`startup` должен оставаться меньше и стабильнее сменяемого release-кода. Любая
новая функциональность, которую можно реализовать внутри `release`, не должна
попадать в `startup`.
