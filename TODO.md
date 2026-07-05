# MetaFor TODO

Рабочий план для текущей разработки. HUD ToDoPane читает этот файл и показывает
только ближайшие незакрытые задачи.

## 1. Process Protocol / Energy

- [ ] Научить `Energy` исполнять process action по `env`/`mass` без чтения `Boundary`.
- [ ] Провести аудит `z` / `w+` / `w-` / `applyWeakResultPacket` / `collectWeakResultPackets`.
- [ ] Убрать `/field/...` из протокола результатов процесса.
- [ ] Перевести результат процесса на `path = actor ID`, `processId`, `value.fields[fieldId]`.
- [ ] Добавить тесты успешного завершения, ошибки, блокировки, разблокировки и набора записываемых результатов.

## 2. Dark / Bulk Browser Shell

- [100] Проверить live server-dev запуск `dark/index.ts` как основной target с Matrix pipeline внутри процесса.
- [100] Систематизировать общий UI слой `Space` / `Display` / `HUD` / `Window` для Interpreter и Bulk.
  - [100] Зафиксировать общий `HudWindow` как frame + title bar + content slot, чтобы окна не собирались вручную в каждом месте.
  - [100] Перевести стандартные HUD panes на общий `HudWindow`, сохранив их локальную доменную логику внутри pane.
  - [100] Перевести Bulk Settings на общий `HudWindow` без локальной параллельной геометрии окна.
  - [100] Выровнять Bulk HUD surface ordering/focus под модель `UiRuntime` с `windowId`, active window и локальным `zIndex` внутри окна.
  - [100] Проверить, что `Bulk` не превращается в interpreter и не получает отдельный функциональный runtime слой.
  - [100] Проверить зависимости и barrel exports после стандартизации.
  - [100] Запустить typecheck/test для затронутых UI/Bulk/interpreter пакетов.
  - [100] Перезагрузить нужный live-контур через interpreter API и проверить визуально скриншотом.
- [100] Исправить Bulk Settings: восстановление свернутого/развернутого состояния и scroll после reload.
  - [100] Проверить, где сейчас хранится collapsed/expanded состояние Settings.
  - [100] Проверить, почему Settings body не получает scroll.
  - [100] Добавить минимальное сохранение состояния без отдельного runtime слоя.
  - [100] Проверить в удаленном браузере скриншотом.
- [100] Убрать дублирующее управление движением космоса из Bulk Settings.
- [.50] Связать Matrix photons и Bulk visual update в основном browser shell без чтения Boundary из Matrix/Bulk.
- [100] Собрать сквозную проверку `Dark -> Boundary -> Matrix -> Bulk browser shell`.

## 3. Topology Runtime

- [ ] Спроектировать миграцию `enum -> Fuzzy`.
- [ ] Спроектировать миграцию `array -> MACHO`.
- [ ] Убрать переходную трактовку `enum`/`array` как ordinary field types в runtime topology.

## 4. Source / Entanglement

- [ ] Решить, хватает ли общего `actor_value.value` для source/entanglement.
- [ ] Если нет, добавить `actor_value_source` или equivalent runtime source projection.

## 5. Документация DSL

- [ ] Привести раздел `Reactions` к реальному API.
- [ ] Уточнить структуру process action.
