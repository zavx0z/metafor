# MetaFor: правила для AI-агентов

## Источники истины

- Перед работой открыть `docs/README.md`: там находится единственная карта
  действующих документов и точный документ-владелец каждого контракта.
- Код, public types и тесты доказывают реализацию контракта, но не заменяют его.
  Если они расходятся с доменной документацией, расхождение нужно явно
  зафиксировать и согласованно исправить.
- Внешний Concept не является зависимостью проекта. В обычной работе, в том
  числе на `ai-srv`, не клонировать, не читать и не изменять его. Обращаться к
  нему можно только по отдельному прямому запросу пользователя.
- Канонические смысловые правила RPC-проекций для клиентов находятся в разделе
  `RPC — компактная read-only проекция структуры мира` файла
  `create-metafor/rules/metafor.md`. `docs/FORCE.md` владеет transport и routing
  законами Monad RPC, но не заменяет этот клиентский projection contract.
- Новое понятие сначала формулируется простым проверяемым законом в документе
  соответствующего домена, затем отражается в типах, коде и тестах.

## Архитектурные границы

- Сохранять терминологию `Dark`, `Boundary`, `Matrix`, `Energy`, `Bulk`,
  `Inflaton`, `Graviton`, `Field`, `Brane` и Force.
- Рассматривать домены как изолированные проекции с локальными силами. Корневой
  Force transport связывает их, но не является всей Force.
- Dark передаёт Boundary отдельные Inflaton particles. Dark, Matrix, Energy и
  Bulk не читают Boundary или SQLite напрямую.
- Одна изменённая entity передаётся одним `ForceMessage` с одной `Particle`.
- Планируемый bootstrap короткой agent-сессии использует один RPC surface для
  всех агентов и явно передаёт rules/capabilities, Git/source revision и
  scoped RPC JSON snapshot. По умолчанию scope ограничен авторизованным
  внутренним Atom subtree/graph; full-world и Mass требуют отдельных
  capabilities. Скрытый context прошлой сессии не является источником истины.
- Proposed Gem profile на AI-server получает начальный scoped snapshot, затем
  per-tick delta с causal frontier, а не повтор полного context. Mass/history
  читаются только отдельными capabilities с явной resolution; task envelope
  задаёт revision, scope, proposal, budget и owner-gated commit. Не считать
  этот профиль реализованным без public types, providers и tests.
- Process-authoring агент получает минимальный capability registry для своего
  Atom subtree. Tools группируются по owning contour, operation class, graph
  scope и праву касаться live state. Авторинг возвращает proposal и результаты
  проверок; canonical commit требует отдельной capability и owner gate.
- Не считать package script, prompt или найденный executable автоматически
  выданным tool. Текущий Interpreter подтверждает source/process/debug surfaces
  и `git.status`, но не commit tool; MetaFor и архивный Production не имеют
  подтверждённого общего Process-authoring registry, а Production vendor
  inventory отсутствует. Каждая capability требует версии contract и
  повторной привязки к точному scope.
- Не возвращать старый `qTp` как смысловую замену текущей архитектуре.
- `cluster/` содержит внешние Meta-репозитории и не является workspace MetaFor.
- Каждая Meta в canonical Cluster является независимым peer Git-репозиторием
  `cluster/<owner>/<repository>`. Canonical `src` имеет ровно два сегмента
  `<owner>/<repository>`; nested Meta repositories и третий address segment
  запрещены. Композиция выполняется через Meta/Matter/Monad references.
- При задаче внутри `cluster/` по умолчанию работать только с Meta-пакетом по
  границе `docs/META_PACKAGES.md`. Продуктовый runtime внешнего репозитория и
  ядро MetaFor требуют отдельного явного запроса.

## Работа и проверка

- По умолчанию агент работает в том каноническом рабочем каталоге и в той
  ветке Git, в которых была начата задача. Текущая ветка является веткой
  выполнения задачи.
- Без прямого указания пользователя запрещено создавать, подключать,
  переключать, переименовывать и удалять ветки Git, дополнительные рабочие
  каталоги Git и копии репозитория. Также запрещено создавать ветку при
  переносе набора изменений или архива Git.
