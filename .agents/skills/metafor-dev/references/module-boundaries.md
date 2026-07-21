# Package boundaries, imports и exports

Эта reference — обязательный operational checklist для агентов. Канонический
смысл находится в `zavx0z/concept`, `CORE.md` и разделе 23
`core/RUNTIME_INVARIANTS.md`; skill не заменяет концепцию.

## Сначала классифицировать symbol

Перед изменением module topology определить для каждого symbol ровно одну роль:

- **public API** — нужен внешнему production-consumer;
- **internal implementation** — используется только внутри package;
- **shared type** — принадлежит `@metafor/types`;
- **test-only fixture** — нужен только тестам и harness.

Если реального внешнего production use case нет, symbol не добавляется в главный
`index.ts`.

## Production gate

- Предметный домен не импортирует runtime-функции, Store, fixtures или
  внутренние типы другого предметного домена.
- Realtime предметные consequences проходят через Particle и Force.
- Service-plane взаимодействие Монад проходит через transport-neutral Force
  RPC; текущий REST adapter не является новым видом Particle.
- Identity REST `MonadChannel` связывается с токеном при локальном открытии;
  source не передаётся в URL или payload отдельного RPC.
- Доменная Монада зависит только от `MonadRpcPeer`; `Request`, `Response`, REST
  endpoint и channel token остаются server/transport implementation.
- Общие transports импортируются из public subpaths
  `shared/transport/{force,monad}`.
- Внутри package implementation импортируется относительно из точного
  модуля-владельца, а не через собственный `index.ts`.
- Внешний production-consumer использует только объявленный public API и не
  обращается к private implementation по глубокому пути.
- Общие типы импортируются непосредственно из точного модуля
  `@metafor/types/*`; функциональный package не переэкспортирует их.
- Главный `index.ts` не является barrel. Запрещены convenience re-exports
  внутренних helpers, Store, Монады, промежуточных contracts и implementation
  types.

## Test gate

- Unit-тест находится у package или модуля, чью логику он доказывает.
- Unit-тест импортирует implementation и helpers относительными путями.
- Package не добавляется в `devDependencies` только ради тестового import.
- Источник helper не переносит ownership теста в другой package.
- Корневой integration test может соединять несколько доменов прямыми
  относительными imports только как test harness. Этот путь запрещён в
  production.
- Fixtures находятся в отдельном test-only module/subpath и не входят в главный
  production `index.ts`.
- Только отдельный public-contract test импортирует корневой package как внешний
  consumer и проверяет точный набор его exports.

## Текущий shared/Force contract

Для packages `shared` и `force`:

- `shared/transport/force` условно экспортирует server/web implementation
  transport client `Force`;
- `shared/transport/monad` условно экспортирует server/web implementation
  `MonadTransport`, общий `MonadChannel` и transport-neutral `MonadRpcPeer`;
- conditional export выбирает physical adapter, но не меняет его public API;
- Dark, Boundary, Matrix, Energy и Bulk используют `import {Force} from
  "shared/transport/force"`;
- server домена создаёт `MonadTransport`, а доменная Монада получает
  `MonadRpcPeer` из `shared/transport/monad`;
- relay `routeParticle`, `force$`, `forceDomains`, Store, `ForceLifecycle`,
  `MonadRouter` и внутренние
  типы остаются internal package `force`;
- Force unit tests импортируют `force.ts`, `store.ts`, `monad.ts`, `server.ts` и
  `rpc.ts` относительно;
- `force/fixture` является отдельным test-only subpath;
- Particle protocol импортируется напрямую из `shared/protocol/force/*`, RPC
  envelope — из `shared/protocol/monad/rpc`, а canonical initial-state
  contract — из `@metafor/types/boundary/initial`.

## Review checklist

Перед завершением изменения проверить:

1. Не появился ли production cross-domain import.
2. Не расширен ли `index.ts` только ради удобства.
3. Не переэкспортирован ли shared type.
4. Не импортирует ли package собственный `index.ts` изнутри.
5. Находится ли unit-тест у владельца логики и использует ли relative imports.
6. Изолированы ли fixtures от production API.
7. Есть ли отдельный public-contract test, если внешний API действительно
   изменился.

Нарушение этого checklist является архитектурной ошибкой даже при зелёных
tests: зелёный тест не превращает обход доменной границы в допустимый контракт.
