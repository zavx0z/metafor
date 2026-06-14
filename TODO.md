# MetaFor TODO

Рабочий план для текущей разработки. HUD ToDoPane читает этот файл и позволяет отметить пункты, которые должны попадать в текущий контекст агента.

## 1. Единая истина по Boundary

- [x] Привести активные документы к текущей схеме `boundary.wimp`, `boundary.actor`, `boundary.topology`.
- [x] Удалить устаревшие audit/plan документы со старым `store/db`, DB-sync и браузерным зеркалом.
- [x] Убрать противоречие `store.meta` vs `boundary.wimp` в активных планах и README.
- [ ] Обновить TypeDoc/JSDoc там, где публичные типы все еще описывают `DbData`, `DbBackend` или старые render rows.

## 2. Рантайм-Вертикаль Dark/Boundary -> Energy/Bulk

- [ ] Зафиксировать в коде и docs: `Dark` имеет доступ к `Boundary`; `Energy` и `Bulk` не имеют доступа к `Boundary`/SQLite.
- [ ] Вынести типы/API строк рендера Bulk из `@boundary/actor` в рендер-проекцию Bulk.
- [ ] Перевести запуск/рантайм `Energy` с `DbBackend` на самодостаточные рантайм-данные.
- [ ] Перевести resolver `app/web/runtime/bulk.process.ts` с `DbBackend` на путь рантайм-данных/проекции.
- [ ] Собрать вертикальную сквозную проверку: Dark пишет Boundary, Energy получает рантайм-данные, Bulk получает проекцию, процесс выполняет переход без DB sync.

## 3. Происхождение Boundary

- [ ] Решить, хватает ли `actor_value.value` как канонической связи значения.
- [ ] Если нет, добавить `actor_value_source` для направления, происхождения, корневой source-цепочки и различий manual/direct.
- [ ] Зафиксировать это решение в `STORE_UNIFICATION_PLAN.md` до адаптера рантайм-данных/проекции.

## 4. Равенство Браузера И Рантайма

- [ ] После SQLite-first Boundary определить browser/runtime API без возвращения старого `store/db/browser`.
- [ ] Проверить, что IDB не используется как временная рантайм-реплика для `Energy`/`Bulk`.
- [ ] Обновить `app/web/client.ts` после появления нового browser-facing API хранилища/проекции.

## 5. Чистка Force

- [x] Удалить устаревший `task/issues-audit.md`; рантайм-транспорт Force перенесён в `boundary/force`.
- [x] Решить судьбу `channel`, `source`, `boson` в Force-конверте.
- [x] Перевести рантайм Force на один `METAFOR_FORCE_CHANNEL` и `part` внутри каждого `Particle`.
- [ ] Довести W/+Z/-Z bridge: Boundary-side Z arbitration и сквозной сценарий.

## 6. TODO HUD Интерпретатора

- [x] Загружать `TODO.md` в отдельную HUD-панель.
- [x] Использовать markdown checkbox `- [ ]` / `- [x]` как данные файла TODO.
- [x] Подсвечивать пункты как состояние HUD-панели для попадания в `/context.hud.todo.highlightedItems`.
- [x] Не смешивать состояние todo с рантайм-состоянием процесса: todo находится в `hud.todo`.
- [x] Убрать устаревший `source.open` кейс со старым shared force bare specifier: общий force package удалён, Force теперь `boundary/force`.
- [x] После удаления файлов или директорий через apply_patch обновлять файловую панель интерпретатора без ручной перезагрузки.
- [ ] Доработать TerminalPane autoscroll/scrollback: когда пользователь скроллит вверх, а в терминал продолжают поступать новые данные, текст не должен перекрываться или визуально разваливаться; видовая область должна оставаться на месте, а автоскролл должен включаться только после возврата в самый низ и без просадки производительности.

## 7. FileListPane / Файловая Панель

- [x] [selection][intellij] Сделать row-wide подсветку производной только от `selectedIds`: `activeId` хранит lead/anchor для клавиатуры и открытия, но сам по себе не рисует selected-like фон.
- [x] [selection][initial] Привести начальное состояние к IntelliJ-модели: если дерево должно выбрать первую видимую строку после пустого restore/ensure, эта строка должна явно попасть в `selectedIds`, а не подсвечиваться скрытым `activeId`.
- [x] [selection][empty-state] Исправить `clearSelection()`, `setItems()` и `#syncActiveToVisibleRows()`: пустой selection не должен визуально выглядеть как выбранная верхняя папка; repair selection выполнять только в явных state transitions.
- [x] [focus][theme] Развести focused/inactive selection style как в IntelliJ: выбранная строка остается видимой без фокуса, но получает inactive fill/foreground; hover рисуется только на незавыбранной строке.
- [x] [keyboard][lead] Синхронизировать клавиатурную навигацию с selection: ArrowUp/ArrowDown/Home/End меняют настоящий `selectedIds`, а `activeId` следует за выбранной строкой без отдельной визуальной подсветки.
- [x] [source-sync][reveal] Развести ручное `revealCurrentWorkspaceFile` и автосинхронизацию с открытым source: `revealWorkspaceSource()` не должен включать скрытый аналог IntelliJ Always Select Opened File без явной настройки или команды.
- [x] [selection][multi-context] Включить множественное выделение файлов рабочей области через `Shift` и `Cmd/Ctrl` и публиковать выбранные файлы в `/context.workspaceFiles` для агента.
- [x] [tests][regression] Добавить регрессии для FileListPane и файлов рабочей области интерпретатора: пустой selection без active-фона, явный initial select-first, focused/inactive selected style, keyboard selection, manual reveal/autosync и сохранение `selectedIds`.
