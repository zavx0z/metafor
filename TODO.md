# MetaFor TODO

Рабочий план для текущей разработки. HUD ToDoPane читает этот файл и позволяет отметить пункты, которые должны попадать в текущий контекст агента.

## Инфраструктура Web UI: remote desktop / browser-display

- [x] Зафиксировать текущий dev-контур Web UI: interpreter API/UI `10.66.0.10:6500`, app-web dev server `10.66.0.10:3004`, внешний `meta.proizvodstvo1.ru` через proxy/SSO; не путать с LAN-режимом `443` и не закладывать macOS-браузер как обязательный backend.
- [ ] Сделать минимальный Linux/Electron browser-host поверх `app/electron`: отдельный user-data-dir, управляемый URL, CDP/debug port, health endpoint, restart и явное состояние окна/страницы.
- [x] Проверить на сервере запуск browser-host в реальном графическом контуре: Wayland/Chrome/Mutter/PipeWire/EIS работает без Mac и без Playwright; Electron runtime пока не считать рабочим без успешного `/desktop/rtc/state`.
- [x] Реализовать fallback-захват кадра: `/remote-desktop/snapshot` через PipeWire snapshot и browser-host `/snapshot` через `webContents.capturePage()`; это только диагностика/fallback, не основной realtime-канал.
- [x] Добавить в интерпретатор first-class Space display `remote-desktop:server`, не HUD: frame stream/snapshot fallback, статус host и понятные ошибки запуска.
- [x] Прокинуть ввод из UI интерпретатора в remote desktop host: pointer move/down/up/click/doubleclick/wheel, keyboard text/keyDown/keyUp, модификаторы, focus и координатное преобразование display -> desktop.
- [x] Добавить агентский доступ к этому дисплею: `/remote-desktop/health`, `/remote-desktop/rtc/state`, `/remote-desktop/snapshot`, `/remote-desktop/input`, browser open/restart через безопасный локальный API.
- [x] Переключить видео с `pipewire-snapshot` polling на Electron WebRTC sender: Electron `desktopCapturer`/`getDisplayMedia` расшаривает серверный desktop в комнату `remote-desktop`, проверенный receiver получает `1920x1080` video track.
- [x] Поднять native Chromium audio track в Electron WebRTC sender: state показывает `audio.effectiveSource: "native-chromium"` и `audio.trackCount > 0`.
- [ ] Проверить и довести spatial audio playback в interpreter UI на стороне клиента, чтобы пользователь реально слышал remote desktop audio без рассинхрона.
- [ ] Довести direct input именно для текущего `Xwayland :98`, чтобы WebRTC data channel не проксировал управление в старый Mutter/EIS display `:0`.
- [ ] Подключить sourcemap/devtools workflow для app-web: открытие исходников TypeScript в browser DevTools, стабильные sourcemaps в dev-контуре и короткая диагностика, если browser-display показывает старый bundle.
- [ ] Аккуратно переиспользовать `production/vendor/ai-macos`: вынести переносимый CDP/shared слой, оставить macOS-specific AppleScript/CoreGraphics/screencapture в darwin-adapter, для Linux сначала делать CDP/Electron backend без широкого порта `window/screen/input`.
- [ ] Проверить совместную работу: пользователь видит remote desktop/browser-display из интерпретатора на другом экране/телефоне, агент видит тот же кадр, оба могут понимать состояние Web UI без использования ресурсов Mac.
- [ ] После proof-of-concept оформить docs/runbook: как стартовать, как перезапустить tmux/process, какие порты используются, как диагностировать пустой экран, stale frame, неверный DISPLAY и потерю ввода.

## 0. Full-screen Force: realtime-визуализация патчей

- [ ] Держать `higgs`/`gluon` force-патчи как realtime visual carrier-события: без записи в Boundary SQLite и без полного `world rows` rebuild.
- [ ] На `higgs replace value.fields` точечно обновлять существующие field-узлы текущего WIMP: label/key/type/schema, материалы и подписи только затронутых records.
- [ ] Для первого патча `full-screen` заменить визуальный field `Полный экран` на `Метод` и зафиксировать enum-варианты `native`/`css` в visual state.
- [ ] На `higgs remove value.fields` точечно убирать field-узлы, например старый `CSS fallback`, без пересоздания сцены.
- [ ] После стабильной визуальной реакции пройти `force-message.jsonc` по одному part и довести формат патчей до финального состояния.

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
- [x] Перевести рантайм Force на один `FORCE` и `part` внутри каждого `Particle`.
- [ ] Довести W/+Z/-Z bridge: Boundary-side Z arbitration и сквозной сценарий.

