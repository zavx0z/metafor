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

### Декларация нодовой системы каждого контура

Причинный монитор собирается из текущих деклараций Hamiltonian-контуров. Каждый
независимо авторитетный контур публикует одну текущую
декларацию своего участка нодовой системы: стабильную logical contour identity,
incarnation, exact root, монотонную revision/frontier и принадлежащие root
entity и transport. Это единый lifecycle contract, а не отдельная обработка
Service Worker, RTCPeerConnection или любого другого вида ноды.

Новая incarnation того же logical contour атомарно заменяет прежнюю без
обязательной перезагрузки страницы. Декларации разных действующих контуров могут
сосуществовать, но две incarnation одного контура не образуют две части общей
сцены. После принятия replacement старое ownership-поддерево, его transport и
causal frontier больше не входят в текущий node-system document. Exact source,
который прямо присутствует в successor declaration, продолжает свой causal
поток и не завершается только из-за смены incarnation самой декларации; source,
которого successor больше не объявляет, остаётся superseded.

Материализация объединяет только текущие валидные декларации. У каждой видимой
некорневой entity должен быть видимый exact owner; межконтурная связь допустима
только через явно проверенную boundary identity. Отсутствующий root или owner,
stale incarnation, non-monotonic revision/frontier и частичное смешение прежней
и новой декларации отклоняются до presentation. Presentation и `@nodes/layout` не
угадывают parent, не синтезируют пропущенный контур и не поднимают orphan на
корень.

Для server contour и его browser/profile boundary первый enforcement этого
закона реализован и проверен offline и на exact-target live contour: новая host
incarnation заменяет прежнее серверное поддерево, а exact current WSS и
Oracle/Force DataChannel остаются связаны с current endpoints. При неизменном
browser artifact set page не перезагружается; stale snapshot и live event не
возвращают прежнюю incarnation. Это доказательство относится к prototype
server/browser-контуру и не означает автоматического применения закона к новым
clean-room контурам: применение к каждому новому контуру оформляется отдельной
точной работой.

