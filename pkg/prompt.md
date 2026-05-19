# MetaFor: аккуратная ревизия UI и выделение editor-слоя

Ты работаешь в репозитории `zavx0z/metafor`, ветка `arch`.

Важно: не переписывать debug-пакет и не ломать рабочий Bun inspector sidecar.

Сейчас в проекте уже есть:

- `pkg/debug` — рабочий sidecar для Bun WebKit Inspector;
- `pkg/debug/web/main.ts` — текущий debug UI;
- `pkg/debug/web/source-card.ts` — карточка отображения source с текущей строкой исполнения;
- `ui/components/src/editor-card.ts` — редактируемая карточка редактора;
- `ui/elements` — псевдо-HTML/CSS низкий WebGPU UI слой;
- `ui/components` — MUI-like компоненты поверх элементов;
- `@metafor/components` экспортирует `EditorCard`.

Нужно сделать не “новый интерпретатор”, а первый аккуратный архитектурный шаг:
привести UI/editor-слой в порядок и подготовить основу для будущего интерпретатора.

## Главная цель

Сдвинуть текущую архитектуру от разрозненных `SourceCard` / `EditorCard` к нормальному editor-слою, который можно будет использовать в debug UI и будущей interpreter-среде.

При этом:

- не ломать `pkg/debug/src/*`;
- не менять логику inspector/debug/runtime;
- не ломать REST API;
- не ломать WebSocket `/ws`;
- не ломать текущий запуск `bun run dark/debug/agent-attach.ts`;
- не ломать текущий debug UI полностью;
- двигаться маленькими безопасными шагами.

## Что нужно сначала изучить

Перед изменениями посмотри:

- `pkg/debug/web/main.ts`
- `pkg/debug/web/source-card.ts`
- `pkg/debug/web/debug-ui.ts`
- `pkg/debug/web/console-card.ts`
- `ui/components/src/editor-card.ts`
- `ui/elements/src/card.ts`
- `ui/components/src/Button.ts`
- `ui/components/src/Badge.ts`
- `ui/components/src/TextField.ts`
- `ui/elements/src/theme.ts`
- `ui/elements/src/index.ts`
- `ui/elements/src/virtual-input.ts`
- `ui/components/src/scroll-list.ts`
- `ui/elements/src/flex.ts`
- `ui/elements/src/flexCss.ts`

Нужно понять, какие части уже переиспользуемые, а какие сейчас завязаны только на debug UI.

## Задача 1. Ревизия текущего UI

Сначала кратко опиши в отчёте:

1. Где сейчас находится отображение source.
2. Где сейчас находится редактируемый editor.
3. Что общего между `SourceCard` и `EditorCard`.
4. Что дублируется.
5. Что можно вынести в общий слой.
6. Что нельзя трогать, чтобы не сломать debug UI.

Отчёт положить в новый markdown-файл, например:

```text
ui/components/docs/editor-layer.md
````

или, если в проекте логичнее другое место, выбери аккуратно.

## Задача 2. Привести визуальный UI в порядок

Текущий debug UI нужно немного освежить, без полного редизайна.

Цель:

* кнопки сделать более аккуратными;
* использовать rounded corners;
* привести badges/buttons/input к единому стилю;
* сделать визуал ближе к текущему качеству `@metafor/elements` + `@metafor/components`;
* улучшить читаемость toolbar / welcome / scopes / console;
* не менять поведение команд.

Важно:

* не делать тяжёлый redesign;
* не добавлять лишние зависимости;
* не ломать layout;
* не менять смысл кнопок;
* не менять protocol между UI и server.

Посмотреть текущие component renderers в `ui/components/src/internal/renderers.ts`.
Если нужно — аккуратно улучшить именно базовые renderers, чтобы весь UI стал лучше, а не править каждую кнопку вручную.

## Задача 3. Подготовить editor package/layer

Сейчас `EditorCard` лежит в `ui/components/src/editor-card.ts`.
Нужно аккуратно подготовить editor-слой.

Не обязательно сразу создавать отдельный workspace package, если это приведёт к большим изменениям.
Можно начать с внутренней структуры внутри `ui/components/src/editor/`.

Предпочтительный безопасный путь:

```text
ui/components/src/editor/
  editor-card.ts
  source-view-card.ts или source-card-base.ts
  tokens.ts
  highlighter.ts
  languages/
    typescript.ts
    plaintext.ts
