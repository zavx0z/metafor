# Текущий milestone: первоначальное рождение Matrix через Force RPC

Этот файл задаёт текущую узкую проверку и не заменяет каноническую концепцию.

## Результат

Matrix получает первоначальное каноническое состояние через service-plane до
подключения своего realtime Particle-канала:

```text
Boundary Monad ↔ Boundary MonadRpcPeer ↔ Boundary MonadChannel
                                              ⇅
                    transport adapter (сейчас REST; будущая замена вне milestone)
                                              ⇅
                                         MonadRouter
                                              ⇅
                    transport adapter (сейчас REST; будущая замена вне milestone)
                                              ⇅
Matrix Monad ↔ Matrix MonadRpcPeer ↔ Matrix MonadChannel
        ↓
Matrix Store/Weak → Matrix Particle runtime
```

Force остаётся единой физической точкой межмонадной маршрутизации. `MonadRouter`
прикрепляет source из `MonadChannel`, проверяет target/method capabilities и
коррелирует ответ между двумя каналами, но не интерпретирует канонические строки
Boundary и Matrix projection. Identity `MonadChannel` не ограничена пятью
runtime-доменами.

Текущий REST adapter принимает identity один раз при локальном открытии канала и
возвращает непрозрачный токен. Method capabilities и callback endpoint
объявляются при том же открытии; отдельной client/provider registration нет.
RPC и close используют только токен. Source берётся из серверного состояния
канала, а закрытие удаляет сам канал из Router. Такая модель доверяет
loopback-границе и не объявляется межхостовой аутентификацией.

## Ownership и порядок рождения

- `boundary/initial.ts` читает нормализованные канонические строки Boundary;
- `boundary/monad.ts` предоставляет `boundary.initialState.read` через
  transport-neutral `MonadRpcPeer` и не знает о REST;
- `force/monad.ts` содержит только `ForceLifecycle` пяти `ForceChannel`, gate и
  fail-stop, без RPC и physical transport;
- `force/rpc.ts` содержит transport-neutral `MonadRouter`;
- `shared/transport/monad` владеет `MonadChannel`, `MonadRpcPeer` и текущим REST
  adapter; замена adapter не меняет Монады и Router;
- `shared/transport/force/{server,web}.ts` условно экспортируют единый Particle
  transport API;
- `shared/protocol/{force,monad}` владеет единым wire contract без environment
  forks;
- `matrix/monad.ts` запрашивает первоначальное состояние через Force;
- `matrix/birth-order.ts` ждёт готовности `ForceChannel` Dark, Boundary, Energy
  и Bulk до initial RPC и не позволяет существующему Matrix channel выдать себя
  за готовность текущего процесса;
- `matrix/birth.ts` владеет преобразованием в Matrix Store/Strong/Weak;
- только после подготовки постоянного Store `matrix/server.ts` динамически
  рождает runtime и подключает `Force("matrix")`.

Force RPC routes доступны в состоянии `starting`; Particle relay по-прежнему
открывается только после готовности пяти доменных каналов. Matrix runtime
рождается последним: его первая Weak evaluation может сразу испустить process
work, поэтому остальные четыре runtime-получателя уже должны существовать.
Порядок старта OS/Bun processes сам по себе не считается такой гарантией.

Разрушение только служебного `MonadChannel` отсоединяет identity от
`MonadRouter` и делает новые RPC-вызовы недоступными. Оно не меняет состояние
`ForceLifecycle`; уже рождённый runtime продолжает жить. Если физическая авария
одновременно разрушает обязательный `ForceChannel`, применяется отдельный
realtime fail-stop закон.

## Неподвижная Particle-граница

По WebSocket после Upgrade передаётся только одна типизированная Particle.
Нельзя добавлять service frames, snapshot payload или RPC envelope в realtime
канал. Открытие transport-а не испускает bootstrap Particle; Matrix не принимает
`runtime/matrix` snapshot и рождается только из service-plane initial state.

## Public boundaries

- `shared/transport/force` экспортирует выбранный средой Particle client;
- `shared/transport/monad` экспортирует выбранный средой `MonadTransport`, общий
  `MonadChannel` и transport-neutral `MonadRpcPeer`;
- `MonadRouter` и server assembly остаются private; transport adapters
  экспортируются только из `shared/transport/monad`;
- общие RPC types находятся в `shared/protocol/monad/rpc`;
- общие Particle types находятся в `shared/protocol/force/*`;
- Boundary initial-state contract находится в
  `@metafor/types/boundary/initial`;
- production domain не импортирует implementation другого domain.

## Автоматическое доказательство

```bash
bun test shared
bun test force
bun test boundary
bun test matrix
bun run typecheck
bun run check
```

Тесты должны доказать:

- Force RPC маршрутизирует call/response между постоянными каналами, прикрепляет
  source открытого канала и проверяет target/method/correlation id;
- одна Монада может через тот же канал и вызывать методы, и предоставлять их;
- запрос без токена канала отклоняется, а закрытие удаляет только текущий канал
  конкретной identity;
- Boundary и Matrix Monads не используют `Request`, `Response`, endpoint или
  REST-specific client;
- RPC доступен при `state: "starting"` и не создаёт Particle frames;
- Bun/browser Force transports передают identity только в HTTP Upgrade и не
  испускают служебный `z/test` после подключения;
- `shared/package.json` выбирает server/web transports через conditional
  exports, сохраняя один public import и один protocol;
- Boundary возвращает canonical rows, не Matrix-packed snapshot;
- Matrix сама собирает Store/Strong/Weak до рождения runtime;
- Matrix ждёт остальные четыре `ForceChannel` и открывает свой realtime channel
  последним;
- realtime incremental Particle handling Matrix остаётся прежним;
- строгая CPU/WebGPU parity остаётся зелёной.

## Живая приёмка

Следовать `owner` из `doctor`: существующий Interpreter-контур не заменять, а при
`owner: none` запускать контур через `run world start`. После обновления
затронутых процессов проверить:

```bash
bun .agents/skills/metafor-dev/scripts/metafor-dev.mjs doctor
bun .agents/skills/metafor-dev/scripts/metafor-dev.mjs run inflaton-add
bun .agents/skills/metafor-dev/scripts/metafor-dev.mjs run meta-read capsule --fixture capsule
```

Ожидается `healthy: 6`, `ready: 6`, Force `running`, Boundary `rpc: "ready"`,
Matrix `rpc: "ready"` и `initialized: true`. Bulk visual acceptance проверяется
свежим `inflaton-add` без перезагрузки страницы: новый Atom должен появиться в
уже открытом Bulk.
