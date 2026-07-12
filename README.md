# MetaFor

<div align="center">
  <img src="docs/img/metafor.gif" alt="Анимированный обзор MetaFor" width="444" />
</div>

**MetaFor — пространство цифрового сознания, расширяющее нашу вселенную.**

MetaFor — это открытая эволюционирующая среда, в которой люди, агенты, устройства,
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
- `Energy` — исполнение Process и локальная Mass;
- `Bulk` — WebGPU manifestation и наблюдаемая форма.

`Force` переносит по одной минимальной `Particle` в одном `ForceMessage`.

```text
Meta / DSL
→ Dark / Inflaton
→ Boundary commit
→ Matrix gravity → strong → weak
→ Photon
→ Energy Z claim/copy
→ W proposal
→ Boundary canonical commit
→ Gluon/Higgs consequences
→ Reaction
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

## Текущий статус

GitHub Actions подтверждает:

- CPU и WebGPU исполняют одинаковые State/lock/Photon traces;
- WebGPU compute реально работает через Vulkan software adapter;
- внешний Field input сначала коммитится Boundary и только затем достигает Matrix;
- Process result становится world truth только после Boundary validation и commit;
- Reaction исполняется Energy и использует тот же canonical world writer;
- минимальный universe проходит полный путь `Input → Process → Reaction` без Bulk;
- structured logs восстанавливают порядок Inflaton, Graviton, Gluon, Higgs,
  Photon, Z и W.

Рабочий non-visual контур уже замкнут:

```text
external Input
→ Boundary
→ Matrix
→ Process / Energy
→ Boundary
→ Reaction / Energy
→ Boundary
→ Matrix
```

## Быстрый запуск

Установка:

```bash
bun install
```

Одна команда поднимает Force, Boundary, Dark, Matrix и Energy, ждёт health и
регистрацию доменов, затем активирует `METAFOR_ROOT`:

```bash
bun start
```

По умолчанию активируется нейтральная Meta `test/runtime-universe`. Другой корень
и постоянная Boundary database задаются окружением:

```bash
METAFOR_ROOT=owner/project \
BOUNDARY_PATH=./data/boundary.sqlite \
bun start
```

Эквивалентная команда:

```bash
bun run runtime
```

Полный журнал Impulse:

```bash
bun run runtime:logs
```

Явные backend-режимы Matrix:

```bash
bun run runtime:cpu
bun run runtime:gpu
```

`runtime:gpu` является строгим режимом: отсутствие WebGPU завершает запуск
ошибкой. `auto` предпочитает WebGPU и использует CPU только как fallback.

Для запуска доменов без автоматической активации Meta:

```bash
METAFOR_AUTO_ACTIVATE=0 bun run runtime
```

Либо без launcher lifecycle:

```bash
bun run runtime:domains
```

Проверка one-command launch и полного universe:

```bash
bun run test:runtime-launch
bun run test:runtime-universe
```

Полная проверка:

```bash
bun test
bun run tsc --noEmit
```

## Активная граница репозитория

В рабочем дереве остаются только MetaFor, его домены, DSL/Matter/template,
WebGPU engine, Bulk, reusable UI и нейтральные fixtures. Прежние product shells —
Interpreter, Voice, Android, Browser Agent, PTY и Tauri — удалены из активной
ветки. Их история сохранена в:

```text
archive/pre-core-split-2026-07-11
```

## Документация

- [Каноническая концепция](https://github.com/zavx0z/concept)
- [Философия](docs/PHILOSOPHY.md)
- [Онтология](docs/ONTOLOGY.md)
- [Архитектура](docs/ARCHITECTURE.md)
- [Topology](docs/TOPOLOGY.md)
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
