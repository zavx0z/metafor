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

- [ ] Перенести `app/web/client.ts` в `bulk` и обновить `bulk/index.html`.
- [ ] Перенести `app/web/world.ts` в `bulk` как Boundary snapshot -> Bulk manifest adapter.
- [ ] Перенести `app/web/hud.ts` в `bulk` и убрать старое имя браузерной оболочки.
- [ ] Перенести `app/web/settings.ts` в `bulk` и убрать обратный импорт `bulk/web -> app/web/settings.ts`.
- [ ] Перенести `app/web/force-snapshot.ts` в `bulk` и обновить tests/imports.
- [ ] После переноса удалить оставшийся browser shell/package из `app/web`.
- [ ] Проверить live server-dev запуск `dark/index.ts` как основной target с Matrix pipeline внутри процесса.
- [ ] Связать Matrix photons и Bulk visual update в основном browser shell без чтения Boundary из Matrix/Bulk.
- [ ] Собрать сквозную проверку `Dark -> Boundary -> Matrix -> Bulk browser shell`.

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
