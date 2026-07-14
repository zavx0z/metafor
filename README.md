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

## Подтверждённый минимальный цикл

GitHub Actions фактически проверяет:

- внешний Gluon сначала коммитится в Boundary и только затем достигает Matrix;
- Matrix переводит Source `idle → ready`;
- Energy исполняет Process с замороженным read set;
- Boundary валидирует declared write set и атомарно фиксирует `output=2`;
- Matrix переводит Source `ready → complete`;
- Reaction исполняется в Energy, но коммитится тем же Boundary world writer;
- Reaction consequence достигает Matrix и переводит Target `idle → reacted`;
- Boundary хранит `input=1`, `output=2`, `observed=2` и оба итоговых State;
- CPU и реальный WebGPU/Vulkan backend дают одинаковые Matrix traces.

## Запуск живого universe

Установка:

```bash
bun install
```

Поднять свежий минимальный universe, провести полный причинный цикл и оставить его
работающим:

```bash
bun run runtime:universe
```

Команда сама запускает `Force`, `Boundary`, `Dark`, `Matrix`, `Energy` и `Bulk`, загружает
Meta, вводит внешний `input=1`, ждёт завершения Process и Reaction, печатает
структурированную трассу, печатает URL Capsule и подтверждает:

```text
input=1
output=2
observed=2
sourceState=complete
targetState=reacted
linuxActorId=<stable runtime id>
codexActorId=<stable runtime id>
capsuleUrl=http://localhost:4004/
```

Capsule восстанавливает структуру обычными Graviton-частицами и затем наблюдает
живые Photon, Gluon, Z и W±. Она показывает WIMP/Atom как прозрачную тороидальную
оболочку, все Fields как сферы общего ядра, полный State-граф с текущим рукавом,
одиночные Process/Reaction и реальные condition-связи. Enum и array остаются
видимыми Field-протонами и одновременно являются основаниями Fuzzy/Macho.
В ядре Runtime Universe также материализуется существующая DSL-ветвь
`zavx0z/linux → zavx0z/codex`, поэтому Codex присутствует в Capsule как реальная
вложенная сущность, а не как декоративная метка.

Геометрия рукавов в этой версии детерминирована графом, но не выдаётся за
окончательную Hopf/Möbius-формализацию: её математический закон остаётся отдельной
задачей модели мира.

Проверить тот же запуск и завершиться после одного полного цикла:

```bash
bun run runtime:universe:once
```

По умолчанию используется свежая временная Boundary database. Для явно заданного
постоянного пути:

```bash
BOUNDARY_PATH=boundary/tmp/world.sqlite \
METAFOR_RUNTIME_RESET=1 \
bun run runtime:universe
```

`METAFOR_RUNTIME_RESET=1` удаляет предыдущую database перед запуском. Без этого
флага явно заданный `BOUNDARY_PATH` сохраняется.

## Низкоуровневый запуск доменов

Только поднять core-домены без автоматической загрузки Meta:

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

`runtime:gpu` является строгим режимом и завершается ошибкой без WebGPU. Default
`auto` предпочитает WebGPU и использует CPU только как fallback.

## Проверка

```bash
bun run test:runtime-universe
bun test
bun run tsc --noEmit
```

GitHub Actions разделяет CPU reference/typecheck и строгую WebGPU/Vulkan parity.

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
