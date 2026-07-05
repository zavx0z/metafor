# MetaFor Plan

Рабочий план для текущей разработки. HUD Plan читает этот файл и показывает
только ближайшие незакрытые задачи.

## 1. Process Protocol / Energy

После первого Weak/Energy v0 прохода осталось:

- [x] Перенести process catalog в Energy runtime и заменить Matrix process marker на boolean.
- [ ] Подключить реальный process descriptor, `wrapperSrc`, dynamic import, env resolver и DSL process action execution.
- [ ] Добавить success/error handlers поверх текущих `w+` / `w-`.
- [ ] Удалить legacy result adapter на top-level `wimpId` / `processId` и `/field/...`, когда старые потребители будут мигрированы.
- [ ] Расширить Energy tests на реальный action runtime без чтения `Boundary`/SQLite.

## 2. Dark / Bulk Browser Shell

- [.50] Связать Matrix photons и Bulk visual update в основном browser shell без чтения Boundary из Matrix/Bulk.

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
