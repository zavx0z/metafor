# `@cosmos/release`

`@cosmos/release` — сменяемый механизм сборки, публикации, доставки и обновления
выпуска Cosmos.

Release не владеет предметным состоянием Quantum. Он работает с пакетами,
версиями, artifacts и платформенными средами и обеспечивает переход между
согласованными составами без частично принятого выпуска.

## Среды

Пакет имеет три среды:

```text
cosmos:main     -> ./main/index.ts
cosmos:service  -> ./service/index.ts
cosmos:server   -> ./server/index.ts
```

### `main`

Window-entrypoint текущего выпуска. Сейчас он подключает `@internal/visual` и
тем самым материализует визуальную возможность текущего browser release.

### `service`

Service Worker runtime выпуска. Он владеет:

- browser Cache Storage для release/internal/metafor artifacts;
- RPC-синхронизацией с сервером через `/sw`;
- подготовкой exact artifacts;
- durable transaction обновления;
- проверкой полного candidate composition;
- переключением release runtime через контракт `startup`;
- перезагрузкой управляемых Window после принятого изменения.

Cache Storage сохраняет package artifacts, startup core и только необходимые
runtime assets. Текущий runtime asset — `/assets/fonts/JetBrainsMono-Bold.ttf`.
Manifest screenshots, icons и favicon не сохраняются Worker: online-запрос
получает их из сети, а offline-запрос без внешнего ответа получает `503`.

### `server`

Server artifact запускается startup отдельным Bun-процессом и сам создаёт
единственный HTTP/WebSocket server Cosmos. После IPC `ready` startup только
наблюдает process lifecycle; routes и transport остаются внутри release.

Серверная часть владеет техническим release lifecycle:

- разрешением package manifests и environments;
- package-owned typecheck/build;
- вычислением следующей SemVer;
- immutable versioned artifacts;
- root release composition;
- атомарной публикацией и восстановлением незавершённой публикации;
- HTTP delivery browser artifacts;
- `/code` state/publication API;
- WebSocket RPC для Service Worker.

## Состав выпуска

Root membership задаётся зависимостями `cosmos/package.json`. Сменяемый browser
release сейчас включает `@cosmos/release` и подходящие `@internal/*` пакеты.
Каждый package сам объявляет поддерживаемые environments через conditional
exports.

Для каждого участника release фиксирует:

```text
package name
version
supported environments
artifact sha256
artifact size
```

Browser artifact имеет канонический URL:

```text
/@scope/package?env=<environment>&version=<semver>
```

Stable URL без `version` указывает на текущую принятую версию.

В development-профиле каждый JavaScript artifact получает отдельную immutable
source map. JavaScript связывается с ней HTTP-заголовком `SourceMap`; map не
входит в release identity, `/code` или Cache Storage и загружается DevTools
только по отдельному URL с последним параметром `source-map`.

При `Accept-Encoding: br` server передаёт JavaScript и source map через Brotli.
`Vary: Accept-Encoding` разделяет транспортные представления, а package
SHA-256 и size по-прежнему относятся к распакованным canonical bytes.

## Публикация

Серверная publication выполняется как одна сериализованная операция:

1. определяется новый target version для изменяемых пакетов;
2. target versions записываются в root manifest как durable intent;
3. пакеты проходят typecheck и build;
4. artifacts и development source maps публикуются по immutable versioned paths;
5. child manifests получают согласованные версии;
6. новое состояние становится доступно через `/code`;
7. Service Worker получает сигнал `release-changed` и самостоятельно сверяет
   своё фактическое состояние.

Если build не прошёл до принятия нового состава, root intent восстанавливается.
Если процесс был прерван после durable intent, `recoverPublication()` завершает
переход при следующем старте сервера.

## Browser transaction

Service Worker не заменяет canonical caches по одному файлу без общей границы.
Обновление проходит через фиксированный cache `transaction`:

1. exact candidates загружаются и проверяются;
2. доказывается полный candidate composition;
3. при необходимости заранее готовится новый `release/service` runtime;
4. canonical caches приводятся к candidate composition;
5. итоговый composition повторно проверяется;
6. transaction удаляется последней durable операцией;
7. подготовленный runtime активируется.

При остановке между шагами следующий запуск продолжает ту же транзакцию.

## Граница ответственности

`release` отвечает за техническую целостность выпуска, но не определяет смысл
пакетов и не становится владельцем Quantum-состояния. Cosmos предоставляет
готовую среду и возможности; предметные законы остаются в Quantum.
