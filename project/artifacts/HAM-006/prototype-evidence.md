# Evidence рабочего прототипа Hamiltonian

Это временный evidence pack задачи
[`HAM-006`](../../tasks/HAM-006.md). Рабочий прототип — отдельно запускаемая
среда доказательства lifecycle,
signaling, placement и прямой peer-связи Hamiltonian. Он связывает Bun host,
browser profile, Service Worker, Window, Dedicated Worker и дочерние Bun
processes через синтетические роли.

Clean-room startup/release образуют самостоятельную реализацию общего закона:
их packages развиваются из собственных contracts, а prototype source остаётся
в standalone contour.
Поддерживаемый development contour и его проверки описаны в
[руководстве разработки](../../../.agents/skills/metafor-dev/references/development.md).
Прототип поднимается изолированно для задач, которым требуется его точная
приёмка. Общий целевой смысл Hamiltonian определён в
[корневом README](../../../hamiltonian/README.md).

## Область доказательства

Прототип владеет экспериментальными lifecycle observations, control/signaling,
lease/fencing и двумя прямыми peer lanes. Синтетические `oracle` и `force`
показывают свойства двух разных traffic classes.

Dark владеет действующими Oracle/Force contracts MetaFor, Boundary —
каноническими фактами, остальные production domains — собственным lifecycle.
Подключение этих domains, production trust, remote discovery, registry,
STUN/TURN policy и migration Вселенной требуют отдельных contracts и live
acceptance.

## Причинный монитор

Когда настоящий владелец наблюдает рождение entity, изменение transport,
сообщение или завершение incarnation, он публикует одно lifecycle observation.
Монитор принимает observation с source identity и sequence, обновляет current
проекцию и показывает именно наблюдённый результат. Heartbeat проходит как
сообщение существующего transport.

