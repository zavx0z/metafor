# Текущий milestone: Монада, transport и relay Force

Этот файл задаёт текущую узкую проверку и не заменяет каноническую концепцию.

## Результат

Изменяется только домен Force:

```text
Bun/browser Force transport
→ identity в HTTP Upgrade
→ пять физических Particle-каналов в force$
→ relay force.ts
→ адресная доставка доменам
```

Dark, Boundary, Matrix, Energy и Bulk продолжают пользоваться прежним публичным
`new Force(domain)`. Их runtime на этом этапе не переносится на собственные
Монады.

## Граница модулей

- `force/force.ts` — только relay и вшитые законы перенаправления;
- `force/store.ts` — только каналы пяти обязательных доменов;
- `force/transport/` — общий контракт и прежние Bun/browser WebSocket adapters доменов;
- `force/monad.ts` — server state, readiness, общий gate и fail-stop;
- `force/server.ts` — REST/WebSocket/process events, отображённые на Монаду;
- `force/src/` — техническое создание физических каналов и логирование;
- `force/fixture.ts` — отдельный test-only contract;
- `force/index.ts` — только публичный transport client `Force`.

## Закон WebSocket-канала

Identity `domain/id` передаётся как часть HTTP Upgrade до открытия канала. После
Upgrade по WebSocket передаётся только одна типизированная Particle.

Не вводить в WebSocket отдельные служебные frames:

- `register`;
- readiness или health messages;
- snapshot или domain replay payload;
- `paused`, error или другую служебную Particle.

До отдельной миграции прежние transport clients ещё испускают обычную Particle
`z/test force/replay/...`. Это известный старый путь: Монада временно поглощает
его на domain ingress и возвращает пустую доставку. Relay и другие домены его не
видят. Исходные replay-тесты сохраняются как `skip`, а не переписываются под мок.

Transport сохраняет прежние физическое соединение, упорядочивание, outbox до
открытия и попытку reconnect. Эти механизмы не являются автоматическим
восстановлением Вселенной: после потери обязательного домена Монада остаётся в
`error`, закрывает общий relay gate и требует нового server lifecycle.

Канал валиден по конструкции. Монада и relay не проверяют повторно форму
Particle и не сравнивают её `by` с именем канала. Временный мок Монады распознаёт
только старый replay path. Настоящий числовой `z/test` Energy остаётся обычной
Particle.

## Автоматическое доказательство

```bash
bun test force
bun run typecheck
bun run check
```

Тесты должны доказать:

- transport client передаёт identity в Upgrade и не испускает service frames;
- Монада поглощает старый `z/test force/replay/...`, но пропускает числовой
  `z/test` Energy;
- Store содержит пять физических доменных каналов;
- relay применяет текущие routing laws;
- Монада разрешает runtime после подключения всех доменов;
- потеря любого работающего канала выполняет fail-stop без error Particle;
- unit-тесты импортируют relay, Store, Монаду, server и adapters относительно;
- public-contract test доказывает, что корневой `force` открывает `Force`, но не
  внутренние symbols;
- переходная fixture старых доменов использует настоящий WebSocket transport.

## Живая приёмка

После автоматических проверок использовать существующий `owner: interpreter`
или выполнить `run world start` только при `owner: none`, затем запустить
`run inflaton-add` и `run meta-read`. Force health должен показать `running` и
пять `connectedDomains`; Bulk должен проявить причинный результат. После
приёмки остановить только `owner: metafor-dev`; Interpreter-контур оставить
работать.
