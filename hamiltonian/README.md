# Hamiltonian

Это верхнеуровневый управляющий и peer-contour, выросший из изолированного
опыта `MF-412`. Теперь он входит в root workspace и использует только
presentation-пакеты MetaFor Engine/UI; production Dark, Boundary, Matrix,
Energy и Bulk по-прежнему не подключены. Испытательный peer не утверждает
production-протокол.

## Закон причинного монитора

Стартовая страница Hamiltonian является монитором фактически наблюдённого
runtime, а не картинкой, восстановленной из последнего topology snapshot.
Изменение сцены происходит только вслед за событием настоящего владельца:
сущность наблюдена, transport создан или изменил состояние, сообщение
отправлено либо принято, transport закрыт, incarnation завершена.

В начале выполнения page-кода гарантированы ровно две сущности: Bun server,
который отдал документ, и текущая page realm. Host identity и epoch приходят
вместе с HTML, а page получает новую incarnation до прикладного bootstrap.
Следующим собственным lifecycle-наблюдением page фиксирует текущий user-agent
runtime. В локальном Chrome-контуре это реальная parent-нода `Chrome`, а не
агрегат «Профиль браузера»: page становится её дочерней realm, и наблюдённый
Service Worker входит в тот же parent только после фактического `connect-window`
с browser identity. До этого события Worker не приписывается браузеру заранее.
На loopback запрос `http://127.0.0.1:4400/` сразу возвращает также локальную
join capability внутри этого HTML и не перенаправляет браузер на служебный URL.
Service Worker, WebSocket, MessagePort, Dedicated Worker, OS process,
RTCPeerConnection и DataChannel появляются только после собственных
lifecycle-событий. Heartbeat является сообщением на существующем transport,
а не самостоятельным edge.
После первого наблюдённого рождения transport его terminal-event не стирает
связь, пока оба runtime-endpoint существуют: edge остаётся в текущей проекции
со своей incarnation и состоянием `inactive/closed`. Новое воплощение transport
заменяет этот visual slot; завершение owner или endpoint удаляет уже саму
возможность показать связь.
Физическое закрытие control WebSocket наблюдает и записывает host для точной
socket incarnation. Service Worker включает эту terminal-запись в retained
состояние и передаёт новый host snapshot уже подключённым Window не только
через ранний BroadcastChannel, но и прямо по их MessagePort. Поэтому
остановка/пробуждение Service Worker не может стереть последний наблюдённый
WS: до рождения замены он остаётся `inactive/closed`.
Когда page затем фактически наблюдает завершение прежнего Service Worker,
новый Worker передаёт host исходное page-observation с указанным successor.
Только после проверки этой причинной связи host удаляет завершённый endpoint и
его transport из current retained snapshot; само закрытие сокета никогда не
подменяет событие завершения endpoint. Так закрытый WS не исчезает при
неисправности живого Worker и одновременно не накапливается как история после
реального завершения Worker.

Каждый browser realm первым dependency открывает единственный lifecycle
BroadcastChannel до выполнения приложения. Window entry после этого запускает
app и WebGPU orchestration динамическими импортами: их загрузка не может
задержать создание раннего канала. BroadcastChannel не является
историей: observation сохраняет source incarnation, sequence, event identity
и причинную ссылку. До первого typed subscriber существует только bounded
startup-очередь; первый subscriber забирает её один раз, после чего уже
доставленные observations не удерживаются и позднее не replay-ятся. Отдельного
`edge-traffic` канала нет: движущийся сигнал
строится только из lifecycle-наблюдения реального `message sent/received`.
Новая page сначала получает по направленному MessagePort только retained
snapshot активных сущностей и transport плюс точный causal frontier каждого
owner-source. Исторические сообщения остаются до frontier и не выходят
запоздалой пачкой; последующее live-событие обязано продолжить sequence без gap.

## Текущее переходное состояние

Главное представление topology — живая интерактивная WebGPU-сцена на
`UIDisplay` внутри engine `Space`; отдельный camera-locked `HUD` содержит только
окна управления поверх display. Первый причинный срез материализует server и текущую page
непосредственно из navigation bootstrap. Service Worker, controller,
MessagePort, WebSocket, Dedicated Worker, два Bun process, отдельный WebRTC
peer process, обе стороны RTCPeerConnection и два RTCDataChannel уже переведены
на owner lifecycle. Одно сообщение Oracle/Force получает общую
identity для send и receive. Полный compound graph передаётся собственному
TypeScript engine в отдельном browser layout Worker; отдельного серверного
layout или routing engine у монитора нет.

