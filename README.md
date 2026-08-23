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
.mass((mass) => ({profiles: mass.json(), attempts: mass.json()}))
.energy<{socket: WebSocket}>()
```

`Mass` — сохраняемый файловый материал. `.mass(...)` объявляет только именованные
ключи, codec (`json` или `binary`) и описательную metadata; Process получает для
каждого ключа `MassHandle` с `readBytes`, `readText`, `readJson` и `write`.
Boundary владеет identity ключей и bindings, а Energy читает и атомарно заменяет
файлы плоского worktree-каталога `mass/<key-id>.<extension>`. MIME, путь и
версионирование в текущий контракт не входят. `Energy` — постоянно
типизированные живые сущности, которые создаются внешними action-модулями и
освобождаются через `destroy`.
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
    src="zavx0z/capsule-profile"
    mass=${{ profiles: mass.profiles }}
    energy=${{ socket: energy.socket }}
  />
`)
```

Boundary/SQLite хранит только сериализуемые `massBinding` и `energyBinding`
этого Matter edge. Перед claim дочернего Process Energy локально разрешает их из
stores ближайшего owning parent Atom. Прямые `mass=${mass}` и
`energy=${energy}` сохраняют локальную identity handle/store projection; сами
Mass bytes, Energy-сущности и runtime-ссылки не проходят через Force и не
записываются в Boundary.

При запуске Energy сначала получает от Boundary полный текущий каталог и
готовит местные связи. Matrix подключается последней и получает согласованный
снимок текущего мира: Atom, Fields, States и их декларации. Только после этого
Вселенная начинает принимать обычные изменения.

```text
внешнее изменение
→ Boundary записывает мир
→ Matrix выбирает State
→ Energy исполняет Process
→ Boundary проверяет и записывает его результат
→ Reaction
→ Matrix выбирает следующий State
→ Bulk показывает результат
```

Matrix рождается последней, получает от Boundary один согласованный снимок мира
и затем обрабатывает причинные изменения по порядку. Atom без States не входит
в состояние; Atom со States, но без выбранного State, на первом такте входит в
первый объявленный State. Process блокирует переходы только этого Atom, а не
всю Matrix. Полный жизненный цикл и все основные случаи описаны в
[`quantum/matrix/README.md`](quantum/matrix/README.md).

## Запуск ядра

Установка:

```bash
bun install
```

Ядро запускается без встроенной Meta. Внешний физический Cluster хранит Galaxy-
владельцев и их Atom-репозитории:

```text
cluster/<owner>/<repository>/meta.ts
```

Каждая Meta является независимым peer Git-репозиторием. Dark принимает только
двухсегментный WIMP `src` `<owner>/<repository>`; `cluster/` в `src` не входит,
третий сегмент и nested Meta repositories запрещены. Композиция выражается
Meta/Matter/Oracle references, а не файловой вложенностью. Meta остаётся внешней
декларацией: внутрь Вселенной входят только сформированные из неё WIMP, Field,
State, Matter и другие отдельные сущности.

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

Вселенная слушает только один порт Dark (`4000` по умолчанию). Остальные
домены сами подключают к нему Oracle и Force и не открывают собственных
listeners. Для параллельного второго contour достаточно задать другой порт:

```bash
METAFOR_UNIVERSE_PORT=4100 bun run runtime:universe
```

## Проверка

```bash
bun run check
bun run typecheck:expect-errors
```

## Активная граница репозитория

В рабочем дереве остаются только MetaFor, его домены, DSL/Matter/template,
WebGPU engine, Bulk, reusable UI и нейтральные runtime fixtures. Прежние product
interfaces — Interpreter, Voice, Android, Browser Agent, PTY и Tauri — удалены из
активной ветки. Их история сохранена в:

```text
archive/pre-core-split-2026-07-11
```

## Документация

- [Карта документации](docs/README.md)
- [Агентные Вселенные](docs/AGENT_UNIVERSES.md)
- [Архитектура](docs/ARCHITECTURE.md)
- [Доменные контракты](docs/domains/README.md)
- [Matrix](quantum/matrix/README.md)
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
