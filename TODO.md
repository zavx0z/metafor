# MetaFor TODO

Рабочий план для текущей разработки. HUD ToDoPane читает этот файл и показывает
только ближайшие незакрытые задачи.

## 1. Процессный Протокол

- [ ] Провести аудит `z` / `w+` / `w-` / `applyWeakResultPacket` / `collectWeakResultPackets`.
- [ ] Убрать `/field/...` из протокола результатов процесса.
- [ ] Перевести результат процесса на `path = actor ID`, `processId`, `value.fields[fieldId]`.
- [ ] Добавить тесты успешного завершения, ошибки, блокировки, разблокировки и набора записываемых результатов.

## 2. AppWeb / Energy Orchestration

- [ ] Подключить `BoundaryEnergyRuntimeSnapshot` к основному AppWeb bootstrap, если это ещё не сделано.
- [ ] Связать вход Force, шаг Energy и визуальное обновление Bulk без чтения Boundary из Energy/Bulk.
- [ ] Собрать сквозную проверку `Dark -> Boundary -> Energy -> Bulk -> AppWeb`.

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
- [ ] Исправить соглашение `Bulk: только <meta-for>` на `Matter`, если ещё актуально.
