# MF-419 — Артефакты

## 2026-08-09-chrome-parent-v22-post-cold-live-canvas.png

* Источник: точный `canvas.toDataURL("image/png")` чистого основного CDP target
  `089AC06B3EBD798FE107800B73BB4123` после завершения и удаления отдельного
  cold elected-leader contour. Пользовательская страница не перезагружалась и
  осталась на `http://127.0.0.1:4400/`.
* Ожидание: один parent `Chrome` содержит соседние `Эта страница` и `Service
  Worker`; внутри page находятся `main → RTCPeerConnection страницы` и
  `Dedicated Worker`, server RTC остаётся внутри `Peer process`. Реальные
  transport routes выходят из фактических портов и не создают ownership edges.
* Фактическое наблюдение: структура совпала с ожиданием. Live dataset сохранил
  `11/9`, bootstrap `2/0`, complete layout, lifecycle/traffic queues `0`, no
  gap, verified spatial runtime, neutral WS и прежний canvas transform
  `{x:49.059191982957884,y:33.99999999999994,
  scale:0.5061197480918429}`. Изображение имеет размер `1832×2176`.
* Контрольная сумма: SHA-256
  `fc67ff0b12e453c4a770026bb1b26180ff9750f46c1cc51c11305f39e24536ed`.

## 2026-08-09-chrome-parent-v22-routed-canvas.png

* Источник: точный WebGPU canvas readback чистой root-страницы
  `http://127.0.0.1:4400/` после materialization реального `browser-runtime`
  parent и повторного server-side Libavoid routing.
* Дата: 2026-08-09.
* Версия проекта: baseline `378624cfa83d779f6fd9f50c1f81fab5b48fc4de`
  с незакоммиченным срезом `MF-419` v22.
* Ожидание: одна нода `Chrome` содержит страницу и Service Worker; page
  содержит `main`/browser RTC и Dedicated Worker. WS выходит из точного порта
  Service Worker, пересекает только границу Chrome и ортогонально приходит в
  server; внутренних диагоналей и ownership edges нет.
* Фактическое наблюдение: структура и routing совпали с ожиданием; live dataset
  сообщил `11/9`, нулевые lifecycle/traffic queues, no gap, complete layout,
  verified spatial runtime и neutral WS.
* Контрольная сумма: SHA-256
  `1a51dcb25fc703de220ef406c43788a214f16659bb45866e4467d3aa21bddd07`.

## Чистый ранний lifecycle-профиль v22

* Источник: внешний CDP `Page.addScriptToEvaluateOnNewDocument` на точном page
  target `089AC06B3EBD798FE107800B73BB4123`; инструментирование не входило в
  исходники или browser bundle и было удалено перед финальной чистой reload.
* Lifecycle BroadcastChannel создан на `159,7` мс до запросов `app.js`
  (`159,9` мс) и `orchestration.js` (`160,0` мс).
* Page sequence `1` родил реальный `browser-runtime` на `209,0` мс, sequence
  `2` родил page с тем же owner на `210,7` мс. Bootstrap сцены сохранил
  гарантированный первый кадр `2/0`.
* Первое traffic observation пришло на `360,1` мс, первый route — на
  `655,6` мс, первый signal — на `655,7` мс. Route→presentation занял
  `0,1` мс; финальный `11/9` завершился на `988,9` мс без gap и с очередями
  `0`.
* После удаления инъекции тот же target повторно загрузил точный `/`; injected
  global отсутствовал, состояние вернулось к `11/9`, layout `complete`, а
  1,5-секундное чтение console дало `0` записей.

## 2026-08-09-chrome-parent-v22-natural-rebirth-canvas.png

* Источник: точный `canvas.toDataURL("image/png")` чистого CDP target
  `089AC06B3EBD798FE107800B73BB4123` после естественного завершения прежнего
  `ServiceWorkerGlobalScope`, рождения нового Worker target и замены WS
  incarnation без reload страницы.