Обе `RTCPeerConnection` остаются самостоятельными lifecycle-нодами. Текущая
page и `Service Worker` являются соседними realm внутри наблюдённого
user-agent runtime (`Chrome` в текущем контуре). Page остаётся собственным
owner-контейнером: в ней находится наблюдённый Window `main`, в `main` вложен
browser connection, а созданный page `Dedicated Worker` находится рядом с
`main` внутри page. Server connection вложен в `Peer process`. Вложенность
Chrome появляется из browser lifecycle identity и не превращается в линию.
Единственные рёбра между RTC — два наблюдённых `RTCDataChannel`; их direction
не зависит от выбранной стороны socket.

Физически host держит ровно один listener. Control WebSocket (`ws:` на
локальном HTTP contour, `wss:` только при TLS) переносит bootstrap-состояние,
heartbeat, election и WebRTC signaling. Realtime payload по нему запрещён
валидатором. После знакомства один `RTCPeerConnection` имеет
два нативных ordered/reliable DataChannel: `oracle` для request/response и
`force` для последовательности событий. Эти имена — только испытательные lane,
а не перенос действующих Oracle RPC и Force MetaFor.

Серверный peer и две lifecycle-роли — обычные OS process через `Bun.spawn` и
IPC. Bun Worker для воплощений не используется. Отдельный browser layout Worker
является только вычислительным адаптером и не становится lifecycle-нодой.
Дочерние процессы не открывают собственного
фиксированного HTTP/WebSocket server; WebRTC peer использует временные ICE/UDP
endpoints. На loopback listener серверная сторона работает в ICE-lite:
локально достижимый host candidate не ждёт внешний STUN. Для нелокального
listener эта оптимизация не включается. Режимы placement взаимоисключающие: в `browser` Bun-роли называются
`main-probe` и `worker-probe` и не получают authority; в `server` authority
получает только Bun `main`, а Window leader не избирается.

## Страница оркестрации

`nodes` владеет generic node-system document, validation и layout adapter.
`@nodes/ui` владеет intrinsic card measurement, transform бесконечного
2D-холста, selection, Inspector и WebGPU surfaces.
`@nodes/layout` владеет только pure TypeScript geometry engine и минимальным
`LayoutGraph → LayoutResult` протоколом. Hamiltonian адаптирует собственные
наблюдения в UI-модель и добавляет только уже существующие lifecycle actions.
Generic `parentId` задаёт только визуальный контейнер и не сообщает пакету
предметный смысл ownership. В браузерной части Hamiltonian выставляет его для
наблюдённых `page`, `service-worker`, `window-main`, `dedicated-worker` и
`rtc-peer`, чей фактический `ownerId` уже присутствует в текущей причинной
проекции. Сам `browser-runtime` становится root owner только после
page-наблюдения, а Service Worker получает его как parent только после
направленного `connect-window`.

Серверная часть собрана в отдельный presentation-only контейнер `Сервер`. У
него нет параметров, transport-сокетов и действий; он не является lifecycle
entity или endpoint. Внутри находятся фактический Bun host Hamiltonian и
принадлежащие ему Bun/peer OS processes, а серверный `RTCPeerConnection`
остаётся внутри своего `Peer process`. Все transport продолжают заканчиваться
на фактических runtime-нодах, поэтому визуальная группировка не меняет
причинную проекцию.

Диагностическое пересоздание локального MessagePort не показывается в
Inspector: тихий канал и смена Service Worker controller уже восстанавливаются
автоматически, а legacy-кнопка остаётся только на резервном debug-экране.

Graph surface является бесконечным 2D-холстом внутри `UIDisplay`. Engine
`ViewPoint` управляет наблюдением самого дисплея в `Space`; graph pan/zoom
меняет только `canvasTransform = {x, y, scale}` внутри дисплея и не двигает
ViewPoint. Inspector и окно «Вид холста» являются отдельными HUD-окнами поверх
display: их открытие, закрытие, перенос и resize не меняют layout нод,
canvas transform или pose ViewPoint. Заголовок Inspector показывает title
выбранной ноды, подзаголовок — её kind. В закрытом состоянии остаётся только
узкий HUD-стик; выбранная нода при этом не теряется. Нажатие на ноду только
меняет selection и содержимое Inspector, но не открывает его: окно открывается
только отдельным HUD-стиком. Title bar Inspector использует стандартную высоту
`HudWindow`, без отдельного увеличенного отступа под subtitle. Отдельный стик «Холст»
открывает toggle авто-вписывания и разовую кнопку «Показать весь граф».