В начале выполнения page-кода гарантированы ровно две сущности: Bun server,
который отдал документ, и текущая page realm. Host identity и epoch приходят
вместе с HTML, а page получает новую incarnation до прикладного startup.
Следующим собственным lifecycle-наблюдением page фиксирует текущий user-agent
runtime. В локальном Chrome-контуре это реальная parent-нода `Chrome`, а не
агрегат «Профиль браузера»: page становится её дочерней realm, и наблюдённый
Service Worker входит в тот же parent только после фактического `connect-window`
с browser identity. До этого события Worker не приписывается браузеру заранее.
На loopback запрос `http://127.0.0.1:4400/` сразу возвращает также локальную
join capability внутри этого HTML и не перенаправляет браузер на служебный URL.
Service Worker, Service Worker API, WebSocket, Dedicated Worker, OS process,
RTCPeerConnection и DataChannel появляются только после собственных
lifecycle-событий. Heartbeat является сообщением на существующем transport,
а не самостоятельным edge.
После первого наблюдённого рождения transport его terminal-event не стирает
связь, пока оба runtime-endpoint существуют: edge остаётся в текущей проекции
со своей incarnation и состоянием `inactive/closed`. Новое воплощение transport
заменяет этот visual slot; завершение owner или endpoint удаляет уже саму
возможность показать связь.
Физическое закрытие control WebSocket наблюдает и записывает host для точной
socket incarnation только после успешного сообщения `identity`: параметры
`device`, `worker` и `transport` в URL являются заявкой на маршрут, а не
доказательством существования Service Worker. Сокет, закрытый до подтверждения
identity или отклонённый при проверке Web Push, не может создать либо обновить
Service Worker и его transport в retained lifecycle. Service Worker отклоняет
browser WebSocket только через private application code `3000–4999`
и UTF-8 reason не длиннее 123 bytes; после начала такого закрытия он больше не
принимает с этого socket identity либо application traffic. Нормальное закрытие
заменённого socket использует `1000`, а server-side close contract от этого не
меняется. Service Worker включает подтверждённую terminal-запись в retained
состояние и передаёт новый host snapshot уже подключённым Window через
`WindowClient.postMessage` единого Service Worker API transport. Поэтому
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
Новая page сначала получает по единому Service Worker API transport retained
snapshot активных сущностей и transport плюс точный causal frontier каждого
owner-source. Исторические сообщения остаются до frontier и не выходят
запоздалой пачкой; последующее live-событие обязано продолжить sequence без gap.
Каждая page realm через `ServiceWorker.postMessage` того же transport передаёт Service Worker свой
incarnation-bound retained journal и его live-продолжение. Service Worker
объединяет только journal точного подключённого page-source и направленно
возвращает общий snapshot всем подключённым Window через
`WindowClient.postMessage`. Поэтому все одновременно
открытые вкладки одного Chrome наблюдают один и тот же набор page realm, а
новая вкладка получает уже открытые страницы без попытки восстановить их из
host topology. Закрытие или перезагрузка page завершают прежнее ownership-
поддерево до закрытия Service Worker API transport; наблюдённое исчезновение browser client
является резервным terminal-наблюдением Service Worker.
Первый локальный subscriber page realm сам забирает bounded startup-очередь,
поэтому после рождения `browser → page → window-main` он публикует в своей
realm точный retained snapshot с causal frontier. Параллельно загружающаяся
orchestration начинает live-продолжение после этого frontier и не принимает
нормальные стартовые события за потерянные `1…3`.
Стабильный scope этого aggregate snapshot переживает остановку исполнения
Service Worker, поэтому новая execution получает revision-базу из собственного
`startedAt`, заведомо новее предыдущего исполнения. Следующая версия одного
scope авторитетно заменяет ранее перечисленный этим scope состав и удаляет
отсутствующие page realm даже тогда, когда новый Worker уже не мог наблюдать их
старый source frontier.
Reload одной вкладки не смешивается с клонированием её `sessionStorage` в новую
вкладку: только `pagehide` одноразово записывает incarnation фактического
предшественника, а следующий document того же browsing context читает и сразу
удаляет это доказательство. Service Worker может заменить ещё видимый старый
`WindowClient` только при точном совпадении predecessor; без него прежняя
защита от двух живых вкладок с одним `tabId` остаётся fail-closed.

Живые heartbeat и другие обновления фактов не должны голодать раскладку. Если
новая lifecycle-ревизия сохраняет тот же структурно-геометрический ключ, она не
отменяет уже выполняющийся Layout Worker request: расчёт завершается один раз,
после чего на готовую геометрию накладываются самые свежие факты. Только реально
изменившийся ключ или viewport делает выполняющуюся раскладку устаревшей.
Exact `width × height` входит в ключ даже внутри одной ориентации: после 120 ms
без новых resize events Hamiltonian запускает один полный layout для финального
viewport и не принимает рассчитанную для промежуточного размера geometry.

Новый execution Service Worker не объявляет первый подключившийся page snapshot
полным составом браузера. Перед публикацией авторитетного stable-scope snapshot
он перечисляет все живые `WindowClient`, просит каждый отсутствующий client
повторить `connect-window` через Service Worker API и ждёт, пока exact client ids представлены в
реестре в пределах bounded grace. Повторные запросы одному client в течение
этого grace схлопываются. Неответивший чужой `WindowClient` не закрывает уже
доказанный текущий Service Worker API transport: после grace snapshot строится из фактически
ответивших page journals, а возобновившийся client снова присоединяется своим
обычным `connect-window`. Поэтому перезапуск execution не превращает
последовательное переподключение вкладок во временное удаление ещё живых page
realm и не останавливает heartbeat здоровой страницы из-за BFCache или
неисполняемого client.

