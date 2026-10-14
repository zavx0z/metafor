# Короткий вход для следующей сессии

Передай этот текст новому агенту. Полная передача — соседний [README.md](README.md).
Это рабочий контекст, не разрешение обойти правила назначенной среды.

---

Ты продолжаешь MetaFor Владимира, дата передачи 15 октября 2026. Цель — один
надёжный цикл разработки самой системы из её веб-чата без обязательного
платного Codex. Не начинай с новых визуальных возможностей и не перечитывай
многодневную историю целиком: используй handoff и нужные владельческие документы.

Начни с AGENTS.md, GET environment по локальному server.json без вывода токена,
docs/README.md и правил выбранного владельца. Сначала проверь фактический
checkout, branch/HEAD, dirty files и ownership runtime. Не создавай ветки,
worktree или клоны; не трогай production/Concept и чужие процессы.

Последний baseline: MetaFor `1548762bc`, Provider `d3a08a4`, Storybook `651ed304`.
Установлен Core0.3.29/Visual0.3.25. Работа из текущего checkout; эти изменения
закоммичены локально, наличие их на remote не подтверждено.

Реальное состояние:

- Cosmos Session/Store/stream/общий Storybook UI уже есть. История в Cosmos,
  отдельно от Quantum/Mass. Один semantic Document/Canvas; не создавать обходов.
- Новый чат ещё не получает Session Environment для source read/patch/test.
  В Storybook `chat/session/contract/environment.ts` уже есть content/execute/
  dispose/authorize и строгий цикл JSON `{name,arguments}`. Reuse этого механизма,
  не новый цикл. Cosmos composition: `cosmos/release/server/conversations.ts`.
- Текущий Oracle Process scope full-root; subtree не обещать. `cwd` беседы —
  история, не исходники. Native REPL даёт ОС-доступ и не является scope sandbox.
- DeepSeek на Mac авторизован по подтверждению Владимира 15 октября. Последняя
  попытка не нашла composer, отдельно preview был capture-required. Проверить
  target/страницу/readiness, не заводить профиль и не просить login вслепую.
- Старый диагностический request в session d7973392-20a9-438b-ad9a-119e82ef3047
  остался pending после failed+stop. Перед prepare/send прочитай состояние;
  prepare может продолжить pending. Не повторяй неизвестные эффекты.
- Qwen ai-srv healthy; авторизация/модельный ход отдельно не подтверждены.
- ai-srv-origin: RTX5060Ti16GB, RAM61GiB, Ollama активен, модели не загружены.
  Начать с уже установленного qwen3.5:9b, одна очередь/один writer. Это рекомендация,
  а не проверка качества. 27B Q4 больше VRAM до KV/cache.
- Ollama adapter уже существует, но Cosmos nativeConnect требует peer, а
  resolveConfiguredProvider сейчас запрещает peer у Ollama. Согласовать эти
  две границы через доверенное назначение существующего Ollama ACP executor
  на ai-srv. Одного изменения настроек недостаточно; chat переписывать не нужно.
- Новый Codespace bots-work/miniature-happiness-jjjrvqg6x7qgcq97 Available,
  2CPU8GB; VPN уже поднят другой задачей. Не останавливай его. Старые billing402
  относятся к другим аккаунтам. ChatGPT/Capsule на новом ресурсе ещё не приняты.

Выбери ровно один срез из T1–T4 полной передачи. Предпочтительно сначала
независимый Ollama→Cosmos chat, затем Environment→одно выданное чтение, patch,
проверка и видимый diff. Подготовь owner law/contract только по необходимости,
сохрани существующие approvals и введи конечный бюджет шагов.

Зачёт: реальная модель в той же Cosmos Session читает разрешённый исходник,
выполняет согласованный hash-checked patch, запускает одну назначенную проверку,
показывает её exit/stdout и точный diff. После разрыва сохраняется identity и
нет повторного patch/prompt. API readiness и обычного ответа модели недостаточно.

Если в текущем веб-чате инструменты вообще не выданы, прямо скажи это. Не
изображай чтение файлов и исполнение команд. Можно подготовить ограниченный
patch по явно предоставленным исходникам, но это ещё не сквозной зачёт.

Итог каждого среза: что проверено, какой commit/revision, одна следующая задача,
что остаётся неподтверждённым. Commit/push/deploy — по актуальному разрешению
Владимира, без наследования старого разрешения на другой объём работ.
