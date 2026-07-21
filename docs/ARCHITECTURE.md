# Архитектура реализации

Канонические ontology, causality, identity, cardinality и visual laws находятся
в [`zavx0z/concept`](https://github.com/zavx0z/concept). Этот документ описывает
только наблюдаемую структуру текущего runtime и не разрешает расхождения с
concept.

## Активный package graph

Root workspace graph задан явным списком в `package.json`:

- domain contracts: `types`;
- shared wire protocols и server/web transports: `shared`;
- central relay, `ForceLifecycle` и `MonadRouter`: `force`;
- domains: `dark`, `boundary`, `matrix`, `energy`, `bulk`;
- domain packages: `dark/{gravity,strong}`,
  `boundary/{atom,topology,wimp}`, `matrix/{gravity,strong,weak}`,
  `bulk/{gravity,strong,weak}`;
- reusable implementation: `pkg/engine`, `pkg/template`,
  `pkg/ui/{elements,components,hud}`, `fixture`;
- constructor and operational DSL: `create-metafor`.

Каталог `github/` остаётся локальной площадкой для временных Meta, но не
является workspace и не содержит subrepository configuration.

## Архитектурное чтение

Package graph нельзя читать как полную онтологию. Каноническая проекция имеет
вид `Domain × Force × Entity`: силы локально проявляются внутри доменов, а
корневой `force` реализует только текущий внешний ingress и междоменную связь.
Он не является всей Force.

Сохранившиеся domain packages `gravity`, `strong` и `weak` подтверждают это
измерение, но их текущий неполный состав ещё не является завершённой таблицей
сил. Возвращать обязанности старых реализаций только по имени каталога нельзя.

## Runtime entries

| Process  | Entry                | Default port |
| -------- | -------------------- | ------------ |
| Force    | `force/server.ts`    | 4000         |
| Boundary | `boundary/server.ts` | 4001         |
| Dark     | `dark/server.ts`     | 4002         |
| Matrix   | `matrix/server.ts`   | 4003         |
| Bulk     | `bulk/server.ts`     | 4004         |
| Energy   | `energy/server.ts`   | 4005         |

Root scripts запускают эти entries либо в hot development mode, либо обычными
Bun processes. Они не загружают Meta автоматически.

## Реализованное соединение

- `force/server.ts` принимает REST и создаёт пять доменных WebSocket-каналов.
- Domain transports из `shared/transport/force` подключаются к
  `ws://127.0.0.1:4000/ws`, если
  `FORCE_ADDRESS` не задан; `domain/id` передаются в HTTP Upgrade query.
- Domain Monads открывают отдельный локальный REST-канал к Force; его identity
  и method capabilities сохраняются сервером за непрозрачным токеном. Над
  каналом `MonadRpcPeer` одинаково обслуживает исходящие и входящие RPC, а
  закрытие удаляет канал из `MonadRouter`.
- После Upgrade по WebSocket идут только Particle без register, readiness или
  bootstrap messages; само подключение Particle не создаёт.
- `force/force.ts` является только relay и перенаправляет Particle по готовым
  каналам Store.
- Domain handlers применяют входные particles к собственным runtime structures.
- Dark читает внешний `github/<src>/meta.ts` в ширину и испускает отдельные
  декларационные Particle по мере чтения; Meta не становится внутренней
  сущностью.
- `boundary/server.ts` открывает SQLite, материализует Particle в
  нормализованные реляционные таблицы и публикует результаты через Force.
- `bulk/server.ts` обслуживает web entry, шрифт, browser WebSocket и связывает
  browser manifestation с Force.
- Matrix weak backend выбирается через `METAFOR_WEAK_BACKEND=auto|cpu|gpu`.

Декларационный `path` является категорией (`wimp`, `field`, `state`, `matter` и
так далее), а не slash-адресом дерева Meta. WIMP идентифицируется своим `src`;
вложенные сущности — парой WIMP SRC и локального числового индекса.

## Persistence

Boundary development server по умолчанию использует
`.metafor/dev.sqlite`. Путь можно явно задать первым позиционным аргументом или
`BOUNDARY_PATH`.

Boundary suites открывают изолированные `:memory:` databases и закрывают их в
`afterEach`. Они не используют development database.

Boundary не хранит Meta-файл, JSON-зеркало декларации или второй snapshot
мира. WIMP, Field, Variant, State, Transition, Condition, Process, Reaction,
Matter, Mass и materialized Atom/Topology/Value разложены по отдельным связанным
таблицам. Производные runtime-проекции можно восстановить из этих отношений.

## Bulk и renderer

Сохранены source-backed world projection, generic viewport, navigation,
fullscreen и WebGPU renderer. HUD ограничен кнопкой полноэкранного режима:
пользовательских настроек изображения, ручного выбора Root SRC, статуса и
пересчёта сцены в нём нет. Удалённые bot, phone, Android и WebRTC application
paths были отключёнными product-specific ветками и не входили в причинный
runtime contour.

Legacy manifestation evidence, State occurrences, Conditions, relations,
projections и visual implementation остаются доступными для последующего
MF-000 D-5 audit. Cleanup не устанавливает новых visual laws.

Визуальные законы задаются только в коде и не сохраняются в browser storage.
Постоянная декоративная анимация программно выключена. Renderer останавливается,
когда движение завершено; следующий кадр запрашивается из-за релевантного
Impulse, изменения `ViewPoint` или незавершённого конечного проявления. Новая
корневая Particle детерминированно переключает наблюдение на материализованный
Atom без ручной команды из интерфейса.

Текущий `ViewPoint` привязан к DOM element. Смысловой контракт должен стать
platform-neutral, чтобы одна точка наблюдения могла представлять обычный экран,
телефон, WebXR, AR или VR без изменения законов Bulk.

## Create MetaFor

`create-metafor` остаётся активным workspace и CLI. Его templates, generator
tests и `rules/metafor.md` проверяются локально вместе с остальным runtime.