Page и Service Worker используют один двусторонний Service Worker API transport:
page отправляет `connect-window`, heartbeat и остальные сообщения через
`ServiceWorker.postMessage`, а Worker отвечает через `WindowClient.postMessage`.
Обе механики являются двумя направлениями одного браузерного API, поэтому у
каждой endpoint-ноды это одна строка `Service Worker API`: её входной сокет
находится слева, выходной — справа. Направления остаются двумя отдельными edge:
page → Service Worker и Service Worker → page. Каждые 500 мс `window-heartbeat` проходит через стандартное
Service Worker event delivery и действительно пробуждает остановленное
execution. Точный `WindowClient`, `tabId`, page incarnation и message identity
проверяются в Worker; `worker-state` возвращается по тому же логическому
transport.

## Стандартная Window-среда clean-room loader

Неизменяемый startup запускает один активный release и не знает состав
`internal` packages. `@release/main` разворачивает Window-контур и загружает
`@internal/visual` как самостоятельный artifact через универсальный `/code`.
Visual хранится в cache owner `internal` и обновляется отдельно от bytes
`@release/main`. `@release/service` разворачивает сменяемый Service Worker-контур,
владеет RPC transport и подготовкой следующего release.

Startup fetch-handler направляет стабильный package URL в cache владельца
namespace: `@release/*` — `release`, `@internal/*` — `internal`, `@metafor/*` —
`metafor`. Состав пакетов ему неизвестен: отдельного реестра имён или ветки для
Visual в handler нет.

Постоянный Cache Storage называется только по владельцу: `startup`, `release`,
`internal` или `metafor`; последний появляется только вместе с первым package
среды. Release может подготовить группу в технических transaction caches, но
они не являются поколениями active release. После проверки responses release
сохраняет каждый exact versioned endpoint в каноническом cache его владельца,
одним active-state write открывает всю группу и удаляет transaction caches и
прежние entries обновлённых packages. Ошибка или остановка до switch удаляет
неопубликованные owner entries и оставляет прежний active state доступным.

Active state хранит для package точные `name`, `version`, `endpoint`, `cache` и
канонический `storage`, равный `cache`; технического UUID storage в нём нет.
Изменение source, состава или bytes package всегда создаёт новую SemVer и новый
immutable versioned artifact. Поэтому `@release/main` и
`@internal/visual` обслуживаются как два физических artifact: ни текущая, ни
versioned сборка `@release/main` не содержит implementation Visual.

`@release/server` — единственный server-side владелец release packages и
server-стороны RPC. Он находит и проверяет package-owned build contract,
собирает artifacts, вычисляет следующие версии, атомарно публикует группу и
реализует операции HTTP/RPC. Корневой `server.ts` остаётся явной картой
сетевого интерфейса: возле каждого endpoint видны HTTP methods, а возле
WebSocket — `open`, `message` и `close`; фабрика, скрывающая целый route,
запрещена. На используемом Bun 1.3.14 `{dir}` ещё распознаётся как
`FrameworkRouter` и не является рабочим runtime directory route, поэтому
дерево assets временно обслуживается явным безопасным file-handler без
frontend framework dependencies.

Service Worker-сторона RPC является внутренней директорией `@release/service`
и входит в его единый artifact. Отдельного browser package, версии или cache
entry для RPC нет. Release использует RPC для обновлений, signaling,
управления и мониторинга, не превращая его в подключаемый `@internal/*` module.

`@internal/visual` создаёт один `UiRuntime` на единственном canvas и владеет его
lifetime, `Space`, `HUD`, resize и стандартной навигацией. Startup visual runtime не
создаёт и его implementation не импортирует.

В `Space` находятся стандартный пол и один пустой явно именованный `UIDisplay`;
встроенный surface-display отключён. Обзорная камера начинает в дальнем режиме
и сохраняет штатные orbit, pan и zoom. Navigation dock принадлежит `HUD`: он
приближает камеру к display и возвращает сохранённый обзор, не перехватывая
input остальной сцены.

HTML, layout canvas и font resource обслуживает `hamiltonian/web/static`.
Стандартная среда не импортирует prototype `hamiltonian/visual`, Bulk или
предметную node-system presentation. Последующие internal или MetaFor modules
наполняют готовый display отдельно и не создают второй visual runtime.

## Текущее переходное состояние

