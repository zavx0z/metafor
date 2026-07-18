# Текущий milestone: послойное чтение Meta

Этот файл задаёт порядок разработки, но не заменяет project documentation.

## Результат

Входной `inflaton/test <root-src>` проходит через endpoint Force только в Dark
и Bulk. Dark читает корневой Meta-пакет и достижимые WIMP-источники в ширину,
по слоям, немедленно испуская каждую готовую декларационную частицу.

```text
agent inflaton/test
  → Force
  → Dark
  → root declaration particles
  → next WIMP layer declarations
  → released Matter references
```

`inflaton/test` является только командой чтения. Dark не испускает его в конце
и не использует как commit, barrier или признак завершения.

## Закон испускания

- Meta остаётся внешним файлом и не становится Particle или сущностью
  Вселенной;
- WIMP, Fields, Variants, States, Transitions, Conditions, Processes,
  Reactions, Matter, Mass и Bulk испускаются по одному, как только локальные
  данные конкретной сущности уже прочитаны;
- Matter topology (`fuzzy`, `axion`, `macho`) и Matter-ссылка `kind: "wimp"`
  испускаются до начала чтения целевого дочернего WIMP;
- дочерние WIMP одного слоя читаются до WIMP следующего слоя;
- удаление недостижимых деклараций ждёт завершения обхода, потому что только
  тогда известна новая достижимость.

## Не вводить на этом этапе

- завершающий `inflaton/test`;
- batch всего достижимого графа перед первым испусканием;
- полный snapshot секции вместо отдельных Patch;
- постоянное временное хранилище готовых деклараций;
- trace envelope или causal metadata;
- отдельную команду commit/barrier.

## Автоматическое доказательство

- родительский Inflaton виден до завершения загрузки дочернего WIMP;
- порядок чтения `root → siblings → descendants`;
- topology и WIMP-ребро выходят до начала чтения дочернего WIMP;
- WIMP одного слоя читаются раньше их потомков следующего слоя;
- повторное чтение испускает только изменения;
- removals сохраняют порядок отсоединения;
- завершающего `inflaton/test` нет.

## Живая приёмка

```bash
bun .agents/skills/metafor-dev/scripts/metafor-dev.mjs run meta-read <src>
```

Для воспроизводимой приёмки Capsule без файлов в продуктовой площадке:

```bash
bun .agents/skills/metafor-dev/scripts/metafor-dev.mjs run meta-read capsule --fixture capsule
```

Owned-контур передаёт Dark внешний корень fixture непосредственно из skill.
Никакая runtime-копия не появляется в продуктовой площадке и hot-reload Dark не
запускается. Внутрь Вселенной Meta-файл не переносится.

После machine-checkpoint открыть Bulk в браузере Codex и подтвердить видимый
входной импульс, последовательные Dark Inflaton и итоговую проекцию.