* Дата: 2026-08-09.
* Версия проекта: baseline `378624cfa83d779f6fd9f50c1f81fab5b48fc4de`
  с незакоммиченным срезом `MF-419` v22.
* Ожидание: новый Service Worker остаётся дочерним runtime Chrome; состав и
  transform не меняются, old Worker/WS не остаются ghost-объектами, новый WS
  выходит из фактического порта и остаётся ортогональным.
* Фактическое наблюдение: два 55-секундных профиля сохранили `11/9`, no gap,
  complete layout и точный transform
  `{x:49.059191982957884,y:33.99999999999994,
  scale:0.5061197480918429}`. Canvas после rebirth визуально подтверждает тот
  же Chrome containment и ортогональный WS. Изображение имеет размер
  `1832×2176`.
* Контрольная сумма: SHA-256
  `2a54d74401f253a048674d91874c9890b9efb8d0daad7eec7d44c29a5930375d`.

## Холодный follower lifecycle-профиль v22

* Источник: disposable Chrome browser context и внешний CDP
  `Page.addScriptToEvaluateOnNewDocument`; browser bundle не изменялся,
  временные target/context после проверки удалены.
* До root navigation Service Worker controller отсутствовал, `localStorage` и
  `sessionStorage` имели длину `0`. BroadcastChannel lifecycle был создан на
  `49,3` мс до `app.js` (`49,9` мс); browser runtime родился на `76,7` мс,
  page — на `77,5` мс.
* Bootstrap `2/0` наблюдался на `311,9` мс; первое traffic observation — на
  `278,8` мс, route — на `573,4` мс, signal — на `573,7` мс. Сцена достигла
  устойчивых `10/7` на `912,4` мс, без gap, с очередями `0`, neutral WS и
  пустой console.
* DOM состояния дал `role=candidate`, main embodiment `—` и singleton
  authority `none`: глобальный лидер оставался в основной вкладке, поэтому
  cold follower причинно не создавал собственный browser RTCPeerConnection и
  две RTCDataChannel-связи. Этот профиль не считается cold elected-leader
  gate. После cleanup основная вкладка сохранила `/`, `11/9` и прежний canvas
  transform.

## Холодный elected-leader lifecycle-профиль v22

* Источник: новый изолированный Hamiltonian host epoch
  `d75ff7cb-9896-42e5-97d8-e106519aa7ea` на временном listener
  `127.0.0.1:4419` и disposable Chrome browser context с внешним
  `Page.addScriptToEvaluateOnNewDocument`. Пользовательский listener
  `127.0.0.1:4400` и его лидер не останавливались и не изменялись.
* До навигации host имел topology revision `0`, `leader=null`, пустой peer
  snapshot; browser context не имел Service Worker controller или storage.
  Lifecycle BroadcastChannel был создан на `40,5` мс и подписан на `40,6` мс,
  до `app.js` (`40,8` мс). Browser runtime/page родились на `82,6/82,9` мс,
  Service Worker — на `120,2` мс, WS — на `151,9` мс, server/browser RTC — на
  `170,5/253,3` мс, Oracle/Force DataChannel — на `475,7/476,3` мс.
* Страница стала `elected embodiment` с fencing token `1`; peer snapshot был
  `connected` с каналами `oracle` и `force`, realtime frames на control WS —
  `0`. Bootstrap `2/0` committed на `328,2` мс, первое traffic observation —
  на `333,2` мс, route — на `807,6` мс, signal — на `807,8` мс. Финальный
  `11/9` достигнут на `1139,3` мс с очередями `0`, no gap, neutral WS и
  завершённым layout.
* Явный inline data favicon устранил автоматический браузерный запрос
  отсутствующего `/favicon.ico`; повторный полностью холодный профиль дал
  пустую console. Disposable context, listener `4419`, дочерние процессы и
  временные scripts после измерения удалены. Основной target сохранил точный
  `/`, `11/9` и прежний canvas transform.

## 2026-08-09-websocket-paused-retained-final-canvas.png

