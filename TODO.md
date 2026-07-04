# MetaFor TODO

Рабочий план для текущей разработки. HUD ToDoPane читает этот файл и показывает
только ближайшие незакрытые задачи.

## 1. Process Protocol / Energy

- [ ] Подключить `Energy` к `process-task`, который Matrix публикует в общий Force-канал.
- [ ] Научить `Energy` исполнять process action по `env`/`mass` без чтения `Boundary`.
- [ ] Провести аудит `z` / `w+` / `w-` / `applyWeakResultPacket` / `collectWeakResultPackets`.
- [ ] Убрать `/field/...` из протокола результатов процесса.
- [ ] Перевести результат процесса на `path = actor ID`, `processId`, `value.fields[fieldId]`.
- [ ] Добавить тесты успешного завершения, ошибки, блокировки, разблокировки и набора записываемых результатов.

## 2. Matrix / AppWeb Orchestration

- [ ] Проверить live server-dev запуск `dark/index.ts` как основной target с Matrix pipeline внутри процесса.
- [ ] Закрепить `start:dark` / `restart:dark` / `stop:dark` и `start:energy` / `restart:energy` / `stop:energy` в текущем server-dev runbook после live-проверки.
- [ ] Связать Matrix photons и Bulk visual update в основном AppWeb runtime без чтения Boundary из Matrix/Bulk.
- [ ] Собрать сквозную проверку `Dark -> Boundary -> Matrix -> Bulk -> AppWeb`.

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
