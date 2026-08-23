# `@cosmos/startup`

`@cosmos/startup` — минимальная неизменяемая browser-оболочка Cosmos, которая
создаёт устойчивую границу между платформой и сменяемым `@cosmos/release`.

`startup` не владеет политикой выпуска, составом пакетов или предметным
состоянием MetaFor. Его задача — получить release runtime, запустить кандидата,
переключить на него новые события и корректно завершить предыдущее исполнение.

## Среды

Пакет имеет две browser-среды:

```text
cosmos:main     -> ./main/index.ts
cosmos:service  -> ./service/index.ts
```

### `main`

`main` выполняется в Window:

1. регистрирует `/@cosmos/startup?env=service` как Service Worker;
2. ждёт готовности регистрации и появления controller;
3. загружает `@cosmos/release` для Window.

На этом ответственность `startup/main` заканчивается.

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

`startup` зависит только от публичного service-контракта `@cosmos/release`:

```text
startup
   |
   v
ReleaseLoader + ReleaseRuntime contracts
```

Физическая политика cache, RPC, обновления и публикации принадлежит `release`.
`startup` не импортирует `@internal/*` и не знает состав Quantum.

## Инвариант

`startup` должен оставаться меньше и стабильнее сменяемого release-кода. Любая
новая функциональность, которую можно реализовать внутри `release`, не должна
попадать в `startup`.