Нодовая геометрия следует существующей Blender-derived дизайн-системе
владельца, а не отдельному стилю Hamiltonian. MetaFor Engine сначала точно
измеряет текст загруженного TrueType-шрифта, затем общий Flex plan определяет
intrinsic card size и позиции sockets. Main-thread adapter передаёт одному
долгоживущему layout Worker только viewport/spacing, измеренные node sizes,
port offsets и semantic edge endpoint IDs. Текст, facts, actions, Flex и
`NodeSystemDocument` границу Worker не пересекают. Worker возвращает
`LayoutResult`, а `nodes` связывает IDs с исходным document без post-routing. Новая
topology generation отменяет ожидание устаревшего ответа, а ошибка Worker не
включает скрытый синхронный fallback на main thread.
Navigation-ноды и каждое последующее добавление либо удаление ноды проходят
через один и тот же полный layout. Готовый browser bundle собирается один раз
при старте host incarnation, а не внутри первого запроса страницы. Engine сам
вычисляет responsive layered placement, compound sizes, generated WEST/EAST
gateways и окончательные orthogonal sections между exact parameter sockets.
Единственный layout spacing равен фактическому шагу центров соседних портов
карточки и применяется к compound padding, node-node, edge-node, edge-edge и
port-port расстояниям. Правило одинаково для горизонтальных и вертикальных
участков. Пустой промежуток занимает один pitch, а corridor с одной линией
между двумя нодами — два pitch: по одному от линии до каждой ноды. Несколько
линий расширяют только фактически занятый corridor. Так
internal transport не превращается в self-loop внешнего контейнера и не
прижимается к его рамке. WebGPU compositing также учитывает containment:
owner background рисуется под проходящим внутри него маршрутом, а foreground и
дочерние карточки — над маршрутом. Поэтому `Worker messaging` и участки
RTCDataChannel от вложенного RTC до границы owner не исчезают под parent fill.
Несвязанные реальными transport компоненты упаковываются тем же engine: в узком
graph viewport сверху вниз и слева направо, в широком — слева направо.
Ложная ownership-связь ради раскладки не создаётся. Предыдущая раскладка
используется только как начальный кадр: surviving nodes за 320 ms плавно
перемещаются в новые координаты. Положение и размер каждого compound owner
интерполируются вместе со всей containment-цепочкой; новый потомок сначала
отображается в соответствующей локальной области прежнего owner и ни в одном
промежуточном кадре не выходит за его границу. Пока авто-вписывание включено,
canvas transform на каждом кадре показывает весь
движущийся graph на полном display. HUD-окна из расчёта display rect исключены.
Новая page incarnation не читает старые coordinates или widths.
Telemetry-only update прежнего размера сохраняет текущую geometry и canvas
transform без повторного layout.
Реальная замена runtime incarnation не подменяется стабильной identity. Но
если новый layout result занимает те же visual frames и bounds, документ и
transport identity обновляются без layout transition и auto-fit. Поэтому
штатное завершение и пробуждение Chrome Service Worker не вызывает
периодического сдвига всего графа с возвратом.

Ноды остаются отдельно выбираемыми для Inspector, но Hamiltonian не разрешает
ручное изменение их geometry: позиции, compound sizes и endpoints принадлежат
TypeScript engine. Панорамирование и масштабирование изменяют только transform
бесконечного холста. Renderer не заменяет orthogonal route свободной кривой:
он лишь локально скругляет каждый готовый waypoint cubic Bézier segment.