- Параллельная работа, отдельная проверка, аудит, наличие чужих изменений и
  желание изолировать задачу не являются разрешением на новую ветку или
  дополнительный рабочий каталог. Если продолжить в текущем состоянии нельзя,
  агент останавливается и сообщает пользователю точную причину.
- Временный рабочий каталог, автоматически созданный средой агента, не
  становится каноническим и не даёт права создавать новые ветки или рабочие
  каталоги. В нём допустимо только установить исходное состояние; работу нужно
  вести в названном пользователем каноническом каталоге и его текущей ветке.
- Перед первым изменением и перед записью коммита агент проверяет корень
  репозитория, текущую ветку, текущий коммит, состояние рабочего дерева и
  связанные рабочие каталоги. Коммит записывается только в текущую ветку.
- Слияние, перенос отдельных коммитов, изменение основания, принудительный
  сброс, отправка на сервер и удаление веток выполняются только по отдельному
  прямому указанию пользователя.
- Перед нетривиальным изменением прочитать документ соответствующего домена,
  код, public contracts и обычные тесты.
- Перед изменением RPC сверить exposed methods, public types и тесты, а в
  документации явно разделить `реализовано и проверено сейчас` и планируемый
  контракт. Не выдавать имя метода или возможность за действующий API до их
  реализации и проверки.
- Не добавлять новую обязательную обвязку разработки без прямого запроса
  пользователя. Работать через обычные команды и инструменты проекта.
- Не использовать частичную горячую перезагрузку доменов. После изменения кода
  явно перезапускать весь причинно связанный contour обычными Bun processes.
- Перед изменением схемы SQLite или кода её миграции агент обязан вручную
  выполнить `bun run boundary:backup` в точном рабочем каталоге изменяемого
  contour и убедиться, что команда завершилась успешно. При обычном запуске
  MetaFor резервирование автоматически не выполняется. Команда атомарно
  заменяет единственную копию `.metafor/dev.backup.sqlite`, поэтому старые
  копии не накапливаются.
  Для нестандартного пути использовать `BOUNDARY_PATH` и при необходимости
  `BOUNDARY_BACKUP_PATH`; не копировать работающий `dev.sqlite` обычной
  файловой командой, потому что актуальные записи могут находиться в WAL.
- Сохранять посторонние изменения рабочего дерева. Не запускать, не останавливать
  и не перезапускать существующий runtime без проверки его точной принадлежности.
- Запускать минимальную релевантную проверку. Основные команды:
  `bun run typecheck`, `bun run test`, `bun run check`.
- Для документации перечитать diff и выполнить `git diff --check`.
- Не утверждать прохождение runtime или визуального сценария без фактической
  проверки соответствующего пользовательского пути.

## WebGPU Inspector для внешней диагностики

- На этом Mac установлен внешний WebGPU Inspector из
  `brendan-duncan/webgpu_inspector`. Его checkout находится в
  `/Users/zavx0z/.codex/tools/webgpu-inspector`, MCP зарегистрирован в Codex
  под именем `webgpu-inspector`, а skill анализа —
  `/Users/zavx0z/.codex/skills/webgpu-capture-analysis/SKILL.md`.
- WebGPU Inspector является только внешним диагностическим инструментом.
  Запрещено добавлять его script, bridge client, package, dependency, loader,
  debug flag, overlay или capture API в исходники, HTML, runtime, build и
  browser bundle MetaFor. В production-коде не должно быть даже условного
  пути его загрузки.
- MCP является STDIO server и штатно запускается самим Codex при старте или
  перезапуске клиента. Состояние конфигурации проверять командой
  `codex mcp get webgpu-inspector`; bridge слушает только
  `127.0.0.1:9690`, а captures сохраняет вне репозитория в
  `/Users/zavx0z/.codex/tools/webgpu-inspector/captures`. Если MCP добавлен,
  но его tools отсутствуют в текущей задаче, нужен перезапуск Codex, а не
  изменение проекта или повторная установка зависимости.
