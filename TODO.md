# MetaFor TODO

Рабочий план для текущей разработки. HUD ToDoPane читает этот файл и позволяет отметить пункты, которые должны попадать в текущий контекст агента.

## 1. Единая истина по store

- [ ] Привести активные документы к текущей схеме `store.wimp`, `store.actor`, `store.topology`.
- [ ] Явно пометить исторические документы, где еще описан старый `store/db`.
- [ ] Убрать противоречие `store.meta` vs `store.wimp` в планах и README.
- [ ] Обновить TypeDoc/JSDoc там, где публичные типы все еще описывают `DbData`, `DbBackend` или старые render rows.

## 2. Runtime вертикаль Dark -> Boundary -> Bulk

- [ ] Вынести Bulk render row types/API из `@store/actor` в Bulk/render projection.
- [ ] Сделать read-only Boundary adapter из `store.wimp + store.actor + store.topology` в Boundary runtime data.
- [ ] Перевести `app/web/runtime/dark.worker.ts` на текущий `store/server.open()` путь.
- [ ] Перевести `app/web/runtime/boundary.worker.ts` с `store/db` на новый Boundary adapter.
- [ ] Перевести `app/web/runtime/bulk.process.ts` resolver с `DbBackend` на новый store/projection path.
- [ ] Собрать вертикальный smoke: Dark пишет store, Boundary читает fragment, Bulk получает projection, process выполняет переход.

## 3. Store provenance

- [ ] Решить, хватает ли `actor_value.value` как канонической связи значения.
- [ ] Если нет, добавить `actor_value_source` для direction, provenance, root source chain и manual/direct различий.
- [ ] Зафиксировать это решение в `STORE_UNIFICATION_PLAN.md` до реализации Boundary adapter.

## 4. Browser/IDB parity

- [ ] После SQLite-first вертикали определить browser store API без возвращения старого `store/db/browser`.
- [ ] Проверить, что IDB не является snapshot cache, а повторяет публичный store contract.
- [ ] Обновить `app/web/client.ts` после появления нового browser-facing store/projection API.

## 5. Protocol cleanup

- [x] Сверить `task/issues-audit.md` с текущим корневым `protocol.ts`.
- [x] Решить судьбу `channel`, `source`, `boson` в protocol envelope.
- [x] Перевести runtime protocol на один `METAFOR_BROADCAST_CHANNEL` и `part` внутри каждого patch.
- [ ] Довести W/+Z/-Z bridge: Boundary-side Z arbitration и smoke-сценарий.

## 6. Interpreter TODO HUD

- [x] Загружать `TODO.md` в отдельную HUD-панель.
- [x] Использовать markdown checkbox `- [ ]` / `- [x]` как данные файла TODO.
- [x] Подсвечивать пункты как состояние HUD-панели для попадания в `/context.hud.todo.highlightedItems`.
- [x] Не смешивать todo state с process runtime state: todo находится в `hud.todo`.
- [x] Убрать устаревший `source.open` кейс со старым shared protocol bare specifier: shared protocol package удалён, protocol теперь корневой `protocol.ts`.
- [x] После удаления файлов или директорий через apply_patch обновлять файловую панель интерпретатора без ручной перезагрузки.
