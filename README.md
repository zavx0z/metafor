# MetaFor

<div align="center">
  <img src="docs/img/metafor.gif" alt="Анимированный обзор MetaFor" width="444" />
</div>

**MetaFor — пространство цифрового сознания, расширяющее нашу вселенную.**

MetaFor — открытая эволюционирующая среда, в которой люди, агенты, устройства,
приложения, память, пространство и действие могут существовать в одной причинной
системе. Это не обвязка вокруг языковой модели и не очередной state manager.

Каноническая логическая модель, математическая формализация бесконечно-конечного
автомата и миссия проекта находятся в
[`zavx0z/concept`](https://github.com/zavx0z/concept). Этот репозиторий содержит
рабочую реализацию.

## Архитектура ядра

Текущий контур состоит из пяти доменных проекций:

- `Dark` — declaration, скрытая связность и эволюция Meta;
- `Boundary` — каноническая materialized persistence;
- `Matrix` — детерминированное вычисление State и Transition;
- `Energy` — исполнение Process, Reaction и локальная Mass;
- `Bulk` — WebGPU manifestation и наблюдаемая форма.

`Force` переносит по одной минимальной `Particle` в одном `ForceMessage`.

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

Boundary может передать Matrix производную `runtime/matrix` projection для
инициализации packed runtime. Она не является второй истиной: её можно удалить и
полностью восстановить из Boundary.

## Запуск ядра

Установка:

```bash
bun install
```

Ядро запускается без встроенной Meta. Текущие итерационные Meta создаются в
`github/<owner>/<name>/meta.ts` и загружаются явно через Dark.

## Запуск доменов

Development core без автоматической загрузки Meta:

```bash
bun run dev:core
```

Development contour с Bulk:

```bash
bun run dev:world
```

Обычный non-hot запуск и полный журнал:

```bash
bun run start:core
bun run start:world
bun run logs:core
```

Matrix backend задаётся через `METAFOR_WEAK_BACKEND=auto|cpu|gpu`.

## Проверка

```bash
bun run check
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

- [Каноническая концепция](https://github.com/zavx0z/concept)
- [Указатель канонической философии](docs/PHILOSOPHY.md)
- [Указатель канонической онтологии](docs/ONTOLOGY.md)
- [Архитектура](docs/ARCHITECTURE.md)
- [Указатель canonical topology](docs/TOPOLOGY.md)
- [Force](docs/FORCE.md)
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
