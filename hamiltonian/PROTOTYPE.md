# Рабочий прототип Hamiltonian

Это контракт отдельно запускаемого standalone-прототипа, созданного для
проверки lifecycle, signaling, placement и peer-связи. Он сохраняется рядом с
clean-room packages как evidence и не является их исходным кодом или
production runtime MetaFor.

Поддерживаемый development contour, package publication и проверки описаны в
[руководстве разработки](../.agents/skills/metafor-dev/references/development.md).
Оно запускает clean-room среду; прототип не становится из-за этого текущим
development runtime и поднимается изолированно только для отдельной задачи его
приёмки. Общий целевой смысл Hamiltonian определён в
[корневом README](README.md).

## Граница прототипа

Прототип связывает Bun host, browser profile, Service Worker, Window,
Dedicated Worker и дочерние Bun processes. Он проверяет наблюдаемый lifecycle,
control/signaling и прямой peer transport на синтетических ролях.

Production Dark, Boundary, Matrix, Energy, Bulk и их State в этот runtime не
подключены. Имена испытательных `oracle` и `force` lanes не означают перенос
действующих Oracle RPC или Force MetaFor. Прототип не определяет production
trust, remote discovery, общий registry, STUN/TURN policy или migration
Вселенной.

Clean-room loader и release развиваются отдельно. Их код не заимствует
prototype source, а доказательство прототипа не выдаётся за доказательство
server self-update или production placement.

## Причинный монитор

Монитор показывает только фактически наблюдённый runtime. Entity, incarnation,
transport и сообщение появляются вслед за событием настоящего владельца, а не
из желаемой topology или последнего UI snapshot. Heartbeat является сообщением
на существующем transport, а не отдельной связью.