- Перед подключением к Chrome проверить `http://localhost:7880/health` и
  точное окно/вкладку через `http://localhost:7880/windows`. Inspector
  подключать командой MCP `attach_browser` к
  `http://localhost:9222`. Не закрывать, не заменять и не перезапускать
  пользовательский Chrome без разрешения. Для instrumentation использовать
  отдельную диагностическую вкладку через `open_page`; исходную чистую вкладку
  MetaFor не перезагружать и не превращать в постоянную inspector-вкладку.
- Минимальный performance workflow: `browser_status` → `list_pages` →
  `get_frame_stats` → `capture_frames` с `payloads: "none"` и
  `profilePasses: true` → `analyze_performance` →
  `get_validation_errors`. Для детального разбора начинать с
  `get_capture_summary`, затем точечно использовать `get_commands`,
  `get_object`, `get_shader`, `get_draw_state` и `decode_vertex_buffer`;
  большие command lists целиком не читать.
- `profilePasses: true` требует поддержки и исправной работы WebGPU timestamp
  queries. Если timed capture один раз завершается таймаутом, не повторять его
  вслепую и не выдавать heuristic за измеренное GPU time. Выполнить лёгкий
  capture с `profilePasses: false`, зафиксировать отсутствие GPU timings и
  отдельно продолжить CPU/command analysis. Event-driven renderer должен
  фактически рисовать во время capture; не добавлять ради этого постоянный
  render loop или диагностический код.
- Capture с CDP-инъекцией влияет на timings и количество runtime objects,
  поэтому он доказывает GPU command/object structure, validation и
  относительные bottlenecks, но не заменяет чистые first-paint/CPU/heap
  измерения production-вкладки. После диагностики закрыть отдельную
  instrumented-вкладку; contour и чистую вкладку оставить работающими.

## Инициатива Graph, Monad и Force

- При работе над этой инициативой сначала полностью прочитать
  `task/graph-monad-force-plan.md`, затем
  `task/graph-monad-force-todo.md`.
- План является живой архитектурной картой, а TODO — порядком исполнения. Они
  не заменяют документы-владельцы из `docs/README.md`; при расхождении сначала
  зафиксировать и разрешить его, а не молча выбрать план или код.
- Брать highest-priority item со статусом `READY`, все dependencies которого
  завершены. Не перескакивать к более позднему этапу ради удобной реализации.
- До завершения `MF-000` implementation не начинать. После `MF-000` первым
  implementation priority является цепочка flat topology
  `MF-010 → MF-011 → MF-012 → MF-013 → MF-014`; Monad patch slice начинается
  только после её cold proof.
- `WAITING` означает только незавершённые dependencies; `BLOCKED` — фактическое
  препятствие с evidence. После завершения item перевести ставшие доступными
  зависимые `WAITING` items в `READY`.
- Item со статусом `GATE` требует явного owner approval конкретного решения.
  `GATE` не добавляется перед каждым structural patch: внутри уже утверждённых
  capability и policy Codex выполняет итеративный цикл
  `read → plan → validate → patch → materialize → observe`.
- Перед изменениями пометить выбранный item `IN_PROGRESS` и указать текущую
  задачу/исполнителя. Параллельно выполнять только независимые items.
- После работы обновить item: `DONE` только с фактическими checks и evidence;
  `BLOCKED` — с точной причиной и уже выполненными безопасными проверками.
- Новое обязательное понятие или изменённый закон сначала внести в
  соответствующий domain owner document. Plan/TODO обновить следом, чтобы они
  не расходились с утверждённым контрактом.
- Create интегрирует только существующий Create MetaFor template path:
  `template → validate → target patch → validate → materialize`. Не создавать
  параллельный Monad generator и не заменять полный package на
  `directory + meta.ts`.
- В первом Monad patch slice не добавлять `pending/active` Meta heads,
  transactional outbox, Force v2, branches/merge/rollback/push, Process
  generator, restart или hot reload. Source write не считать доказательством
  materialization; точный outcome записывать в operational journal.
- Лада не является fixture или центром текущего authoring/topology work. Это не
  вечный запрет: constrained self-evolution остаётся отдельным будущим item.
- При новом существенном evidence допускается править план и приоритеты TODO,
  но нельзя удалять acceptance criterion без объяснения и owner decision.