Главное представление topology — живая интерактивная WebGPU-сцена на
`UIDisplay` внутри engine `Space`; отдельный camera-locked `HUD` содержит только
окна управления поверх display. Первый причинный срез материализует server и текущую page
непосредственно из navigation startup. Service Worker, Service Worker API,
WebSocket, Dedicated Worker, два Bun process, отдельный WebRTC
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
локальном HTTP contour, `wss:` только при TLS) переносит startup-состояние,
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

`nodes` владеет generic node-system document, validation, positioned-geometry
helpers и transport layout Worker. `@nodes/ui` владеет intrinsic card
measurement, fixed-port card adapter, transform бесконечного 2D-холста,
selection и WebGPU surfaces. Необязательный Inspector приходит из
`@nodes/hud`, поэтому renderer не зависит от HUD.
`@nodes/layout` владеет только pure TypeScript geometry engine и минимальным
`LayoutGraph → LayoutResult` протоколом. Hamiltonian адаптирует собственные
наблюдения в UI-модель и добавляет только уже существующие lifecycle actions.
Transport catalog и его палитра принадлежат Hamiltonian: один
`hamiltonianConnectionColor` resolver передаётся generic surface и легенде.
`@nodes/ui` знает только opaque `connectionType` и универсальный fallback.
Generic `parentId` задаёт только визуальный контейнер и не сообщает пакету
предметный смысл ownership. В браузерной части Hamiltonian выставляет его для
наблюдённых `page`, `service-worker`, `window-main`, `dedicated-worker` и
`rtc-peer`, чей фактический `ownerId` уже присутствует в текущей причинной
проекции. Сам `browser-runtime` становится root owner только после
page-наблюдения, а Service Worker получает его как parent только после
направленного `connect-window`.
Каждая одновременно наблюдаемая browser/profile identity материализуется как
отдельная compound-нода: имя runtime (`Chrome` в текущем контуре) находится
слева в шапке, компактный profile identifier — справа, а полный identifier — в
фактах. Profile identifier — это UUID Hamiltonian в origin-local storage
browser profile (исторический storage key `hamiltonian-device`), а не имя
Google-профиля, PID, title, user agent или URL. Все вкладки одного storage
profile читают один UUID; page передаёт его Service Worker и host. Identity
переживает quit/reopen вместе с browser storage, а новый, очищенный или
off-the-record storage создаёт нового owner. Page realm, Service Worker и
browser transport одного профиля не могут
попасть в compound другого профиля. После подтверждённого `connect-window`
отсутствующий browser parent является ошибкой lifecycle-проекции и не разрешает
показывать Service Worker корневой нодой.
Retained snapshot, переходящий границу realm, всегда ownership-closed: каждая
некорневая entity передаётся вместе с живой owner-chain до объявленного root
этого scope. Service Worker передаёт host целый валидированный browser/profile
snapshot, а host объединяет такие независимые scope без синтеза отдельных
Chrome или специальной обработки второго Worker. Snapshot с отсутствующим,
чужим либо циклическим owner не принимается. Каждый retained transport также
замкнут внутри exact scope: его owner, source endpoint и target endpoint обязаны
быть entity того же snapshot, а все три owner-chain обязаны завершаться в одном
и том же объявленном root. Наличие нескольких объявленных roots не разрешает
transport между ними. Presentation отображает только уже декларированную
причинную принадлежность и защитно не материализует transport, если у его
owner/endpoints обнаружены разные browser-runtime ancestors. Эта защита не
запрещает наблюдённый transport между browser-owned entity и server entity,
потому что server не является другим browser/profile root.
Service Worker перед отправкой profile snapshot проецирует свой полный local
journal на exact browser root: внешний control WebSocket и server endpoint в
этот snapshot не входят, потому что host наблюдает их самостоятельно со своей
стороны соединения. Host не ослабляет profile validator ради внешнего endpoint:
на realm boundary принимается только замкнутый browser-owned graph, после чего
он агрегируется с host-owned transport observations.

