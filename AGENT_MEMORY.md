# Живая память текущего доведения MetaFor

Этот файл хранит только то понимание, которое должно менять следующие
инженерные решения. Полная концепция и её доказательная трасса находятся в
`zavx0z/concept`; обязательные правила этого repository — в `AGENTS.md`.

## 1. Текущая цель

MetaFor доводится как общая причинная цифровая среда человека и агента, а не как
обычный чат-бот, IDE-плагин, state manager или набор внешних инструментов.

Основной цикл:

```text
значения Fields
→ контекст
→ State
→ Transition
→ Process
→ новые значения
→ внешний результат
→ анализ
→ изменение текущей модели или Meta
```

Качество системы измеряется не только вероятностью ошибки, но и способностью
моделировать и уменьшать её реальную цену.

## 2. Каноническая архитектурная модель

MetaFor — бесконечно-конечный эволюционирующий порождающий автомат:

- каждая актуальная materialization конечна;
- materialized runtime детерминирован полной Meta, Boundary и входными Impulse;
- Matter рекурсивно порождает новые конечные автоматы;
- Inflaton способен менять States, relations и правила будущей materialization;
- полная система не сводится к классическому FSM с одним фиксированным конечным
  множеством будущих состояний.

## 3. Текущий причинный lifecycle

```text
DSL / Meta
→ Dark diff
→ Inflaton
→ Boundary commit/materialization
→ Matrix gravity/strong/weak
→ Photon
→ Energy claim/copy/execution
→ W+/W−
→ canonical world consequence
→ Reaction
→ Bulk manifestation
```

Boundary является canonical materialized persistence. Dark, Matrix, Energy и
Bulk не должны создавать параллельные durable truth.

Один `ForceMessage` содержит одну минимальную `Particle`. Force переносит
причинные изменения между доменами и не владеет предметной семантикой.

## 4. Исправленный Matrix

Последняя incremental projection переделка была ошибочной. Она добавила второй
runtime:

```text
MatrixProjectionStore
→ Map-based Actor/Field projection
→ TypeScript condition evaluator
→ отдельное решение State
→ Photon
```

Этот слой удаляется и не должен возвращаться.

Единственный production Matrix runtime:

```text
gravity → strong → weak
```

- WebGPU — основной параллельный backend;
- CPU — fallback и reference для parity tests;
- default — `auto`, то есть WebGPU при наличии, иначе CPU;
- GPU и CPU обязаны иметь одинаковую семантику переходов.

Boundary передаёт Matrix производный packed bootstrap `runtime/matrix`. Это не
второй мир и не canonical snapshot: проекция полностью восстанавливается из
Boundary и может быть отброшена без потери identity или истории.

После boot обычные Gluon/Higgs/Z/W обрабатываются напрямую packed Weak.

## 5. Текущая реализационная точка

Уже выполнено:

- сохранено каноническое ядро в `zavx0z/concept/main`;
- закрыт без merge ошибочный PR `#79`;
- создана архивная ветка `archive/pre-core-split-2026-07-11`;
- добавлены structured Force impulse logs;
- добавлены core runtime команды без interpreter и Bulk;
- восстанавливается Boundary packed bootstrap и WebGPU-primary Matrix.

Первый milestone может завершаться логами, без Bulk/UI:

```text
Meta
→ Dark
→ Boundary
→ Matrix
→ Photon
→ Energy
→ W result
→ structured logs
```

Следующий незакрытый архитектурный контракт после Matrix:

```text
W result
→ canonical Boundary/world commit
→ derived Gluon/Higgs
→ unlock/re-evaluate
→ Reaction
```

Нельзя закреплять W result только внутри Matrix как окончательную world truth.

## 6. Interpreter и workflow разработки

Interpreter был важным прототипом:

- проверял lifecycle;
- помогал разрабатывать UI;
- объединял временные tools;
- показывал возможную общую среду.

Но он больше не является development center и не определяет core architecture.

Текущий workflow:

- локальное приложение Codex;
- Git branches/PR;
- terminal commands;
- прямые repository files;
- tests;
- structured runtime logs.

Interpreter API, remote desktop и `POST /tools` применяются только к отдельной
задаче interpreter-приложения, а не как обязательный способ правки core.

## 7. Граница `zavx0z/metafor`

В корневом repository остаются:

- root package;
- DSL, Matter, template/create tooling;
- Force, Dark, Boundary, Matrix, Energy, Bulk;
- Matrix WebGPU и CPU fallback;
- Bulk WebGPU;
- reusable UI;
- neutral fixtures/tests/tools.

Должны быть извлечены с сохранением истории:

- Voice → `zavx0z/voice-engine`;
- interpreter product shell;
- Android;
- browser-agent shell;
- PTY/Tauri/desktop shell;
- product/provider-specific integrations.

Сначала archive point, dependency manifest, target repository и рабочая копия;
только потом удаление из root.

## 8. Интуиция и эволюционный опыт

Интуиция строится не из архива готовых ответов, а из трассы:

```text
модель
→ прогноз до действия
→ действие
→ фактический результат
→ цена последствий
→ причинный анализ
→ контрфактическая ветвь
→ проверенное изменение понимания
→ новая Meta при достаточном основании
```

Внутренняя согласованность не является достаточной проверкой. Нужны внешняя
реальность, человеческая оценка, tools и воспроизводимые tests.

## 9. Что будущий агент обязан помнить

1. Не возвращать `MatrixProjectionStore` и второй evaluator.
2. Не делать CPU основной Matrix architecture.
3. Не путать производный packed bootstrap с второй canonical world snapshot.
4. Не развивать core через обязательный interpreter workflow.
5. Не удалять peripheral packages до сохранения истории и working target.
6. Не считать старый код или ответ агента высшей истиной.
7. Не угадывать owner W result, Dark Matter/Dark WIMP и другие open contracts.
8. Новое подтверждённое понимание обновляет canonical files, а не создаёт ещё
   один параллельный итоговый документ.