* Источник: точный `canvas.toDataURL("image/png")` CDP target
  `959D317F92B961D0F6019C5CA79E9E9F` на единственном runtime URL
  `http://127.0.0.1:4400/` после полного рестарта актуального среза `MF-419`.
* Дата: 2026-08-09.
* Версия проекта: baseline `378624cfa83d779f6fd9f50c1f81fab5b48fc4de`
  с незакоммиченным retained-frontier и startup-traffic исправлением.
* Ожидание: при закрытой control socket оба endpoint продолжают существовать,
  поэтому граф остаётся `10/9`, а WS edge остаётся видимым как terminal
  `paused`; gap и очереди отсутствуют.
* Фактическое наблюдение: dataset сохранил `10/9`, lifecycle/traffic pending
  `0`, gap отсутствовал, identity websocket edge не изменилась и получила
  `tone=paused`. Canvas показывает эту связь между Server и Service Worker.
  Оранжевый локальный Worker messaging вызван намеренной заменой MessagePort
  только в диагностическом сценарии и не относится к WS.
* Контрольная сумма: SHA-256
  `273ec8812daadab5d322d3747ab94fe9f7d2b1d5496b033809641a4d3bb4a6af`.

## 2026-08-09-containment-edge-compositing-composited.png

* Источник: прямой composited `Page.captureScreenshot` точного CDP target
  `F0F22B172BA077135383D4F55FB75072` на чистом
  `http://127.0.0.1:4400/` после полного рестарта Hamiltonian.
* Дата: 2026-08-09.
* Версия проекта: baseline `378624cfa83d779f6fd9f50c1f81fab5b48fc4de`
  с незакоммиченным срезом `MF-419` и containment-aware compositing.
* Ожидание: `Worker messaging` и внутренние части обоих RTCDataChannel видны
  поверх background владельцев, но остаются под дочерними карточками, их
  подписями и sockets.
* Фактическое наблюдение: оба RTC route непрерывно видны от browser RTC через
  `main` и «Эта страница» к server RTC; `Worker messaging` не исчезает под
  `main`/page fill. Дочерние RTC и Dedicated Worker, текст и sockets рисуются
  поверх routes. Сцена остаётся `10/9`, auto-fit и layout transition завершены.
* Контрольная сумма: SHA-256
  `13089ad60d62858cb5b819bc02aeb02d5c091975516d7c3377df3f49126106bf`.
* Независимый WebGPU canvas readback того же порядка слоёв сохранён в
  `2026-08-09-containment-edge-compositing.png`, SHA-256
  `b3d76497a9bb83421ca45d11aed99dbc1b5c4d35bd854e4a44e174c50c276bba`.

## 2026-08-09-contained-routing-stable-canvas.png

* Источник: прямой composited `Page.captureScreenshot` точного CDP target
  `F0F22B172BA077135383D4F55FB75072` на `http://127.0.0.1:4400/` после полного
  рестарта Hamiltonian с актуальным незакоммиченным срезом `MF-419`.
* Дата: 2026-08-09.
* Версия проекта: baseline `378624cfa83d779f6fd9f50c1f81fab5b48fc4de`
  с незакоммиченными изменениями `MF-419`.
* Ожидание: `main`, вложенный browser RTC и `Dedicated Worker` находятся внутри
  «Эта страница»; локальный `Worker messaging` не выходит из owner и имеет
  заметный routing clearance до его рамки; весь display остаётся неподвижным
  при штатной замене Service Worker incarnation.
* Фактическое наблюдение: compound geometry резервирует 28 px до child frame;
  после 10 px Libavoid obstacle buffer маршрут сохраняет 18 px видимого зазора
  до border owner. За 52,2 секунды прошли два реальных цикла завершения и
  пробуждения `ServiceWorkerGlobalScope`: lifecycle revision
  `916 → 1295 → 1674`, но состав оставался `10/9`, transition всё время был
  `complete`, а canvas transform ни разу не изменился:
  `x=169.774870017331`, `y=34`, `scale=0.5303292894280762`.
