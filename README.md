# MetaFor

<div align="center">
  <img src="docs/img/metafor.gif" alt="Анимированный обзор MetaFor" width="444" />
</div>

**MetaFor — пространство цифрового сознания, расширяющее нашу вселенную.**

MetaFor — открытая эволюционирующая среда, в которой люди, агенты, устройства,
приложения, память, пространство и действие могут существовать в одной причинной
системе. Это не обвязка вокруг языковой модели и не очередной state manager.

Действующие архитектурные и доменные контракты ведутся в документации этого
репозитория рядом с кодом и тестами. Рабочая карта находится в
[`docs/README.md`](docs/README.md); внешние материалы для разработки не нужны.

## Архитектура ядра

Текущий контур состоит из пяти доменных проекций:

- `Dark` — чтение внешних Meta-деклараций, скрытая связность и история;
- `Boundary` — каноническая реляционная materialized persistence;
- `Matrix` — детерминированное вычисление State и Transition;
- `Energy` — исполнение Process и Reaction, живые runtime-сущности и отдельная
  рабочая Mass;
- `Bulk` — WebGPU manifestation и наблюдаемая форма.

`Force` переносит по одной минимальной `Particle` в одном `ForceMessage`.

Строго типизированная Meta-декларация разделяет два runtime-домена:

```typescript
.mass({ profiles: {}, attempts: 0 })
.energy<{socket: WebSocket}>()
```

`Mass` — сериализуемый изменяемый рабочий материал Energy. Его целевое хранилище
находится на filesystem и сохраняет версии; текущий in-memory store является
незавершённой реализацией. `Energy` — постоянно типизированные живые сущности,
которые создаются внешними action-модулями и освобождаются через `destroy`.
Generic `.energy<EnergyType>()` нужен только TypeScript: runtime не
получает объект и не добавляет Energy в MetaDSL/WIMP. В типе нет функций верхнего
уровня; inline action и destroy только динамически
импортируют исполняемый модуль и возвращают его результат. Аргументы вызова —
только декларативное wiring: spread/iterator, вложенные вызовы и мутации в них
запрещены; параметры wrapper не содержат default/rest.

Matter передаёт дочернему Atom оба runtime-контекста раздельно:

```typescript
.matter(({ mass, energy, html }) => html`
  <meta-for
    src="zavx0z/capsule/profile"
    mass=${{ profiles: mass.profiles }}
    energy=${{ socket: energy.socket }}
  />
`)
```

Boundary/SQLite хранит только сериализуемые `massBinding` и `energyBinding`
этого Matter edge. Перед claim дочернего Process Energy локально разрешает их из
stores ближайшего owning parent Atom. Прямые `mass=${mass}` и
`energy=${energy}` сохраняют identity объектов; сами Mass, Energy-сущности и
runtime-ссылки не проходят через Force и не записываются в Boundary.

При cold start Energy сначала через собственную Monad получает полную canonical
проекцию Boundary и гидратирует локальный catalog
Atom/Topology/Field/Variant/Process и оба binding descriptor. Только после
этого она открывает обязательный ForceChannel; после рождения RPC на claim нет,
а изменения приходят обычными Graviton. Такой Graviton немедленно rebind-ит уже
проявленные aliases и отменяет pending claim старой связи.

Initial cut не требует replay/control frame: пока Matrix не подключена
последней, Force остаётся в `starting` и отклоняет Particle как от агента, так и
от доменных channels.

```text
external input
→ Boundary canonical commit
→ Matrix gravity → strong → weak
→ Photon
→ Energy Process
→ Boundary Process commit
→ Reaction
→ Energy Reaction
→ Boundary Reaction commit
→ Matrix next State
→ Bulk
```

Production Matrix имеет один вычислительный путь:

```text
gravity → strong → weak
```

`Weak` использует WebGPU как основной параллельный backend. CPU остаётся
детерминированным fallback/reference. Отдельного TypeScript evaluator и второй
Matrix-проекции нет.

Matrix получает `boundary.initialState.read` и сама строит производный packed
runtime. Boundary не хранит вторую Matrix-проекцию.

## Запуск ядра

Установка:

```bash
bun install
```

Ядро запускается без встроенной Meta. Внешний физический Cluster хранит Galaxy-
владельцев и их Atom-репозитории:

```text
cluster/<owner>/<repository>/meta.ts
cluster/<owner>/<repository>/<meta-package>/meta.ts
```

Dark принимает WIMP `src` `<owner>/<repository>` для корневого Atom либо
`<owner>/<repository>/<meta-package>` для внутреннего Atom. `cluster/` в `src`
не входит. Meta остаётся внешней декларацией: внутрь Вселенной входят только
сформированные из неё WIMP, Field, State, Matter и другие отдельные сущности.

## Запуск Вселенной

Полный причинный contour:

```bash
bun run runtime:universe
```

Однократная проверка рождения того же полного contour:

```bash
bun run runtime:universe:once
```

Домены запускаются обычными Bun processes. После изменения кода весь contour
останавливается и запускается заново; частичная горячая перезагрузка не
поддерживается.

Matrix по умолчанию использует `auto`: выбирает WebGPU при доступности и
детерминированный CPU fallback в остальных средах. `gpu` остаётся явным строгим
режимом, `cpu` — принудительным reference backend.

## Проверка

```bash
bun run check
bun run typecheck:expect-errors
```

## Активная граница репозитория

В рабочем дереве остаются только MetaFor, его домены, DSL/Matter/template,
WebGPU engine, Bulk, reusable UI и нейтральные runtime fixtures. Прежние product
shells — Interpreter, Voice, Android, Browser Agent, PTY и Tauri — удалены из
активной ветки. Их история сохранена в:

```text
archive/pre-core-split-2026-07-11
```

## Документация

- [Карта документации](docs/README.md)
- [Архитектура](docs/ARCHITECTURE.md)
- [Доменные контракты](docs/domains/README.md)
- [Matrix](docs/domains/MATRIX.md)
- [Force](docs/FORCE.md)
- [Meta-пакеты](docs/META_PACKAGES.md)
- [Разработка](docs/DEVELOPMENT.md)
- [Вклад](docs/CONTRIBUTING.md)

## Автор

MetaFor развивается Владимиром Филипенко
([zavx0z](https://career.habr.com/zavx0z)) около четырнадцати лет.

Контакты:

- Email: [zavx0z@yahoo.com](mailto:zavx0z@yahoo.com)
- Telegram: [@zavx0z](https://t.me/zavx0z)

## Лицензия

[GNU Affero General Public License v3.0 or later](docs/LICENSE)
