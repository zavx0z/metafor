# MetaFor Plan

Рабочий план текущей реализации. Здесь находятся только ближайшие причинно
зависимые задачи ядра. Исторические interpreter, Voice и Browser Agent задачи
сохраняются в Git и будут перенесены в repositories, которые ими владеют.

Канонический подробный маршрут:

- `zavx0z/concept/core/LAUNCH_PLAN.md`;
- `zavx0z/concept/core/REPOSITORY_SPLIT_PLAN.md`.

## 1. Каноническое основание и наблюдаемость

- [100] Слить каноническое ядро, математическую модель и миссию MetaFor в `zavx0z/concept/main`.
- [100] Зафиксировать WebGPU Matrix, CPU fallback, границу interpreter и план разделения monorepo.
- [100] Создать `archive/pre-core-split-2026-07-11` до удаления peripheral packages.
- [100] Добавить structured Force/server Impulse logs.
- [100] Добавить core-only команды `runtime`, `runtime:logs`, `runtime:cpu`, `runtime:gpu`.

## 2. Matrix: фактическая проверка восстановления

- [100] Удалить `MatrixProjectionStore` и отдельный TypeScript evaluator; вернуть единственный `gravity → strong → weak` runtime.
- [100] Восстановить производный Boundary bootstrap `runtime/matrix` без чтения SQLite из Matrix.
- [100] Сделать WebGPU automatic primary backend, CPU — fallback/reference.
- [100] Запустить `bun test boundary/runtime/matrix.spec.ts matrix/matrix.spec.ts matrix/weak/device.spec.ts`.
- [100] Проверить все CPU/GPU Weak suites и `bun run tsc --noEmit` в раздельных CI jobs.
- [ ] Запустить `bun run runtime:cpu`, проверить полный Photon/Z/W trace в логах.
- [ ] Запустить `bun run runtime:gpu` на целевом hardware WebGPU adapter и сохранить adapter/trace.
- [100] Добавить один общий CPU/GPU parity fixture для State, lock, frozen fields и Photon sequence.
- [100] Исправить фактически обнаруженные failures: 52-bit field identity overflow, stale lockfile и смешение CPU/GPU test environments; не возвращать второй Matrix runtime.

## 3. Минимальный universe без Bulk

- [ ] Добавить нейтральную Meta: `input=0 → ready when input=1 → Process → output=2 → complete`.
- [ ] Провести её через Dark, Boundary, Matrix и Energy только по Force.
- [ ] Зафиксировать в logs: Inflaton, Matrix bootstrap, Gluon, Photon, Z, W result.
- [ ] Добавить end-to-end test без interpreter, browser shell и Bulk.

## 4. Canonical W result и Reaction

- [ ] Определить одну атомарную операцию `W result → Boundary/world commit`.
- [ ] Валидировать declared write set до commit.
- [ ] Выпускать derived Gluon/Higgs только после canonical commit.
- [ ] Разблокировать и повторно вычислять affected Matrix branes.
- [ ] Провести Reaction через тот же canonical world transaction path.
- [ ] Запретить Matrix и Energy закреплять W result как отдельную durable truth.

## 5. Bulk и reusable UI

- [ ] Подключить local canonical consequences к Bulk без чтения Boundary store.
- [ ] Сохранить Bulk WebGPU runtime в корневом MetaFor repository.
- [ ] Выделить reusable UI components из interpreter shell.
- [ ] Подключить UI как наблюдатель runtime, не владеющий domain state.

## 6. Разделение monorepo

- [ ] Создать implementation manifest: каждый workspace, imports, scripts, assets, target owner.
- [ ] Отвязать root install/test/build от interpreter и product shells.
- [ ] Перенести `pkg/voice` с Git history в `zavx0z/voice-engine`.
- [ ] Определить владельца interpreter product shell и перенести его после extraction reusable UI.
- [ ] Определить владельца `pkg/browser-agent` после dependency audit: Capsule, AI либо отдельный repository.
- [ ] Извлечь Android в отдельный integration/application repository.
- [ ] Перенести PTY/Tauri вместе с владеющим desktop shell.
- [ ] Удалять source packages из `metafor/main` только после зелёной target-сборки и migration map.
- [ ] Оставить в root: MetaFor package, DSL/Matter/template, Force, Dark, Boundary, Matrix, Energy, Bulk, WebGPU и reusable UI.

## 7. Capsule и первый Experience агента

- [ ] Подключить Capsule сначала как read-only declared adapter.
- [ ] Представлять frame/video как artifact/reference, не Force payload.
- [ ] Добавить одну обратимую bounded capability через MetaFor Process.
- [ ] Зафиксировать prediction до действия, actual result, divergence и consequence cost.
- [ ] Построить первую counterfactual branch.
- [ ] Сохранить принятый вывод как patch понимания, а не автоматическое знание агента.