Node-system declaration является retained replacement-границей над таким
ownership-closed snapshot. Она явно задаёт стабильный `logicalContourId`,
incarnation и её `incarnationStartedAt`, монотонную revision, exact root и
snapshot с causal frontier. Серверный logical contour выводится из
сконфигурированной Hamiltonian identity, а browser/profile contour — из
устойчивого profile UUID; временные host epoch, PID, navigation и connection ID
не используются как registry key. Для одной incarnation принимается только
строго большая revision с frontier, не отступающим от уже принятого. Другая
incarnation одного logical contour заменяет прежнюю только при строго более
позднем `incarnationStartedAt`; stale, равная либо немонотонная декларация
отклоняется. Registry удерживает одну декларацию на logical contour, поэтому
replacement атомарно удаляет прежний root, всё его ownership-поддерево и
связанные boundary transport до материализации преемника, не затрагивая другой
logical contour. В той же операции registry сверяет boundary transport всех
остальных current declarations и удаляет запись, если replacement сделал её
endpoint incarnation stale; новый document публикуется только после этой
reconciliation, поэтому порядок доставки следующей декларации transport не
является частью закона. После принятия декларации её structural membership
остаётся authoritative до следующей принятой декларации того же logical
contour: более новый raw snapshot и live-наблюдение могут обновить факты уже
объявленного subject либо структуру ещё не объявленного contour, но
source/owner-chain, покрытый current declaration, не может live-событием
добавить или удалить structural member. Так старый browser RTC не остаётся
одновременно с ещё не объявленным RTC новой peer session. Service Worker после
каждого принятого structural `page-lifecycle` в том же event-turn выпускает
следующий browser snapshot и declaration; только эта declaration атомарно
меняет membership до следующего page-source event. Иначе registry и page могли
бы удерживать валидную exact WSS reference, пока projection уже потеряла её
Service Worker endpoint, либо материализовать две peer session в одном browser
slot. Следующая декларация, действительно исключившая endpoint, удаляет его и
зависимый boundary transport одной aggregation operation.

Cross-contour transport не импортируется внутрь чужого ownership snapshot.
Минимальная boundary-запись ссылается на exact current declarations обоих
endpoint contours, их incarnations и реально существующие entity; owner также
обязан принадлежать одному из этих contours. Control WebSocket объявляет host
только после подтверждения identity: owner/source — exact Service Worker в
browser/profile declaration, target — exact server incarnation, а connection и
heartbeat относятся к тому же transport. Service Worker принимает новую
server declaration до продолжения host lifecycle, передаёт browser declaration
и затем направляет page обновлённую server declaration с подтверждённым WS/WSS.
Фактически открытые ordered/reliable DataChannel `oracle` и `force` тоже
объявляет host: owner/source — exact server `RTCPeerConnection`, target —
exact browser `RTCPeerConnection` той же current session в уже принятых
declarations. Session ID, peer status или вид ноды не создают такую boundary-
запись без retained physical transport observation; close или replacement
точной session удаляет обе её грани.
Поэтому cold host `A → B` не требует reload page: declaration B заменяет A
вместе с WSS A, а snapshot или запоздалое live-наблюдение A не может вернуть
старое серверное поддерево.

Серверная часть собрана в отдельный presentation-only контейнер `Сервер`. У
него нет параметров, transport-сокетов и действий; он не является lifecycle
entity или endpoint. Внутри находятся фактический Bun host Hamiltonian и
принадлежащие ему Bun/peer OS processes, а серверный `RTCPeerConnection`
остаётся внутри своего `Peer process`. Все transport продолжают заканчиваться
на фактических runtime-нодах, поэтому визуальная группировка не меняет
причинную проекцию.