Новая page incarnation не наследует старый canvas transform. Первый graph и
каждое добавление ноды автоматически вызывают fit всей текущей топологии: по
мере старта runtime уменьшается scale и смещается холст, поэтому все уже
появившиеся ноды остаются видимыми внутри `UIDisplay`. Пространственный
ViewPoint при этом не меняется.
Положение, раскрытие и selection инспектора также не восстанавливаются между
загрузками: пустой инспектор стартует закрытым и открывается только после
выбора ноды, поэтому не уменьшает первое display-window холста.
Первый ручной pan/zoom выключает авто-вписывание для этой page incarnation,
поэтому последующие topology transitions перемещают ноды, но не холст. Явный
toggle в окне «Вид холста» возвращает авто-режим; «Показать весь граф» выполняет
один fit без обязательного включения авто. Telemetry-only update canvas
transform не сбрасывает. Изменение размера `UIDisplay` вызывает новый fit только
при включённом авто-режиме; в ручном режиме полный `{x, y, scale}` остаётся
собственностью пользователя. Обычный drag пустого места строит selection rectangle;
два пальца на trackpad плавно перемещают холст, pinch масштабирует его вокруг
cursor, а pointer-pan остаётся на Alt-drag или
средней/правой кнопке.

Host и Service Worker удерживают не историю traffic, а компактное текущее
состояние lifecycle: последнюю активную entity/transport observation и
sequence frontier каждого source. Новая Window сначала получает эти snapshot
по направленному `MessagePort`, затем принимает live-продолжение через
BroadcastChannel. Snapshot сохраняет исходные event identity, но не повторяет
сообщения до frontier. Incarnation-aware cursor обнаруживает настоящий разрыв
после frontier, а duplicate и событие прежнего source не откатывают сцену.
Когда owning entity наблюдается завершённой, retained snapshot этой incarnation
сразу удаляется: поздний subscriber не получает структуру уже умершего runtime.
Её active sequence frontier и structural records также удаляются. От очень
поздней доставки защищает не бесконечная история, а bounded recent tombstone:
cursor удерживает последние 512 завершённых source identity, проекция — до
2048 завершённых entity и до 2048 transport identity. Эти границы не обрезают
активное состояние или настоящий gap.
Более новый snapshot заменяет покрытую им структуру: отсутствующая в нём
entity или transport больше не считается активной. Capacity не обрезает
структуру молча, а останавливает неверный bootstrap явной ошибкой. Эта
шина не переносит token, resume capability, SDP/ICE, RPC или Particle и не
заменяет control WebSocket, Bun IPC либо прямые `oracle`/`force` DataChannel.

### Живой поток сообщений

Каждое фактически наблюдаемое сообщение на показанном канале рождает одно
короткоживущее presentation-событие для соответствующего edge. В browser realm
оно приходит как обычное lifecycle-наблюдение в самой ранней точке успешного
send или принятого receive. Если точный transport с теми же двумя концами ещё
не наблюдён активным, сообщение не рисуется и направление не угадывается. Общий
dependency-модуль создаёт lifecycle
`BroadcastChannel` до выполнения прикладного тела Window, Service Worker и
Dedicated Worker. Второго сетевого или browser-канала для картинки сообщения
нет.

Bun process не разделяет browser-origin BroadcastChannel. Поэтому каждый
дочерний процесс сам создаёт incarnation-aware lifecycle journal и отправляет
его host через существующий IPC boundary. Host проверяет envelope и передаёт
его без смены event identity; Service Worker публикует его в browser channel.
Payload, token, SDP/ICE, RPC params/result и Particle content не копируются.
Send и receive одного прикладного сообщения используют общий message identity,
а сами observation envelopes повторно не наблюдаются.

Одно принятое событие рисуется одной движущейся частицей в направлении
сообщения. Её градиентный хвост лежит на фактическом Bézier route и сохраняет
semantic color edge. Render-on-demand временно запрашивает кадры только пока в
сцене есть живые частицы; в покое постоянного animation loop нет. Частицы
обновляются в retained presentation-layer и не пересобирают ноды, текст и
рёбра на каждом кадре. Все головы и сегменты используют одну неизменяемую
unit-геометрию, а attachment views полноэкранного WebGPU renderer переиспользуются
между кадрами. При скрытии Window анимация и её кадры немедленно прекращаются.

До первой routed topology Hamiltonian удерживает только последнее ещё живое
traffic observation каждого edge, а не историю ранних сообщений. Поэтому
повторные сообщения одного transport до появления route заменяют друг друга и
не выходят запоздалой пачкой. Каждое observation сохраняет настоящее время
наблюдения; сразу после установки первого routed layout последний живой сигнал
показывается уже в причинно соответствующей времени точке пути, а истёкший
удаляется. После открытия readiness gate новые observations передаются surface
немедленно с исходным временем.

