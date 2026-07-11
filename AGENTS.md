# Канонические инструкции агентам `zavx0z/metafor`

Статус: **обязательные правила текущей реализации**.  
Дата последнего прямого решения автора: **2026-07-11**.

Этот файл имеет приоритет над конфликтующими старыми указаниями в `AGENT.md`,
`AGENT_MEMORY.md`, package-local документации, старых PR и историческом коде.

Полное концептуальное ядро находится в `zavx0z/concept`:

1. `CORE.md`
2. `core/FORMAL_MODEL.md`
3. `core/MISSION.md`
4. `core/RUNTIME_INVARIANTS.md`
5. `core/LAUNCH_PLAN.md`
6. `core/REPOSITORY_SPLIT_PLAN.md`

## 1. Текущая точка

MetaFor — эволюционирующий порождающий бесконечно-конечный автомат. Каждая
актуальная materialization конечна; Matter рекурсивно порождает новые автоматы;
Inflaton меняет правила дальнейшей materialization.

Ближайшая инженерная задача — не расширять interpreter и не строить новую
прослойку Matrix, а запустить минимальный наблюдаемый core lifecycle.

## 2. Единственный Matrix runtime

Production Matrix имеет один вычислительный pipeline:

```text
gravity → strong → weak
```

Обязательные инварианты:

- WebGPU-backed Weak — основной параллельный backend;
- CPU — fallback и reference backend для parity tests;
- default backend policy — `auto`: WebGPU при наличии, иначе CPU;
- `gpu` — строгий режим; отсутствие WebGPU является ошибкой;
- `cpu` — явный fallback/debug режим;
- GPU и CPU должны давать одинаковые State/lock/Photon traces.

Запрещено:

- возвращать `MatrixProjectionStore`;
- создавать отдельные Actor/Field maps, которые сами вычисляют State;
- вычислять conditions/transitions вторым TypeScript evaluator;
- публиковать Photon в обход Weak;
- считать CPU отдельной семантической реализацией Matrix;
- держать вторую durable truth рядом с Boundary.

Boundary может передать Matrix **производный target-specific packed bootstrap**.
Он не является вторым миром: snapshot полностью перестраивается из canonical
Boundary и нужен только для инициализации `gravity/strong/weak`. После boot
обычные Gluon/Higgs/Z/W идут напрямую через packed runtime.

## 3. Boundary и Force

- Boundary — canonical materialized persistence.
- Dark передаёт declaration как Inflaton через Force.
- Matrix, Energy и Bulk не читают Boundary SQLite напрямую.
- Один ForceMessage содержит одну минимальную Particle.
- Изменения мира коммитятся в Boundary, затем локальные consequences идут через
  Force.
- Производный Matrix bootstrap адресуется `runtime/matrix` и не считается
  canonical history или operational world snapshot.

Не путай запрет на второй canonical full snapshot с разрешённой производной
проекцией для вычислительного backend. Критерий: её можно удалить и полностью
восстановить из Boundary без потери мира или identity.

## 4. Наблюдаемость и первый milestone

Первый полный запуск допускается без Bulk и UI:

```text
Meta/DSL
→ Dark/Inflaton
→ Boundary
→ Matrix WebGPU (CPU fallback)
→ Photon
→ Energy
→ W result
→ structured server logs
```

Используй:

```text
bun run runtime
bun run runtime:logs
bun run runtime:cpu
bun run runtime:gpu
```

Логи должны показывать фактические send/receive Impulse. Они являются временной
наблюдаемостью, но не нативной Летописью.

## 5. Interpreter больше не development center

Interpreter был экспериментальной средой для проверки lifecycle, UI-компонентов
и способов взаимодействия. Он сохраняется как исторический прототип и источник
reusable UI, но больше не определяет способ разработки ядра.

Текущий workflow:

- локальное приложение Codex;
- обычные Git branches/PR;
- прямое чтение и изменение repository files;
- terminal commands и tests;
- structured runtime logs.

Не требуй `POST /tools`, `source.apply_patch`, server interpreter, remote desktop
или активный `processId` для обычной разработки core. Эти маршруты применимы
только к отдельному interpreter-приложению, когда работа над ним явно выбрана.

## 6. Граница корневого репозитория

В `zavx0z/metafor` должны остаться:

- root public package MetaFor;
- DSL, Matter, declarations и template/create tooling;
- shared protocol/types, необходимые ядру;
- Force;
- Dark;
- Boundary;
- Matrix, включая WebGPU и CPU fallback;
- Energy;
- Bulk, включая его WebGPU manifestation runtime;
- reusable UI components;
- neutral fixtures/tests/tools.

На extraction:

- `pkg/interpreter` product shell;
- `pkg/voice` → `zavx0z/voice-engine`;
- Android;
- browser-agent application shell;
- PTY/Tauri/desktop shell;
- provider-specific и product-specific integrations.

До удаления обязательны archive branch/tag, dependency manifest, target
repository, сохранение Git history, зелёный target build и migration map.

Archive point уже создан:

```text
archive/pre-core-split-2026-07-11
```

Не выполняй массовое удаление и Matrix restoration в одном PR.

## 7. Порядок ближайших изменений

1. structured Force/server logs;
2. восстановить packed Matrix bootstrap;
3. удалить второй projection/evaluator;
4. WebGPU auto-primary и CPU fallback;
5. GPU/CPU parity tests;
6. minimal universe без Bulk;
7. canonical `W result → Boundary world update`;
8. Reaction consequences;
9. Bulk manifestation;
10. phased repository extraction;
11. Capsule и первый bounded agent Experience.

## 8. Работа со старым кодом и PR

- Старый commit — свидетельство стадии, а не автоматическая истина.
- Для Matrix semantic reference используется рабочий packed runtime до появления
  projection layer, но запрещён широкий rollback всего repository.
- Закрытый PR `#79` архитектурно superseded и не должен быть merged целиком.
- Полезные изменения из старых веток переносятся только по одному после проверки
  текущих инвариантов.

## 9. Проверка изменений

Минимум для Matrix PR:

```text
bun test boundary/runtime/matrix.spec.ts matrix/matrix.spec.ts
bun test matrix/weak
bun run runtime:cpu
bun run runtime:gpu  # в WebGPU-capable среде
```

Затем сравни traces CPU и GPU. Отсутствие доступного GPU нужно зафиксировать
честно; нельзя объявлять GPU path проверенным только по компиляции.

Каждый существенный PR должен указать:

- baseline commit;
- ожидаемый причинный переход;
- фактический результат;
- tests/environment;
- первый оставшийся gap;
- изменение canonical concept, если смысл действительно изменился.

## 10. Нельзя додумывать

Не угадывай:

- окончательный owner canonical W result;
- полную семантику Dark Matter и Dark WIMP;
- финальную relation Brane/Actor;
- intervention semantics;
- достаточные условия цифрового сознания;
- конечный repository для Android, browser-agent и interpreter shell без
  dependency audit и решения автора.

Отмечай точный open gap и продолжай всё, что от него не зависит.