Retained lifecycle сохраняет только действующее ownership-поддерево. Когда
owner завершается, его вложенные runtime-сущности и принадлежащие им transport
также удаляются из текущего снимка: объект из завершённого процесса не может
сохраниться за счёт связи с другой средой и стать ложной корневой нодой.
Исчезновение control WebSocket само по себе ещё не означает завершение
browser/profile scope: новый execution того же Service Worker может
переподключиться в пределах общей heartbeat/authority grace. Подтверждённая
identity того же profile в этот срок отменяет удаление, обновляет только
execution incarnation Worker и сохраняет прежний browser owner. Если grace
истекла, другого подтверждённого соединения этого profile нет и не осталось ни
действующей Web Push subscription, ни уже начатого push wake, весь недостижимый
browser ownership scope забывается одним retained snapshot. Это не terminal
retirement стабильной identity: сохранённый profile UUID может позднее снова
материализовать тот же логический owner после quit/reopen. Действующая Web Push
subscription, напротив, означает достижимый `standby` scope и не позволяет
удалить его только из-за отсутствия открытых окон.
Page-side projection применяет такой host snapshot авторитетно: отсутствующий
remote browser scope забывается вместе с поддеревом и не остаётся пустой
Chrome-нодой. Browser owner текущей page сохраняется даже при late snapshot,
в котором его собственное раннее birth-наблюдение ещё не повторено; точный
owner текущей page берётся из самой retained page-записи, а не из порядка
доставки событий.

### Версия кода Service Worker

Lifecycle различает logical Service Worker identity, incarnation текущего
execution и версию фактически исполняемого кода. Код несёт собственную версию
в валидном SemVer с обязательными `MAJOR.MINOR.PATCH`; prerelease и build
metadata допустимы только по синтаксису SemVer. Версию сообщает само
исполняемое Worker embodiment в identity message и своей lifecycle entity. Host
принимает profile snapshot только при совпадающей валидной версии в обоих
местах и удерживает её отдельно
от host version, Git revision, URL и времени сборки. Restart execution без
смены bundle сохраняет code version; установка нового bundle сохраняет
logical identity, но получает новую incarnation и подтверждённую code version.
Одна incarnation не может сменить заявленную версию без нового execution.
В ноде Service Worker версия видна отдельным параметром `Версия кода`.
Слева в шапке этой ноды остаётся `Service Worker`, справа находится compact
logical Worker identity. Identity не повторяется отдельным параметром, а между
шапкой и параметрами нет описательного блока; удаление этих presentation-полей
не скрывает версию кода.

На одном локальном Mac действующий `Bun.build` Service Worker создаёт локальный
release `{version, sha256}`. Его SemVer берётся из исполняемого Worker bundle,
а SHA-256 вычисляется по точному результату сборки. `/manifest.json` хранит
этот release во вложенном поле `serviceWorker`; существующие top-level
`version`, `moduleUrl` и `sha256` по-прежнему принадлежат внутреннему versioned
module и не переименовываются в Worker version/hash.

Каждое подключение локального Chrome/profile проходит profile-scoped admission.
Host сравнивает заявленную Worker code version с текущим локальным manifest.
Совпавшая версия получает `service-worker-current` и только после этого входит
в retained browser lifecycle, topology, peer и иную прикладную работу. Stale
execution допускается лишь к техническим declaration/identity, heartbeat и
`service-worker-update`; его snapshot и окна не материализуются. Получив exact
target `{version, sha256}`, Worker вызывает browser-managed
`ServiceWorkerRegistration.update()`. Отправка запроса и завершение `update()`
не являются успехом: профиль подтверждён только когда тот же logical Worker
подключился с новой execution incarnation и manifest version. Попытка заявить
target version из уже отвергнутой incarnation отклоняется.

Новая execution сначала получает server startup declaration без browser
boundary: её пустой registry ещё не обязан знать прежнюю incarnation этого или
другого профиля. Это только адресованная pre-identity startup-проекция;
authoritative retained server declaration остаётся полной и не заменяется.
После приёма собственной browser/profile declaration Host обязательно выдаёт
обычную полную server declaration, где control boundary ссылается уже на exact
новую incarnation. Проверка closure и разделение profile scope при этом не
ослабляются.

После новой локальной сборки host посылает тот же exact target всем сейчас
подключённым stale профилям. Перед отправкой update он атомарно отзывает их
окна из application topology, закрывает прежний peer и дожидается завершения
этого teardown; stale DataChannel не продолжает прикладную работу во время
browser-managed update. Поздно подключившийся запущенный профиль проходит ту
же admission-проверку. Web Push переносит только wake capability и может
инициировать reconnect/check, но не содержит versioned code. Выключенные
профили, remote release/fleet registry, server/device agents, Git delivery и
межмашинная публикация в этот локальный закон не входят.

