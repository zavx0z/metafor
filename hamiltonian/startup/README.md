# `@hamiltonian/startup`

`@hamiltonian/startup` — минимальная устойчивая оболочка между платформенной
точкой входа и сменяемым [`@hamiltonian/release`](../release/README.md). Она
должна оставаться достаточно малой, чтобы получить, проверить и запустить
release даже тогда, когда всё после неё нужно заменить.

Общий закон сред и граница Hamiltonian определены в
[корневом контракте](../README.md#общий-закон). Этот документ владеет только
ролью startup package.

## Ответственность

Startup:

* первым входит в поддерживаемую среду исполнения;
* устанавливает минимальные platform lifecycle hooks;
* получает и проверяет release до исполнения;
* удерживает один текущий release runtime;
* при замене направляет новые события преемнику, завершает уже начатые события
  прежнего runtime и затем уничтожает прежнее воплощение.

Startup не выбирает состав [`@internal/*`](../docs/INTERNAL.md) и будущих
[`@metafor/*`](../docs/METAFOR.md) packages, не владеет cache и update policy,
не реализует RPC, signaling или прикладную работу. Эти решения принадлежат
release и загруженным им packages.

## Реализованные browser-среды

| Среда | Роль |
| --- | --- |
| `main` | Регистрирует startup Service Worker, ждёт фактического controller и передаёт Window управлению release |
| `service` | Синхронно принимает Service Worker lifecycle events, поднимает release runtime и передаёт ему `fetch` и `message` |

Service Worker startup загружает один проверенный release artifact из
канонического локального code storage либо через сеть. Низкоуровневые операции
проверки, чтения и исполнения передаются release только вниз как замороженная
dependency-граница. Сам startup не знает, какие packages входят в выпуск и как
они обновляются.

Release сначала создаётся как отдельный runtime. Startup разрешает ему начать
работу, переключает последующие события на него, дожидается незавершённых
операций прежнего runtime и вызывает его единый lifecycle cleanup. Регистрация
Service Worker при этом остаётся устойчивой оболочкой.

## Целевая server-среда

Среда `server` ещё не реализована и не объявлена package export. По принятому
закону корневой `server.ts` должен только запустить `startup/server` и передать
ему управление. Server startup должен получить, проверить и запустить текущий
`release/server`; вся рабочая серверная среда после него должна заменяться
целиком через новое воплощение.

Сейчас `server.ts` напрямую импортирует `@hamiltonian/release` и сам содержит
HTTP/WSS surface. Это подтверждённое расхождение текущей реализации с целью, а
не скрытая возможность startup package. Буквальные Service Worker API, Cache
Storage и browser event lifecycle на server не переносятся: общий смысл
сохраняется через отдельный платформенный механизм.

## Public-граница

Package экспортирует только фактически существующие `main` и `service`
entrypoints. Точная форма loader dependencies и release runtime задаётся
public types package `@hamiltonian/release`; startup предоставляет их
реализацию, но не переобъявляет чужой контракт.

Имена export conditions, build artifacts и точные команды принадлежат
[`package.json`](package.json), коду и
[руководству разработки](../../.agents/skills/metafor-dev/references/development.md),
а не предметному закону этого README.