## 6. TODO HUD Интерпретатора

- [x] Загружать `TODO.md` в отдельную HUD-панель.
- [x] Использовать markdown checkbox `- [ ]` / `- [x]` как данные файла TODO.
- [x] Подсвечивать пункты как состояние HUD-панели для попадания в `/context.hud.todo.highlightedItems`.
- [x] Не смешивать состояние todo с рантайм-состоянием процесса: todo находится в `hud.todo`.
- [x] Убрать устаревший `source.open` кейс со старым shared force bare specifier: общий force package удалён, Force теперь `boundary/force`.
- [x] После удаления файлов или директорий через apply_patch обновлять файловую панель интерпретатора без ручной перезагрузки.
- [x] Доработать TerminalPane autoscroll/scrollback: когда пользователь скроллит вверх, а в терминал продолжают поступать новые данные, текст не должен перекрываться или визуально разваливаться; видовая область должна оставаться на месте, а автоскролл должен включаться только после возврата в самый низ и без просадки производительности.

## 7. FileListPane / Файловая Панель

- [x] [selection][intellij] Сделать row-wide подсветку производной только от `selectedIds`: `activeId` хранит lead/anchor для клавиатуры и открытия, но сам по себе не рисует selected-like фон.
- [x] [selection][initial] Привести начальное состояние к IntelliJ-модели: если дерево должно выбрать первую видимую строку после пустого restore/ensure, эта строка должна явно попасть в `selectedIds`, а не подсвечиваться скрытым `activeId`.
- [x] [selection][empty-state] Исправить `clearSelection()`, `setItems()` и `#syncActiveToVisibleRows()`: пустой selection не должен визуально выглядеть как выбранная верхняя папка; repair selection выполнять только в явных state transitions.
- [x] [focus][theme] Развести focused/inactive selection style как в IntelliJ: выбранная строка остается видимой без фокуса, но получает inactive fill/foreground; hover рисуется только на незавыбранной строке.
- [x] [keyboard][lead] Синхронизировать клавиатурную навигацию с selection: ArrowUp/ArrowDown/Home/End меняют настоящий `selectedIds`, а `activeId` следует за выбранной строкой без отдельной визуальной подсветки.
- [x] [source-sync][reveal] Развести ручное `revealCurrentWorkspaceFile` и автосинхронизацию с открытым source: `revealWorkspaceSource()` не должен включать скрытый аналог IntelliJ Always Select Opened File без явной настройки или команды.
- [x] [selection][multi-context] Включить множественное выделение файлов рабочей области через `Shift` и `Cmd/Ctrl` и публиковать выбранные файлы в `/context.workspaceFiles` для агента.
- [x] [tests][regression] Добавить регрессии для FileListPane и файлов рабочей области интерпретатора: пустой selection без active-фона, явный initial select-first, focused/inactive selected style, keyboard selection, manual reveal/autosync и сохранение `selectedIds`.

## 8. Сверка документации MetaFor DSL

- [x] Исправить examples `fields`: `field.number.required(18, { label })` вместо вызова результата `required(18)({ label })`; `array` привести к текущему контракту `number[]`.
- [ ] Привести раздел `Reactions` к реальному API: `.filter(({ self, value }) => ({ ... }))`, `part` вместо `patch`, и актуальные `path` значения вместо несуществующего `"/fields"`.
- [x] Решить контракт `import "metafor"`: убрать обязательность из правил; `MetaFor` в `meta.ts` предоставляет DSL-среда, типы action-модулей импортируются явно.
- [x] Синхронизировать правило `label`: требуется человекопонятная подпись, язык выбирается по контексту пакета; генератор и тесты могут использовать английские label.
- [ ] Уточнить правило структуры process action: валидатор сейчас требует только наличие `import()` и `return`, а не "первая строка import / последняя строка return".
- [ ] Исправить соглашение "Bulk: только `<meta-for>`" на `Matter`, потому что `bulk` сейчас описывает только `view/css`, а иерархия акторов живет в `matter`.
- [ ] Уточнить локальную структуру мета-репозиториев: текущая рабочая директория `github/` находится в корне проекта, а не в `~/github/`.
- [ ] Зафиксировать архитектурный gap: `app/web`, `pkg/interpreter/web` и `ui/panes` пока не переведены на MetaFor-компоненты и остаются прямым TypeScript UI.