Retained frontier и уже находящееся в стартовой очереди его live-продолжение
сначала сводятся к одному актуальному document в конце той же микрозадачи, и
только затем запускают первый layout. Это не добавляет debounce или таймер и не
задерживает последующие live-события, но не позволяет синхронной стартовой
очереди заведомо запустить раскладку уже устаревшего snapshot.

## Общие законы опыта

`core/runtime.js` не зависит от платформы и задаёт:

* раздельные identity: стабильный `deviceId`, `hostEpoch`, физический
  `connectionId`, `sessionEpoch`, incarnation процесса/страницы/Worker;
* lease с уникальным ID и возрастающим fencing token, поэтому прежний лидер не
  может продолжить main после handoff или restart host;
* один transport router на входе и отдельные очереди, byte/frame limits и
  backpressure для `oracle` и `force`;
* request timeout, явную отмену вызывающей стороной и cancellation при потере
  session;
* per-lane и Force-event sequence: backpressure не расходует номер, а gap,
  чужой `sessionEpoch` или потеря одной lane fail-closed завершают всю peer
  session;
* детерминированный reconnect policy.

Service Worker координирует только данный browser origin и сообщает host
все живые Window через `clients.matchAll()`. Сам host выдаёт глобальный lease,
поэтому одновременно main запускает не более одного Window даже при разных
браузерах и устройствах. Dedicated Worker остаётся per-Window и не считается
singleton.

Предметная сущность этого контура — один зарегистрированный Service Worker
Hamiltonian. Браузер может остановить и позднее заново создать его внутреннее
JS-исполнение; это не рождает второй Service Worker и не меняет его стабильную
`identity`. Identity создаётся страницей один раз для browser origin, а
control bootstrap (`deviceId`, token, resume capability, host и готовность
Push) хранится Service Worker в Cache Storage. Внутреннее исполнение имеет
отдельный диагностический `runtimeIncarnation`, но не образует отдельную ноду.

PushSubscription и VAPID identity хранятся Bun в локальном игнорируемом
`.metafor/hamiltonian-web-push.json` с правами `0600`. Явно заданные
`HAMILTONIAN_VAPID_PUBLIC_KEY`, `HAMILTONIAN_VAPID_PRIVATE_KEY` и
`HAMILTONIAN_VAPID_SUBJECT` имеют приоритет. По пользовательскому действию
страница запрашивает Notification permission и подписывает тот же
зарегистрированный Service Worker с `userVisibleOnly: true`. При явном
пробуждении Bun отправляет один стандартный Web Push; Service Worker показывает
одно уведомление о результате и восстанавливает control WebSocket без Window.
Web Push не используется как частый скрытый heartbeat.

Page передаёт полученную `PushSubscription` своему Service Worker. Только уже
идентифицированный control WSS регистрирует её у Bun: сервер берёт worker и
device identity из самого socket, а не из заявленных Page полей. Отдельного
HTTP endpoint регистрации подписки нет. После restart Bun сохраняет прежние
VAPID identity и подписку, а зашифрованный Push передаёт Service Worker свежие
host identity и bearer capability нового процесса. Стабильная resume capability
Service Worker остаётся в его Cache Storage.

Каждое пробуждение получает уникальные `wakeId` и скрытый одноразовый
`wakeProof`. Bun вооружает ожидаемое доказательство до асинхронной отправки,
поэтому быстрый Push не может обогнать server state. Новый control socket
подтверждает оба значения вместе со стабильной identity и текущим
`runtimeIncarnation`; значение `wakeProof` не публикуется через status или
HTTP response. После проверки Bun фиксирует `push-reconnect-confirmed` и
отправляет Worker обратный `wake-confirmed`. Только этот ACK разрешает Worker
показать уведомление об успешном восстановлении. После получения Push Worker
ждёт этот ACK 30 секунд и при таймауте показывает локальную ошибку. Bun держит
ожидаемое доказательство 90 секунд: это отдельное серверное окно, включающее
TTL доставки Push и запас на новый WSS. Потеря Push или отсутствие причинного
reconnect до конца этого окна становятся серверной ошибкой той же ноды.
Закрытый WebSocket при готовом
Push означает `standby`, а не смерть Service Worker. На локальном HTTP contour
используется `ws:`, на доверенном HTTPS — `wss:`. Возобновление прежнего
lease/fence допустимо только с той же identity, device и resume capability до
`expiresAt`; потерянный signaling не выдаётся за восстановленный.