```

Но если перенос файла создаёт слишком много каскадных правок — сначала можно оставить совместимый re-export:

```ts
// ui/components/src/editor-card.ts
export * from "./editor/editor-card.ts"
```

Главное — не сломать публичный импорт:

```ts
import { EditorCard } from "@metafor/components"
```

## Задача 4. Разделить editor core и debug-specific source view

Сейчас есть две похожие вещи:

* `pkg/debug/web/source-card.ts` — показывает source на остановке;
* `ui/components/src/editor-card.ts` — редактирует текст.

Нужно аккуратно подумать и сделать первый шаг к общей базе:

* общие типы tokens вынести из конкретных карточек;
* подсветку не держать жёстко внутри debug source-card;
* editor/viewer должны использовать общий формат токенов;
* debug-specific состояние типа `paused/running/disconnected` можно оставить в debug SourceCard, если перенос будет опасен.

Не нужно насильно объединять всё в один компонент, если это ломает код.
Цель — уменьшить дублирование и подготовить общий editor слой.

## Задача 5. Подсветка как модуль

Нужно подготовить расширяемую подсветку под разные языки.

Не нужен тяжёлый plugin-framework.
Нужен простой модульный контракт.

Например:

```ts
export type EditorToken = {
  s: number
  e: number
  c: string
  bg?: string
}

export type EditorTokens = EditorToken[][]

export type LanguageHighlighter = {
  id: string
  name: string
  extensions?: string[]
  tokenize(lines: string[]): EditorTokens
}
```

Добавить минимум:

* plaintext highlighter;
* typescript/javascript highlighter, можно на базе уже существующей текущей логики;
* общий resolver по filename/path/language id.

Важно:

* не тащить тяжелые внешние зависимости;
* сохранить текущую подсветку, если она уже работает;
* не ухудшить SourceCard.

## Задача 6. Совместимость с debug UI

После изменений debug UI должен продолжать работать:

* стартуется `bun run dark/debug/agent-attach.ts`;
* web UI открывается на `http://127.0.0.1:6500/`;
* source отображается;
* текущая строка исполнения подсвечивается;
* frames/scopes/console работают;
* eval/step/resume/pause работают.

Если в этом этапе editor ещё не подключён к debug UI как редактирование файла — это нормально.
Главное сейчас — архитектурно подготовить editor слой.

## Задача 7. Проверки

Запустить доступные проверки:

```sh
bun run --filter @metafor/elements typecheck
bun run --filter @metafor/components typecheck
bun run --filter @metafor/bun-debug typecheck
bun test ui/elements/src
bun test ui/components/src
bun test pkg/debug
```

Если часть команд в репозитории не существует или падает по уже существующим причинам — зафиксировать это в отчёте, не скрывать.

## Что НЕ делать

Не делать сейчас:

* полноценный interpreter;
* patch/apply файлов;
* сохранение изменений в runtime;
* branch/alternative execution;
* базу данных;
* новые большие абстракции;
* новый протокол вместо текущего `/ws`;
* переписывание debug server;
* удаление `SourceCard`;
* удаление `EditorCard`;
* переименование всего debug-пакета.

## Ожидаемый результат

После задачи должно быть:

1. Документ с картой editor/UI слоя.
2. Более аккуратный визуальный debug UI.
3. Подготовленная структура editor-слоя.
4. Общий формат токенов подсветки.
5. Минимальный модуль подсветки plaintext/typescript.
6. Сохранённая работоспособность `@metafor/elements` и `@metafor/components`.
7. Сохранённая работоспособность `@metafor/bun-debug`.

## Главная мысль

Мы не ломаем debug.
Мы подготавливаем editor-слой, который потом станет частью interpreter-среды.

Сейчас задача не “сделать всё”.
Сейчас задача — привести UI/editor в порядок и создать аккуратный фундамент для следующего шага.