* Контрольная сумма: SHA-256
  `6d935acf4ff796f4987814daa8d4d1e55fa07d35e2623ff555ba83d7edf659c6`.

## 2026-08-09-nested-rtc-rebirth.png

* Источник: прямой composited `Page.captureScreenshot` точного CDP target
  `F0F22B172BA077135383D4F55FB75072` после намеренного `SIGKILL` только
  испытательного `Peer process` и его автоматического causal rebirth.
* Дата: 2026-08-09.
* Версия проекта: baseline `378624cfa83d779f6fd9f50c1f81fab5b48fc4de`
  с незакоммиченным срезом `MF-419` и утверждённой владельцем вложенностью RTC.
* Ожидание: browser `RTCPeerConnection` находится внутри «Эта страница»,
  server `RTCPeerConnection` — внутри нового `Peer process`; ownership-edge
  отсутствует, Oracle/Force идут двумя прямыми `RTCDataChannel` между детьми.
* Фактическое наблюдение: peer PID сменился `4770 → 5084`, incarnation —
  `c237b66e… → df7c6463…`, generation — `1 → 2`; обе RTC-ноды получили новую
  session и остались внутри владельцев. Граф вернулся к `9/9`, transition
  завершён, `gap=0`, lifecycle/traffic pending `0`, peer `connected`, channels
  `oracle`/`force`, host error отсутствует.
* Контрольная сумма: SHA-256
  `f9f301b0bad6f8cb85023187fc26ad004b76696b912410683b072459a04d63eb`.

## 2026-08-09-fast-bootstrap-v17.png

* Источник: точный `canvas.toDataURL("image/png")` root-страницы в выделенном
  CDP Chrome после полного рестарта host и отдельного внешнего timeline.
* Дата: 2026-08-09.
* Версия проекта: baseline `378624cfa83d779f6fd9f50c1f81fab5b48fc4de`
  с незакоммиченным срезом `MF-419`: ранний BC перед динамическими импортами,
  layout гарантированных server/page без ELK и eager host bundle.
* Ожидание: текущие 9 owner-observed нод и 9 реальных transport-рёбер целиком
  видимы; фальшивого browser profile и ownership-edge нет.
* Фактическое наблюдение: состав `9/9` совпал с DOM lifecycle evidence;
  server epoch `dab99a63…`, обе RTC-ноды остаются отдельным нижним connected
  component до решения владельца. Физический screen capture одновременно
  подтвердил ту же сцену в Chrome рядом с Codex.
* Timeline этой загрузки: navigation bootstrap `2/0` — 319 мс, первая
  materialization реальных сигналов — 584 мс, завершение перехода `9/9` —
  921 мс; `gap=0`, lifecycle/traffic pending `0`, console пуста.
* Контрольная сумма: SHA-256
  `d5c387102f1b0cb7d3a245f12cbe253c881a9ce44a90a959743c61003d4b411e`.
* Ограничение: canvas readback отдельно не доказывает compositor output;
  поэтому он был сопоставлен с независимым физическим снимком экрана.

## 2026-08-09-causal-frontier-v13.png

* Источник: точный `canvas.toDataURL("image/png")` чистой тёплой загрузки
  `http://127.0.0.1:4400/` в выделенном CDP Chrome после установки Service
  Worker entry v13 и retained causal frontier.
* Дата: 2026-08-09.
* Версия проекта: baseline `378624cfa83d779f6fd9f50c1f81fab5b48fc4de`
  с незакоммиченным срезом `MF-419` после полного прогона 108 тестов.
* Ожидание: 9 наблюдённых нод и 9 реальных transport-рёбер, без browser-profile,
  старых incarnation, sequence gap и отложенной traffic-очереди.
* Фактическое наблюдение: причинный состав совпадает; все 9 нод и 9 рёбер
  видимы, фальшивой ноды нет. Открытый инспектор по-прежнему оставляет граф
  слишком мелким и смещённым вниз-влево, поэтому композиция ожидает решения
  владельца.
* Контрольная сумма: SHA-256
  `574cab1378e64a640f71d0b471edbda286be774303cbadbeaa4ec96bfe15dc7f`.