Новая authoritative declaration следующего execution одного logical Worker
атомарно заменяет факты и timestamps предыдущего execution, даже если browser
root и logical Worker identity не меняются. Факты старой incarnation не
доклеиваются к новой. Успешный current admission/heartbeat явно снимает
transient `reason`, но не удаляет отдельный исторический `lastFailure`.
Retained entity действующего Worker изменяет только его собственное execution.
Page может завершить другой наблюдённый superseded Worker, но её локальное
наблюдение не заменяет identity, incarnation и code version текущего Worker.
Защита этого авторства входит в Service Worker release `1.1.1`.

Повторный `connect-window` не создаёт вторую визуальную связь: Service Worker
API transport сохраняет identity текущей page realm, а тихий канал и смена
controller восстанавливаются автоматически.

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
`LayoutResult`, а fixed card adapter связывает IDs с исходным document без
post-routing. Новая
topology generation отменяет ожидание устаревшего ответа, а ошибка Worker не
включает скрытый синхронный fallback на main thread.
Runtime incarnation остаётся domain `id`, но не управляет tie-break раскладки:
page, main, Dedicated Worker и RTCPeerConnection передают отдельный стабильный
`layoutId` своего visual slot. Reload и resize одной topology поэтому не меняют
packing из-за нового UUID.
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
sequence frontier каждого source. Новая Window получает snapshot и направленное
live-продолжение через Service Worker API, а локальная orchestration принимает
их через ранний BroadcastChannel своей page realm. Snapshot сохраняет исходные event identity, но не повторяет
сообщения до frontier. Incarnation-aware cursor обнаруживает настоящий разрыв
после frontier, а duplicate и событие прежнего source не откатывают сцену.
Когда owning entity наблюдается завершённой, retained snapshot этой incarnation
сразу удаляется: поздний subscriber не получает структуру уже умершего runtime.
Её active sequence frontier и structural records также удаляются. От очень
поздней доставки защищает не бесконечная история, а bounded recent tombstone:
cursor удерживает последние 512 завершённых source identity, host-журнал и
проекция — последние 2048 завершённых entity, а проекция также до 2048
transport identity. Запоздалые entity и transport, касающиеся завершённого
ownership-поддерева, обновляют causal frontier, но не возвращаются в current
state. Эти границы не обрезают
активное состояние или настоящий gap.
Более новый snapshot заменяет покрытую им структуру: отсутствующая в нём
entity или transport больше не считается активной. Capacity не обрезает
структуру молча, а останавливает неверный startup явной ошибкой. Эта
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
control startup (`deviceId`, token, resume capability, host и готовность
Push) хранится Service Worker в Cache Storage. Внутреннее исполнение имеет
отдельный диагностический `runtimeIncarnation`, но не образует отдельную ноду.
После получения browser identity владельцем этой сущности всегда остаётся
соответствующий user-agent runtime. Наблюдения host и page о Push, heartbeat,
ошибке или смене внутреннего исполнения обновляют состояние той же ноды, но не
могут перенести её из browser parent или сделать корневой.

PushSubscription и VAPID identity хранятся Bun в локальном игнорируемом
`.metafor/hamiltonian-web-push.json` с правами `0600`. Явно заданные
`HAMILTONIAN_VAPID_PUBLIC_KEY`, `HAMILTONIAN_VAPID_PRIVATE_KEY` и
`HAMILTONIAN_VAPID_SUBJECT` имеют приоритет. Если Notification permission
равен `default`, страница напрямую вызывает системный запрос и подписывает тот
же зарегистрированный Service Worker с `userVisibleOnly: true`. Собственного
pre-prompt нет. После `denied` приложение больше не запрашивает permission;
закрытый системный prompt оставляет `default`, и запрос повторяется после
следующей загрузки. При `granted` существующая подписка восстанавливается без
нового prompt. При явном
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