Открытая Hamiltonian Page для Push не требуется, но desktop Chrome должен
фактически продолжать принимать push-service traffic. На проверенном macOS
профиле цепочка подтверждена при `0` Hamiltonian Page/Window clients и пустом
окне Chrome. При `0` окон Chrome тот же живой browser process дважды не
доставил Push до TTL; поэтому строгий zero-window режим нельзя объявлять
поддержанным без включённого background mode и отдельного live-подтверждения.

Host начинает causal heartbeat первым `ping` после открытия control WebSocket.
Следующий challenge назначается только после `pong` с точным текущим sequence;
чужой или опережающий ACK закрывает соединение fail-closed. Такой round trip
доказывает доступность текущего внутреннего исполнения и WebSocket в момент
ответа, но не удерживает обычный web Service Worker запущенным. Lifecycle строит
одну ноду `Service Worker`: `Identity` остаётся стабильной, `Исполнение` может
смениться, `Push` сообщает `ready / sent / received / failed`, а `Heartbeat` —
состояние текущего WSS. В целевой модели нет отдельной ноды или подписи
`ServiceWorkerGlobalScope`.

Versioned module загружается с bearer token, проверяется по фактическим bytes
через SHA-256 и кладётся в Cache Storage. При чтении cache bytes хешируются
заново; одному заголовку доверия нет. Хранятся текущая и одна rollback-версия.
Активный main получает другую версию только после настоящего page reload.
Follower без main может принять уже импортированный актуальный module и позже
родить main без повторного reload из-за прежнего persisted fingerprint.
Dedicated Worker и Bun process проходят cold rebirth: прежнее воплощение
завершается до нового. Одинаковые source bytes и SHA-256 используются во всех
оболочках.

Dedicated Worker перед live-продолжением передаёт своей page направленный
retained lifecycle snapshot с causal frontier. При `Worker.terminate()` именно
page как владелец Worker handle причинно фиксирует `Worker messaging closed`,
затем `Dedicated Worker ended`. Финальная BroadcastChannel-публикация уже
завершаемой worker realm остаётся дополнительным наблюдением, но не является
единственным доказательством завершения.

При штатной остановке Bun process сам закрывает IPC и завершает свою entity.
После аварийной смерти он уже не может отправить это событие, поэтому host как
владелец OS process handle наблюдает `child.exited`, сначала фиксирует закрытие
точной IPC incarnation, затем причинно связанное завершение process entity и
рождает новое воплощение. В server placement перед таким rebirth обязательно
выдаётся новый fencing token; прежняя authority больше не принимается.

Встроенные SVG-иконки используют `data:` source и browser fallback через
временный `blob:` URL. Поэтому CSP Hamiltonian разрешает `blob:` только в
`img-src`; `script-src`, `connect-src` и остальные директивы этим не
расширяются.

## Запуск

Локально:

```bash
cd /Users/zavx0z/repozitarium/metafor/hamiltonian
HAMILTONIAN_TOKEN=local-test HAMILTONIAN_VERSION=v1 bun run start
```

Открыть `http://127.0.0.1:4400/`. Listener сам выполняет локальный join, а
страница сразу возвращает адресную строку к корневому URL. Для другой версии
host запускается с тем же identity/token и новым `HAMILTONIAN_VERSION`;
управляемая страница подготавливает cache и выполняет reload.

Локальный host наблюдает изменения browser/public/core, `pkg/nodes` и `pkg/ui`
source.
После 120 ms debounce он сначала успешно пересобирает orchestration, layout
Worker и Service Worker bundles и только затем отправляет controlled pages
новую source revision по текущему control socket. Страница сохраняет принятую
revision в `sessionStorage` и перезагружается для неё ровно один раз; повторное
сообщение не создаёт reload-loop, а failed build не перезагружает UI. Самая
первая регистрация Service Worker может один раз показать `reload required`:
этот bootstrap reload нужен для получения controller и не является source
auto-update.

По умолчанию используется `HAMILTONIAN_PLACEMENT=browser`. Для server-only
проверки без браузера:

```bash
HAMILTONIAN_PLACEMENT=server \
HAMILTONIAN_TOKEN=local-test \
bun run start
```

Каждый cold rebirth server `main` получает новый fencing token/lease; прежний
authority envelope после этого отвергается лабораторным acceptance gate.

Для другого устройства нужен доверенный HTTPS. Изолированный тестовый CA и
сертификат на 30 дней создаются без изменения trust store Mac:

```bash
cd /Users/zavx0z/repozitarium/metafor/hamiltonian
bun run tls:create
HAMILTONIAN_HOST=0.0.0.0 \
HAMILTONIAN_PORT=4400 \
HAMILTONIAN_TOKEN=replace-with-a-test-secret \
HAMILTONIAN_VERSION=v1 \
HAMILTONIAN_TLS_CERT=.tls/server-cert.pem \
HAMILTONIAN_TLS_KEY=.tls/server-key.pem \
bun run start
```

Private keys остаются в Git-ignored `.tls/`. Для Android сертификат CA —
`.tls/hamiltonian-ca.cer`. После опыта пользовательский CA нужно удалить с
устройства. `adb reverse tcp:4400 tcp:4400` может дать Android адрес
`https://localhost:4400`, но прямой LAN path также проверен.

Для первого Web Push выбрать ноду `Service Worker` и действие «Настроить Web
Push» (или одноимённую кнопку диагностической страницы), затем разрешить
уведомления Chrome. То же действие доступно клавиатурой через `⌥P`, чтобы
permission prompt не зависел от масштаба canvas. VAPID identity и подписка
автоматически сохраняются в Git-ignored
`.metafor/hamiltonian-web-push.json`; private key не возвращается через
`/lab/status`. Для внешнего управления ключи можно задать переменными
`HAMILTONIAN_VAPID_PUBLIC_KEY`, `HAMILTONIAN_VAPID_PRIVATE_KEY` и
`HAMILTONIAN_VAPID_SUBJECT`.

При одной зарегистрированной подписке явное пробуждение запускается так:

```bash
curl -X POST https://127.0.0.1:4400/lab/wake-service-worker \
  -H 'authorization: Bearer replace-with-a-test-secret' \
  -H 'content-type: application/json' \
  -d '{}'
```

Ответ содержит `wakeId`. `/lab/status` затем должен показать причинную пару
`push-sent` и `push-reconnect-confirmed` для того же `wakeId`.

`GET /lab/status` требует тот же bearer token и отдаёт bounded observability:
listener, host epoch, lease/fence, server incarnations, connection/challenge
ACK, peer channels/counters и signaling counters. Join token не является
production identity/auth design: он хранится в browser storage и присутствует
в URL WSS, поэтому стенд нельзя выставлять в Internet.

## Проверки

```bash
cd /Users/zavx0z/repozitarium/metafor
bun test hamiltonian
bun test pkg/nodes hamiltonian/browser/orchestration
bun run typecheck
cd /Users/zavx0z/repozitarium/metafor/hamiltonian
bunx tsc --ignoreConfig --noEmit --strict --module preserve \
  --moduleResolution bundler --target es2022 --types bun,@webgpu/types \
  --allowImportingTsExtensions --allowJs --skipLibCheck \
  ../types/module.d.ts types.d.ts *.ts peer/*.ts soak/*.ts
bun build public/app.js public/embodiment-worker.js \
  --outdir /tmp/hamiltonian-build-check --target browser \
  --external /core/monitor.js \
  --external /core/lifecycle.js \
  --external /core/runtime.js --external /core/cache.js \
  --external /core/browser-control.js --external /core/orchestration.js
bun build public/window-entry.js public/embodiment-worker-entry.js \
  --outdir /tmp/hamiltonian-entry-build-check --target browser \
  --external /core/monitor.js --external /app.js --external /orchestration.js \
  --external /embodiment-worker.js
bun build browser/service-worker.ts --target browser --format esm \
  --sourcemap=inline \
  --outfile /tmp/hamiltonian-entry-build-check/sw-entry.js
bunx tsc --ignoreConfig --noEmit --strict --module preserve \
  --moduleResolution bundler --target es2022 --lib es2022,webworker \
  --allowImportingTsExtensions --allowJs --skipLibCheck \
  browser/service-worker.ts types.d.ts

HAMILTONIAN_TOKEN=local-test \
  bun run soak/run.ts http://127.0.0.1:4400
```