* Ограничение доказательства: последующий аудит показал, что
  `canvas.toDataURL()` у event-driven WebGPU может вернуть прежний swap-chain
  кадр. Этот файл сохраняет наблюдавшийся срез, но не является единственным
  доказательством текущего compositor output.

## 2026-08-09-live-canvas.png

* Источник: точный `canvas.toDataURL("image/png")` живой страницы
  `http://127.0.0.1:4400/` в выделенном CDP Chrome.
* Дата: 2026-08-09.
* Версия проекта: baseline `378624cfa83d779f6fd9f50c1f81fab5b48fc4de`
  с незакоммиченным срезом `MF-419`.
* Ожидание: ровно 9 нод и 9 реальных transport-рёбер, без старой ноды
  Service Worker, без «Профиля браузера», без зависшей очереди; камера показывает
  весь граф.
* Фактическое наблюдение: фактические 9 нод и 9 рёбер полностью видимы,
  старых incarnation и фальшивой browser-profile ноды нет. При открытом
  инспекторе камера отъезжает избыточно далеко: карточки мелкие, граф прижат к
  нижней левой части доступной области; требуется совместное визуальное решение
  владельца.
* Контрольная сумма: SHA-256
  `b9d98c439d76c8134ded621a54b374f5b8d268b7b51472ed4ec00b99dffed2f9`.
* Ограничение доказательства: последующий аудит показал, что
  `canvas.toDataURL()` у event-driven WebGPU может вернуть прежний swap-chain
  кадр. Этот файл сохраняет наблюдавшийся срез, но не является единственным
  доказательством текущего compositor output.

## 2026-08-09-clean-v15.png

* Источник: прямой composited `Page.captureScreenshot` точного чистого CDP
  target `F0F22B172BA077135383D4F55FB75072` на
  `http://127.0.0.1:4400/`. Старый instrumented target закрыт, внешний WebGPU
  Inspector отключён; в браузере остался один page target.
* Дата: 2026-08-09.
* Версия проекта: baseline `378624cfa83d779f6fd9f50c1f81fab5b48fc4de`
  с незакоммиченным срезом `MF-419`, Service Worker entry v15.
* Ожидание: 9 текущих нод и 9 реальных transport-рёбер, инспектор приложения
  закрыт, диагностический overlay отсутствует, весь граф видим.
* Фактическое наблюдение: `9/9` видны полностью, browser-profile отсутствует,
  справа остался только компактный reopen-stick. Масштаб auto-fit вырос с
  `0.337451` до `0.526027` (примерно на 56%); внешний overlay отсутствует.
  Runtime одновременно сообщил `gap=0`, lifecycle/traffic pending `0`, оба
  startup backlog `0`; browser console пуста.
* Контрольная сумма: SHA-256
  `38fa0892ead23c8715d85210b4270f3e8e475a1ba18bd60c33e629ef384d341a`.

## Живой runtime-профиль v16

* Источник: 17 последовательных CDP-чтений точной root-страницы
  `http://127.0.0.1:4400/` с интервалом 5 секунд, с
  `2026-08-09T03:11:02.729Z` до `2026-08-09T03:12:26.047Z`.
* Активный Service Worker через `Debugger.scriptParsed` подтвердил импорт
  `sw.js?mf419-v16`; внешний WebGPU Inspector отсутствовал.
* За профиль последовательно наблюдались четыре Service Worker incarnation:
  `76a9c30b…`, `331694d4…`, `6d32daa1…`, `d37baf77…`.
* После каждой замены retained state содержал ровно два snapshot: server и
  единственный текущий Service Worker. Завершённые incarnation не накапливались.
* Во всех 17 срезах сцена оставалась `9/9`, sequence gap отсутствовал,
  lifecycle/traffic pending и оба startup backlog были `0`, layout transition
  был завершён, inspector закрыт, viewport scale `0.526027`. Последующее
  1,5-секундное чтение browser console вернуло `0` записей.
