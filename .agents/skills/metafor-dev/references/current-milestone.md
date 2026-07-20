# Текущий milestone: первоначальное рождение Matrix через Force RPC

Этот файл задаёт текущую узкую проверку и не заменяет каноническую концепцию.

## Результат

Matrix получает первоначальное каноническое состояние через service-plane до
подключения своего realtime Particle-канала:

```text
Boundary Monad HTTP provider
        ⇅
transport adapter (сейчас REST, позднее возможен WebRTC DataChannel)
        ⇅
MonadRouter
        ⇅
transport adapter (сейчас REST, позднее возможен WebRTC DataChannel)
        ⇅
Matrix Monad → Matrix Store/Weak → Matrix Particle runtime
```

Force остаётся единой физической точкой межмонадной маршрутизации. `MonadRouter`
прикрепляет source из `MonadChannel`, проверяет регистрацию target/method и
коррелирует ответ, но не интерпретирует канонические строки Boundary и Matrix
projection. Identity `MonadChannel` не ограничена пятью runtime-доменами.

## Ownership и порядок рождения

- `boundary/initial.ts` читает нормализованные канонические строки Boundary;
- `boundary/monad.ts` предоставляет `boundary.initialState.read` и регистрирует
  provider в Force;
- `force/monad.ts` содержит только `ForceLifecycle` пяти `ForceChannel`, gate и
  fail-stop, без RPC и physical transport;
- `force/rpc.ts` содержит transport-neutral `MonadRouter`;
- `shared/transport/monad/{server,web}.ts` условно экспортируют единый REST
  adapter API;
- `shared/transport/force/{server,web}.ts` условно экспортируют единый Particle
  transport API;
- `shared/protocol/{force,monad}` владеет единым wire contract без environment
  forks;
- `matrix/monad.ts` запрашивает первоначальное состояние через Force;
- `matrix/birth.ts` владеет преобразованием в Matrix Store/Strong/Weak;
- только после подготовки постоянного Store `matrix/server.ts` динамически
  рождает runtime и подключает `Force("matrix")`.

Force RPC routes доступны в состоянии `starting`; Particle relay по-прежнему
открывается только после готовности пяти доменных каналов.

## Неподвижная Particle-граница

По WebSocket после Upgrade передаётся только одна типизированная Particle.
Нельзя добавлять service frames, snapshot payload или RPC envelope в realtime
канал. Открытие transport-а не испускает bootstrap Particle; Matrix не принимает
`runtime/matrix` snapshot и рождается только из service-plane initial state.

## Public boundaries

- `shared/transport/force` экспортирует выбранный средой Particle client;
- `shared/transport/monad` экспортирует выбранный средой REST client;
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

- Force RPC маршрутизирует по provider/method, прикрепляет trusted source и
  проверяет correlation id;
- RPC доступен при `state: "starting"` и не создаёт Particle frames;
- Bun/browser Force transports передают identity только в HTTP Upgrade и не
  испускают служебный `z/test` после подключения;
- `shared/package.json` выбирает server/web transports через conditional
  exports, сохраняя один public import и один protocol;
- Boundary возвращает canonical rows, не Matrix-packed snapshot;
- Matrix сама собирает Store/Strong/Weak до рождения runtime;
- realtime incremental Particle handling Matrix остаётся прежним;
- строгая CPU/WebGPU parity остаётся зелёной.

## Живая приёмка

Использовать существующий `owner: interpreter`; не перезапускать весь контур и
не менять владельца. После точечных restart затронутых процессов проверить:

```bash
bun .agents/skills/metafor-dev/scripts/metafor-dev.mjs doctor
bun .agents/skills/metafor-dev/scripts/metafor-dev.mjs run inflaton-add
bun .agents/skills/metafor-dev/scripts/metafor-dev.mjs run meta-read capsule --fixture capsule
```

Ожидается `healthy: 6`, `ready: 6`, Force `running`, Boundary `rpc: "ready"`,
Matrix `rpc: "ready"` и `initialized: true`. Bulk visual acceptance проверяется
отдельно и не входит в milestone рождения Matrix через RPC.
