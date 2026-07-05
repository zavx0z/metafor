# MetaFor TODO

Рабочий план для текущей разработки. HUD ToDoPane читает этот файл и показывает
только ближайшие незакрытые задачи.

## 0. Interpreter HUD

- [100] Стандартизировать HUD window title bars: слева свернуть/actions, центр title/subtitle, справа actions.

## 1. Process Protocol / Energy

- [ ] Научить `Energy` исполнять process action по `env`/`mass` без чтения `Boundary`.
- [ ] Провести аудит `z` / `w+` / `w-` / `applyWeakResultPacket` / `collectWeakResultPackets`.
- [ ] Убрать `/field/...` из протокола результатов процесса.
- [ ] Перевести результат процесса на `path = actor ID`, `processId`, `value.fields[fieldId]`.
- [ ] Добавить тесты успешного завершения, ошибки, блокировки, разблокировки и набора записываемых результатов.

## 2. Dark / Bulk Browser Shell

- [100] Проверить live server-dev запуск `dark/index.ts` как основной target с Matrix pipeline внутри процесса.
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
