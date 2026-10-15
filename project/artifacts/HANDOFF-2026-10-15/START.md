# Короткий вход для следующей сессии

Состояние обновлено 16 октября 2026.

Продолжай MetaFor Владимира в назначенном checkout. Приоритет — разработка самой
системы внутри `/cosmos` и восстановление независимо от повреждённого UI или
исходного CLI. Управление/агенты как Quantum; комнаты, главный Display и рабочие
средства Storybook. Полная передача — [README.md](README.md), первый раздел
актуальный, последующие старые разделы сохранены как история.

Сначала AGENTS.md, GET environment по приватному server.json без вывода токена,
docs/README.md и правила владельца. Проверь branch/HEAD, dirty files, worktrees и
ownership runtime. Не создавай ветки/клоны/worktree, не читай production/Concept,
не трогай чужие процессы. Task-scoped commits разрешены; push не разрешён.

Проверенная активная версия — Core 0.3.45 / Visual 0.3.38, digest
`8322bbd6bc34588eb2e2cd05787ba46126bfd3c7566dcc49d500e2679fdbf90a`.
Live handover с 0.3.44 подтверждён CLI: `active.json` revision 36, operation
`cbcd4060-7cef-4eee-8374-4bbd4384ca9e` complete, Core PID 42535; health 200,
`ok: true`, Force `state: running`, три дочерних домена ready. Предыдущий
0.3.44 оставался запущенным около восьми часов, включая паузу в работе.
MetaFor code `91571d5e4`, Storybook `36ac9cb4`. Runtime управляется установленным
frozen operator через `metafor`; он лежит вне изменяемых source roots.
`metafor downgrade` проверяет совместимость и возвращает прежний admitted выпуск.
После unknown сначала readback; не повторять действие. Новый operator нельзя
устанавливать поверх процесса старого artifact без его штатной остановки.

Обновление 0.3.42 → 0.3.43 не дождалось ready за 120 секунд; active 0.3.42
сохранился как выбор, но runtime остановился. Cold start 0.3.42 тоже отказал,
cleanup скрывал исходную ошибку. Core 0.3.44 восстановил запуск: Source init
стал ленивым, health await ограничен deadline фазы, добавлены фазовые timings
и cleanup со стабильным ownership и сохранением исходной ошибки. Прошли
19 целевых тестов / 508 assertions; repair мира/history не потребовался.
Failed operation 0.3.43 сохранялась после cold start 0.3.44; текущий record
уже содержит complete перехода на 0.3.45.
Сохранённый в Source UI `Failed to fetch` от простоя снят явным
«Обновить каталог», каталог вернулся в ready.

В 0.3.45 исправлен только UI статусов: ошибка привязана к версии target
candidate, поэтому прежний отказ 0.3.43 не становится общей ошибкой текущего
выпуска. 11 целевых тестов / 140 assertions и Visual typecheck прошли.
Oracle подтвердил ready UI 0.3.45 и открытие раздела настроек. Затем все три
Window стали скрытыми, capture истёк: свежая визуальная проверка текста пока
открыта. Management отдельно подтвердил active 0.3.45 и complete, HTTP 200 за
3930 мс, header digest совпал. Не повторять activation ради снимка.

Исторически на 0.3.42 реальными controls двух Window пройден путь Package Display →
room → chat → session → Quantum → Cosmos → тот же chat. Draft сохранён и очищен;
в Quantum нет Minimap Cosmos. Свежий кадр видимой комнаты получен через Oracle.
Диагностический текст нигде не отправлялся модели. Main Display содержит
«Зависимости» и «Исходники», агент — сессии и настройки имени/пола. Visual 0.3.37
с исправлением общей глубины взят из 0.3.43 и был установлен в составе 0.3.44.
Историческая живая проверка 0.3.44 одного Window прошла: MetaFor Package →
Display → room → «Основной» → «Беседы» → «Рабочая · Ollama» → draft → room →
Quantum → Cosmos → тот же chat. Draft сохранился и очищен без отправки модели;
header настроек работает, вкладки «Зависимости»/«Исходники» присутствуют.
Proof: `.local/oracle-agent-provider/source44-ui-proof/window_92134-1792073422776_1/proof.json`.
Свежий видимый Oracle-кадр `frame-1792074183217.png` в `browser-api-live`,
1362×2158, presented 2016 → 2064: ноги на полу, надголовный чат и HUD на месте,
Minimap не перекрывает room. Это принятый узкий визуальный путь 0.3.44.
Его Main Display отдельно просмотрен: `frame-1792074455279.png`, 1362×2158,
presented 14804 → 14844, содержимое Storybook и вкладки HUD видны, Minimap не
мешает. Окно выпуска — `frame-1792074803967.png`, presented 24954 → 24987:
текущий 0.3.44, rollback 0.3.42 и CLI. Замеченная stale-ошибка исправлена в
0.3.45, но старый кадр не подтверждает новый UI. Полный цикл
source patch/check/build/publication этими проверками не доказан.

Главный незаконченный путь — source edit → check → prepared complete release →
explicit activate → recover. Source Session уже использует portable Package
Environment Storybook, filesystem/knowledge tools и назначенный `bun.evaluate`.
Ollama реально выполнила read и Bun tool и завершила ход. Второй model/tool loop
не нужен. Файловый scope — назначенный Package; машинный REPL — отдельное явное
полномочие, не файловая песочница. Сессии приходят по stream, GET каталога теперь
читает snapshot; refresh только явный.

`cosmos.prepare`, executable source scenarios и автоматическая team-coordination
ещё не выданы агентам. Не переносить вслепую
`.local/paused-cosmos-preparation-2026-10-15`: там нет доказанного source closure,
а publisher может оставить version/artifact после позднего отказа. Следующий
срез — существующий build/release owner с точной квитанцией источников и эффекта,
не новый сервис и не копия Repo. После него выдать model-tools просмотра строго
назначенного Window и согласованные team tools.

Qwen Mac авторизован в существующем Chrome Studio, новый профиль не нужен.
Финальный tool round дал server-ID mismatch после двух успешных инструментов;
не повторять неизвестный эффект. Ollama ai-srv работает независимо. ChatGPT
остаётся задачей Codespace; чужой VPN не останавливать. Видео не доказывает
аудио, микрофон, native Save/Open или стабильность модели.

Отделяй source/tests, installed runtime, tool-run модели и визуальную приёмку.
Реальные доказательства и оставшаяся очередь перечислены в README. Приоритет
саморазработки и восстановления не заменять косметикой и вторичными провайдерами.
