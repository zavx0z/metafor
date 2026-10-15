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

Последний baseline: MetaFor `e77ccbfb3`, Provider `48076b5`, Storybook `5c80458e`,
Capsule `c0eafb1`. Установлен Core0.3.33/Visual0.3.29. Работа из текущего checkout; эти изменения
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
  страница показала `Server is temporarily unavailable`; Cosmos не получил
  полную квитанцию. Не переотправлять неизвестный исход. Preview отдельно был
  capture-required. Не заводить профиль и не просить login вслепую.
- Старый диагностический request в session d7973392-20a9-438b-ad9a-119e82ef3047
  остался pending после failed+stop. Перед prepare/send прочитай состояние;
  prepare может продолжить pending. Не повторяй неизвестные эффекты.
- Qwen preview bootstrap восстановлен: два 200 через MetaFor за 2–2,5 секунды.
  Перезапущен только Provider; Capsule/Chrome сохранены. Вход, видео и модельный
  ход этим не подтверждаются. Capsule screenshot timer `Illegal invocation`
  исправлен; Mac capture-required остаётся отдельным вопросом.
- Qwen Mac тоже подключён: агент «Qwen · MacBook», «Рабочий чат · Qwen»,
  `mac-qwen` в существующем Chrome Studio профиле. Реальные ответы «Готово.»
  и после stop/prepare «MetaFor». Native Mac Provider теперь использует
  browser-host-background-20261015, PID29742/4447; browser prompt работает
  через focus emulation без автоматического Target.activateTarget. Ошибка
  не поднимает окно fallback-ом; ручная активация сохранена. OS focus отдельно
  не измерялся. Chrome/профиль и ai-srv/Codespace bundles не менялись.
- ai-srv-origin: RTX5060Ti16GB, RAM61GiB. Отдельный контейнер
  metafor-provider-ai-ollama, одна очередь. qwen3.5:9b дал две реальные реплики
  через Cosmos с той же native identity, без дубля сообщения после восстановления.
  Агент «Ollama · ai-srv» в atom:1, беседа «Рабочий чат · Ollama».
  Во время генерации GPU занимала около 6800 MiB; контекст 32768.
- Peer Ollama теперь поддержан по exact private assignment. Standalone native
  driver сохранён. Исправлен graceful peer close до освобождения bootstrap.
- Старые thought chunks теперь показываются одной накопительной карточкой.
  Cache перестраивается из журнала, raw evidence остаётся. В живой беседе
  служебные группы уменьшились с 2713/215 до 4/5 элементов.
  Мысль выводится общим ChatContent как Markdown. Два текста побайтно совпали
  с native thinking (SHA-256/длины); потери не было, ошибка была в представлении.
- Вход/Back показывают комнату целиком спереди; live-снимок с 8 агентами получен.
  Перекрытие соседних head Chat ещё относится к T11, не объявлять layout готовым.
- Native context option пока теряется в Session; любое non-model значение
  ошибочно относилось бы к thoughtLevel. Нужен отдельный settings срез, не
  простое снятие фильтра. Thinking values реальный Ollama не сообщает;
  не придумывай переключатели. Первый ответ медленный; cancel ещё не принят.
- Новый Codespace bots-work/miniature-happiness-jjjrvqg6x7qgcq97 Available,
  2CPU8GB; VPN уже поднят другой задачей. Не останавливай его. Старые billing402
  относятся к другим аккаунтам. ChatGPT/Capsule на новом ресурсе ещё не приняты.

Выбери ровно один срез из T1–T4 полной передачи. Ollama→Cosmos text/resume уже
подтверждены; основной следующий шаг — Environment→одно выданное чтение, patch,
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