Автоматические проверки покрывают один listener, TLS-neutral HTTP surface,
auth/hash/cache, Bun process birth/rebirth, automatic crash repair и concurrent rebirth, global
election/fencing, stale MessagePort generation, reconnect, две независимые
logical lane, frame/queue backpressure, ordering/gap, RPC timeout/session loss,
caller-driven RPC cancellation, WSS resume без смены logical authority, RTC
repair с новой peer generation, stale session rejection, запрет realtime на
WSS, browser/server placement и прямой Bun↔Bun WebRTC через `werift`.
Отдельные `nodes`, `@nodes/layout`, `@nodes/ui` и orchestration fixtures проверяют
ссылки node graph, Worker parity, детерминированный placement,
точные Flex/card metrics, полный
compound layout при add/remove и при смене landscape/portrait,
fit/pan/zoom/selection, Bézier rounding готового engine route, многоуровневую
ациклическую visual containment без ownership-edge и реальные
descendant-to-descendant edge sections, разделение message
direction и стороны socket, control WSS, BroadcastChannel и direct
Oracle/Force lines, общий cursor для directed initial и BroadcastChannel live,
monotonic projection revision и сохранение geometry при telemetry-only update.

Живая матрица и исходные JSON/screenshot находятся в
[`project/artifacts/MF-412`](../project/artifacts/MF-412/README.md). На
2026-08-08 проверены macOS Chrome, Yandex и Safari, Android Chrome и Yandex,
несколько вкладок, handoff лидера, полный quit/reopen browser process,
force-stop Android и screen-off.

Двухминутный Chrome open-tab soak v11 сохранил все 9 raw samples: две
подтверждённые смены non-null Worker incarnation, пять изменений физического
WSS-состояния и три detached-пробы при неизменных lease/fence и peer/session;
heartbeat вырос на 9, обе realtime lane — на 12, control relay остался 0.
Этот live-прогон был выполнен до переименования испытательной RPC lane, поэтому
raw evidence честно сохраняет прежние wire-name и имя счётчика. Он доказывает
восстановление control и прямой двухканальный carrier, но не является
live-приёмкой нынешнего browser adapter с lane `oracle`. Текущий `oracle` path
дополнительно принят свежим Chrome-прогоном v12: host status фиксирует channels
`oracle`/`force`, рост обоих счётчиков и нулевой realtime relay через control
WSS; DOM и screenshot показывают успешные Oracle response и Force echo.
Исходные файлы находятся в `project/artifacts/MF-412`. Более ранняя сводка v9
остаётся только историческим evidence.

## Границы доказанного

* Обычный web Service Worker может создать WebSocket, но не является daemon.
  При закрытии всех страниц прежний TCP/TLS/WSS физически исчезает. Стандартный
  Web Push пробуждает зарегистрированный Service Worker и восстанавливает новый
  WSS как продолжение той же identity; тот же socket не восстанавливается.
  При полном завершении browser process доставка ждёт следующего запуска
  браузера и политики его push service.
* Android Yandex потерял соединение через 30 секунд screen-off. Chrome Android
  закрыл его почти сразу после последней Window. Chrome macOS сохранял WSS на
  пятой секунде без Window, Safari закрыл позднее. Это измерения версий, не
  переносимый lifetime contract.
* Safari выполнил peer proof, видимый со стороны host, но DOM не автоматизирован:
  в Safari отключён Allow Remote Automation.
* Bun 1.3.14 не предоставляет native `RTCPeerConnection`; стенд использует
  `werift@0.24.3`. Совместимость production-платформ, remote ICE, STUN/TURN,
  trust/authorization и migration MetaFor этим опытом не решены.
* `RTCPeerConnection` в browser создаётся в Window. Опыт не утверждает перенос
  RTCDataChannel в Service Worker и не предполагает, что WebRTC разбудит
  завершённый Worker.
* Live JSON и screenshots v7—v11 относятся к прежнему имени RPC lane и не
  переписываются задним числом. Текущий `oracle` label отдельно доказан
  свежими v12 status, DOM и screenshot.
* Production Dark, Boundary, Matrix, Energy, Bulk и их State не подключены.
  Hamiltonian здесь проверяет placement/lifecycle/signaling, а не становится
  realtime causal coordinator.