Каждый контур передаёт current declaration по закону
[`@hamiltonian/visual`](../../../hamiltonian/visual/README.md#декларации-контуров). Registry
сопоставляет logical contour identity и incarnation. Declaration более нового
воплощения атомарно заменяет predecessor; stale snapshot и позднее событие
старой incarnation получают отказ.

Cross-contour transport ссылается на exact current endpoints обеих
declarations. Когда transport завершается при живых endpoints, монитор
сохраняет terminal-связь. Когда завершается owner, projection удаляет его
ownership-поддерево и принадлежащие ему transport.

Browser realms и дочерние Bun processes отправляют incarnation-aware
observations через свои локальные transport boundaries. Retained snapshot
задаёт текущую структуру и causal frontier, после которого продолжается live
поток. Bounded startup queue передаёт первый текущий набор один раз.

## Server contour

Bun host публикует один внешний listener прототипа для startup, static delivery
и control WebSocket. Дочерние Bun processes используют process handle и IPC, а
host наблюдает их lifecycle и временные peer endpoints.

При restart host создаёт новую server incarnation и новую declaration. Registry
заменяет server-поддерево predecessor и связывает последующие transport только
с current endpoints. При прежнем browser artifact set Window сохраняет своё
исполнение и принимает новый server contour.

При штатном завершении дочерний process публикует закрытие IPC и собственное
завершение. При crash host наблюдает exit через process handle, закрывает exact
IPC incarnation, завершает process entity и затем рождает преемника. Новый
process получает следующий fencing token, а сообщения со старым token host
отклоняет.

## Browser contour

Browser/profile owner получает стабильный origin-local UUID. Все Window одного
storage profile используют эту identity; новое, очищенное или off-the-record
storage создаёт другого owner.

Зарегистрированный Service Worker является одной logical entity внутри browser
owner. Browser может завершить JS execution и позднее создать новое: logical
identity сохраняется, runtime incarnation меняется. Page, Service Worker и их
transport публикуются внутри declaration exact browser/profile owner.

При новом Service Worker execution координатор перечисляет живые Window
clients и получает их current page journals. После bounded grace он публикует
snapshot из ответивших clients; позднее возобновившийся client присоединяется
обычным `connect-window` и входит в следующую declaration.

Page и Service Worker образуют один двусторонний Service Worker API transport.
Worker проверяет exact client, profile, page incarnation и message identity.
Host добавляет Worker и control transport в retained state после подтверждения
identity на socket; URL route остаётся предварительной заявкой до этого
события.

## Placement и authority опыта

Host выдаёт global lease с возрастающим fencing token. В browser placement
lease выбирает одно Window среди подключённых browsers, а Dedicated Worker
остаётся per-Window. В server placement lease выбирает Bun process. Каждый
режим публикует ровно одно authority incarnation опыта.

Lease, host incarnation, physical connection и peer session имеют собственные
identity. Resume продолжает ту же логическую сторону при совпавшей capability.
При потере signaling участник проходит новый identity/lease handshake и только
после подтверждения возвращает authority.

Этот механизм доказывает fencing внутри прототипа. Production cardinality и
authority Dark/Boundary получает собственный contract и критерий приёмки.

## Control и прямая peer-связь

Control WebSocket переносит identity, heartbeat, election и WebRTC signaling.
После знакомства peer session открывает два ordered/reliable DataChannel:
синтетическую RPC lane `oracle` и последовательную event lane `force`.
Application messages проходят по этим прямым lanes, а control relay сохраняет
нулевой realtime traffic.

Каждая lane владеет bounds и sequence. При gap, чужой session incarnation или
потере обязательной lane peer runtime завершает всю session и начинает новый
handshake. RPC owner завершает request по timeout, caller cancellation или
потере session.

Host heartbeat выдаёт последовательный challenge, а current execution отвечает
точным ACK. Совпавший round trip подтверждает доступность текущих execution и
socket в момент ответа.

## Пробуждение Service Worker

Web Push запускает редкое событийное пробуждение зарегистрированного Service
Worker. Worker восстанавливает сохранённый control startup и открывает новый
WebSocket как новая runtime incarnation той же logical entity.

Host заранее создаёт одноразовые challenge и скрытый proof. Новый
identity-bound control connection предъявляет proof, host фиксирует causal
reconnect и подтверждает готовность Worker. Push receipt и control recovery
остаются двумя разными наблюдаемыми событиями.

Browser policy управляет lifetime Service Worker execution и socket. При
завершённом browser process Push ждёт следующей доступной browser-сессии.
Доказанный результат прототипа — событийное возвращение зарегистрированного
Worker в проверенной среде.

## Версия исполняемого кода опыта

Logical identity, execution incarnation и code version являются отдельными
полями. Runtime сообщает version вместе с artifact identity; host сверяет их с
текущим выпуском. Restart тех же bytes создаёт новую incarnation с прежней
version, а установка других bytes создаёт новую incarnation той же logical
identity с новой version.

Loader проверяет versioned module по фактическим bytes до использования.
Window применяет новый код через новое page execution, Dedicated Worker и Bun
process — через cold rebirth. Clean-room browser update выполняет собственный
release lifecycle, описанный у
[`@hamiltonian/release`](../../../hamiltonian/release/README.md#обновление-browser-release).

## Визуальная проекция

Прототип передаёт retained lifecycle в
[`@hamiltonian/visual`](../../../hamiltonian/visual/README.md), а package адаптирует его к generic
`nodes`, layout и UI. Presentation-only containers группируют доказанные
runtime nodes. Transient traffic показывает факт и направление сообщения,
сохраняя payload, token, signaling data, RPC values и Particle content у их
transport/domain owners.

## Доказанный и следующий результат

Изолированные проверки подтверждают replacement server/browser declarations,
несколько Window одного profile, browser-managed restart Service Worker,
fencing прежней authority, crash/rebirth дочернего process, control reconnect,
Web Push wake и прямую двухканальную peer-связь с нулевым realtime relay через
WSS.

Следующие самостоятельные результаты должны принять долговечную распределённую
identity Hamiltonian, владельца release authority, несколько identities на
listener, remote peer discovery, полностью обновляемую server-среду и
подключение production domains.