В принятом clean-опыте Chrome 151 с пустой вкладкой и `0` Hamiltonian clients
Web Push подтвердил причинный reconnect за `803 ms`. Восстановленный WSS
прожил `40.046 s` и подтвердил четыре heartbeat ACK; затем ещё `250.840 s` без
нового Push автоматический socket не возник. Эти значения являются измерением
конкретного runtime, а не SLA. Долговечный закон состоит в доступности
зарегистрированной Service Worker entity для нового событийного пробуждения,
а не в непрерывной жизни одного JS-исполнения или WSS.

Host начинает causal heartbeat первым `ping` после открытия control WebSocket.
Следующий challenge назначается только после `pong` с точным текущим sequence;
чужой или опережающий ACK закрывает соединение fail-closed. Такой round trip
доказывает доступность текущего внутреннего исполнения и WebSocket в момент
ответа, но не удерживает обычный web Service Worker запущенным. Lifecycle строит
одну ноду `Service Worker`: стабильная logical identity находится справа в её
шапке, `Исполнение` и `Версия кода` описывают текущее embodiment, `Push` сообщает
`ready / sent / received / failed`, а `Heartbeat` — состояние текущего WSS. В целевой
модели нет отдельной ноды или подписи
`ServiceWorkerGlobalScope`.

Штатная тишина page-канала означает, что браузер приостановил внутреннее
исполнение: стабильная Service Worker сущность переходит в `standby`, а её
heartbeat — в `paused`, но это не состояние ошибки. При следующем
`connect-window` новое исполнение сначала восстанавливает control startup из
Cache Storage и только затем публикует текущее состояние. Фактически
доставленный Web Push закрепляет `pushReady: true` в том же startup, поэтому
последующий browser-managed restart не может превратить действующую подписку в
ложное `unavailable`.

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

Локальный host наблюдает изменения `hamiltonian/browser`, `public`, `core`,
`update`, `visual`, а также `pkg/nodes`, `pkg/ui` и `pkg/web-push` source.
После 120 ms debounce он сначала успешно пересобирает orchestration, layout
Worker, Service Worker и Web Push client bundles и только затем отправляет
controlled pages новую source revision по текущему control socket. Source
revision является fingerprint полного browser-кода, который фактически отдаёт
host: собранных bundles и напрямую served HTML, JS, CSS, core и update modules.
Host epoch, PID и локальный номер build generation в эту identity не входят.
Поэтому cold restart host с теми же browser artifacts не перезагружает page, а
успешная generation с изменившимся fingerprint перезагружает её ровно один
раз. Navigation HTML содержит fingerprint загруженного кода как исходный
baseline, а каждый новый control host сообщает свой current fingerprint.
Страница сохраняет baseline в `sessionStorage` до открытия control path;
повторное сообщение не создаёт reload-loop, а failed build не перезагружает
UI. Самая первая регистрация Service Worker может один раз показать `reload
required`: этот startup reload нужен для получения controller и не является
source auto-update.

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

При первом открытии с permission `default` страница сразу вызывает системный
запрос Chrome на уведомления. Действие «Настроить Web Push» в ноде
`Service Worker` и клавиша `⌥P` остаются ручным повтором, пока закрытый prompt
оставляет состояние `default`; после `denied` они не вызывают системный prompt
повторно. VAPID identity и подписка автоматически сохраняются в Git-ignored
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
  --external /core/browser-control.js --external /core/orchestration.js \
  --external /update/page-update.js \
  --external /web-push-client.js
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
election/fencing, stale Service Worker API client generation, reconnect, две независимые
logical lane, frame/queue backpressure, ordering/gap, RPC timeout/session loss,
caller-driven RPC cancellation, WSS resume без смены logical authority, RTC
repair с новой peer generation, stale session rejection, запрет realtime на
WSS, browser/server placement и прямой Bun↔Bun WebRTC через `werift`.
Отдельные `nodes`, `@nodes/layout`, `@nodes/ui`, `@nodes/hud` и orchestration fixtures проверяют
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