Каждый контур передаёт current declaration по закону
[`@hamiltonian/visual`](visual/README.md#декларации-контуров). Новая declaration
того же logical contour заменяет прежнюю целиком; stale snapshot или позднее
live event не возвращают вытесненную incarnation. Cross-contour transport
ссылается на exact current endpoints обеих declarations.

Закрытие transport сохраняет наблюдённую terminal-связь, пока живы оба
endpoint: это отличает закрытый канал от никогда не существовавшего. Завершение
owner удаляет уже само ownership-поддерево и принадлежащие ему transport.
Presentation и layout не синтезируют отсутствующий owner.

Browser realms и дочерние Bun processes передают incarnation-aware lifecycle
observations через уже принадлежащие им локальные границы. Retained snapshot
содержит текущую структуру и causal frontier, после которого продолжается live
поток. Startup queue ограничена и отдаётся один раз; это не архив и не replay
истории.

## Server contour

Bun host владеет одним внешним listener прототипа. Через него проходят startup,
static delivery и control WebSocket. Дочерние Bun processes не открывают
собственные фиксированные HTTP/WSS listeners; их lifecycle наблюдает host через
process handle и IPC.

Restart host создаёт новую server incarnation. Declaration преемника заменяет
прежнее server-поддерево без обязательной перезагрузки страницы, если
browser artifact set не изменился. Текущие transport могут продолжиться только
после ссылки на exact endpoints новой declaration; старое server observation
не возвращает predecessor.

При штатном завершении процесс сообщает закрытие IPC и собственное завершение.
После аварийной смерти host сам наблюдает exit, закрывает точную IPC incarnation,
завершает process entity и только затем рождает преемника. Новое authority
воплощение получает новый fencing token; старый token больше не принимается.

## Browser contour

Стабильная browser/profile identity — origin-local UUID, а не PID, имя профиля,
user agent, Window или URL. Все Window одного storage profile разделяют эту
identity; очищенный, новый или off-the-record storage создаёт другого owner.

Зарегистрированный Service Worker является одной логической entity внутри
browser owner. Браузер может останавливать и создавать новое JS execution той
же регистрации: меняется runtime incarnation, но не logical identity. Page,
Service Worker и их transport одного profile не могут оказаться внутри другого
browser owner.

Service Worker координирует Window только в своём browser origin. При новом
execution он сверяет фактически живые Window clients и получает от них текущие
page journals; первый ответ не объявляется полным составом браузера. Не
ответивший client не отменяет уже доказанную связь другого client, а позднее
возвращается обычным подключением.

Page и Service Worker используют один двусторонний Service Worker API
transport. Точный client, profile, page incarnation и message identity
проверяются до принятия observation. URL-параметры control socket являются
только заявкой на маршрут: Service Worker и его transport входят в retained
состояние host только после подтверждённой identity.

## Placement и authority опыта

Host выдаёт global lease с возрастающим fencing token. В browser placement
authority получает не более одного выбранного Window среди всех подключённых
браузеров; Dedicated Worker остаётся per-Window. В server placement authority
получает только выбранный Bun process, а Window leader не избирается. Эти роли
взаимоисключаются внутри опыта.

Lease, host incarnation, физическое connection и peer session имеют разные
identity. Resume допускается только для той же логической стороны и её
действующей capability; потерянный signaling сам по себе не доказывает
восстановленную authority.

Это доказательство fencing механизма прототипа, а не окончательный закон
authority Hamiltonian, Dark или Boundary. Cardinality и защита production
доменов определяются отдельно.

## Control и прямая peer-связь

Control WebSocket переносит identity, heartbeat, election и WebRTC signaling.
Application realtime через него запрещён. После знакомства один peer session
имеет два независимых ordered/reliable DataChannel: синтетическую RPC lane
`oracle` и последовательную event lane `force`.

Каждая lane имеет собственные bounds и sequence. Gap, чужая session incarnation
или потеря одной обязательной lane fail closed завершает peer session целиком.
RPC имеет timeout и отменяется вызывающей стороной либо потерей session.

Host heartbeat использует последовательный challenge/ack и доказывает только
доступность текущего execution и socket в момент ответа. Он не удерживает
обычный web Service Worker постоянно живым.

## Пробуждение Service Worker

Web Push служит редким механизмом событийного пробуждения, а не скрытым
heartbeat. Зарегистрированный Service Worker может получить Push без открытой
Hamiltonian Page, восстановить сохранённый control startup и открыть новый
WebSocket. Это новое физическое execution и соединение той же logical entity,
а не продолжение прежнего socket.

Каждое пробуждение связывается с одноразовым challenge и скрытым proof. Host
считает восстановление успешным только после нового identity-bound control
connection с правильным proof; одно получение Push или показ уведомления
недостаточны.

Обычный Service Worker не является daemon. Browser policy может остановить
его и socket, а полностью закрытый browser process может отложить Push до
следующего запуска. Поэтому прототип доказывает возможность событийного
возвращения в проверенной среде, но не гарантирует непрерывный background
lifetime на любом браузере и устройстве.

## Версия исполняемого кода опыта

Logical identity, execution incarnation и code version различаются. Версию
сообщает исполняемый runtime; host принимает ее только вместе с совпадающей
identity текущего artifact. Restart тех же bytes меняет incarnation, но
сохраняет code version. Установка других bytes сохраняет logical identity и
требует нового execution.

Versioned module проверяется по фактическим bytes до использования. Window
получает новый код только через новое page execution, Dedicated Worker и Bun
process — через cold rebirth. Этот локальный механизм прототипа не является
clean-room release transaction, описанной у
[`@hamiltonian/release`](release/README.md#обновление-browser-release).

## Визуальная проекция

Прототип адаптирует retained lifecycle к
[`@hamiltonian/visual`](visual/README.md), а тот — к generic `nodes`, layout и
UI packages. Визуальная группировка не создаёт lifecycle entity и не меняет
владельца transport. Transient traffic показывает наблюдённое сообщение, но не
копирует payload, token, signaling data, RPC values или Particle content.

## Доказанная граница

Изолированные проверки подтвердили replacement server/browser declarations,
несколько Window одного profile, browser-managed restart Service Worker,
fencing старой authority, crash/rebirth дочернего процесса, control reconnect,
Web Push wake и прямую двухканальную peer-связь без realtime relay через WSS.

Они не подтверждают подключение production-доменов, долговечную распределённую
identity Hamiltonian, authority подписания release, несколько независимых
Hamiltonian identities на listener, удалённый peer discovery или полностью
обновляемую server-среду.
