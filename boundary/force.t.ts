/**
 * Семантический канал частицы Force.
 *
 * Значение хранится на самой частице в поле `part`, а не в конверте сообщения.
 * Один физический транспорт `FORCE` может переносить частицы разных каналов.
 */
export type Part = "graviton" | "photon" | "gluon" | "higgs" | "w" | "-z" | "+z"

/**
 * Операция частицы Force.
 *
 * Описывает содержимое изменения внутри частицы и не является силой или каналом.
 */
export type ParticleOperation = "add" | "remove" | "replace" | "move" | "copy" | "test"

/**
 * Одна частица Force.
 *
 * Представляет один Force part: поле `part` задаёт смысловой канал, поле `path`
 * задаёт доменный тип сигнала, а данные изменения передаются через `value`,
 * `from` и дополнительные доменные поля.
 * @prop part — семантический канал частицы
 * @prop op — операция изменения
 * @prop path — доменный путь, к которому относится частица
 * @prop value — полезная нагрузка для операций с данными
 * @prop from — исходный путь для операций move/copy
 * @prop key — дополнительные доменные поля частицы
 */
export type Particle = {
  part: Part
  op: ParticleOperation
  path: string
  value?: unknown
  from?: string
  [key: string]: unknown
}

/**
 * Сообщение Force.
 *
 * Конверт переносит только пакет `parts`; маршрутизация читается с каждой
 * частицы отдельно. Конверт не должен дублировать `part`, `channel`, `source`
 * или `boson`.
 * @prop parts — упорядоченный набор частиц
 */
export type ForceMessage = {
  parts: Particle[]
}

/**
 * Слушатель сообщения Force.
 *
 * Получает стандартный `MessageEvent`, где `data` содержит `ForceMessage`.
 * `this` остаётся совместимым с `BroadcastChannel`.
 */
export type ForceMessageListener = (this: BroadcastChannel, ev: MessageEvent<ForceMessage>) => unknown

/**
 * Отписка от подписки Force.
 *
 * Закрывает только конкретную подписку, которую вернули `observe` или
 * `entropy`; общий канал Force при этом не закрывается.
 * @prop close — снимает связанную подписку без закрытия общего транспорта
 */
export interface ForceBinding {
  close(): void
}

/**
 * Локальная поверхность транспорта Force.
 *
 * Описывает контракт доставки сообщений вокруг одного физического
 * `BroadcastChannel` с именем `FORCE`. Сам модуль `boundary/force.ts` не
 * обновляет SQLite и не решает, какие частицы применимы к базе: он только
 * держит подписки и доставляет `ForceMessage` локальным слушателям или в
 * общий `BroadcastChannel`.
 *
 * Обновление персистентной базы находится уровнем выше, в реализации
 * `Boundary` из `boundary/sqlite.ts`: `absorb(message)` сначала последовательно
 * применяет применимые частицы к SQLite через транзакцию Boundary, и только
 * потом вызывает `absorbForceMessage(message)`. Поэтому входящее сообщение
 * становится видимым для `observe`, но не становится новой исходящей
 * энтропией.
 *
 * `emit` используется для локально рождённого исходящего сообщения и сам
 * ничего не пишет в SQLite. Для Boundary-домена это означает: запись в SQLite
 * уже должна быть выполнена доменным методом или транзакцией Boundary, и только
 * после успешной записи вызывается `emitForceMessage(message)`. После этого
 * сообщение публикуется в `BroadcastChannel` `FORCE`, локально уведомляет
 * `observe`-подписчиков и дополнительно попадает в `entropy`-подписчиков.
 * `absorb` используется для принятого сообщения: оно применяется владельцем
 * домена, локально уведомляет `observe`-подписчиков и не отправляется
 * обратно в `BroadcastChannel`, чтобы не создавать повторный круг доставки.
 * @prop observe — подписывает на все сообщения, которые дошли до локальной поверхности: внешние сообщения из `BroadcastChannel`, локальный `emit` и локальный `absorb` после применения владельцем домена
 * @prop entropy — подписывает только на исходящие сообщения, рождённые этой поверхностью через `emit`; входящие сообщения и `absorb` сюда не попадают
 * @prop emit — без записи в SQLite публикует уже подготовленное локальное сообщение в `BroadcastChannel` `FORCE`, локально уведомляет `observe`-подписчиков и отмечает сообщение как `entropy`
 * @prop absorb — без публикации в `BroadcastChannel` принимает сообщение; в Boundary-реализации сначала обновляет SQLite, затем локально уведомляет `observe`-подписчиков
 */
export interface ForceSurface {
  observe(listener: ForceMessageListener): ForceBinding
  entropy(listener: ForceMessageListener): ForceBinding
  emit(message: ForceMessage): void | Promise<void>
  absorb(message: ForceMessage): void | Promise<void>
}

/**
 * Полный runtime Force.
 *
 * Добавляет управление жизненным циклом к локальной поверхности транспорта.
 * @prop close — закрывает общий `BroadcastChannel` `FORCE` и очищает локальные подписки
 */
export interface Force extends ForceSurface {
  close(): void
}

/**
 * BroadcastChannel с типизированной полезной нагрузкой.
 *
 * Уточняет стандартный канал под конкретный тип сообщения.
 * @prop onmessage — типизированный обработчик входящих сообщений
 * @prop postMessage — типизированная отправка сообщения
 */
export type TypedBroadcastChannel<TMessage> = Omit<BroadcastChannel, "onmessage" | "postMessage"> & {
  onmessage: ((this: BroadcastChannel, ev: MessageEvent<TMessage>) => unknown) | null
  postMessage(message: TMessage): void
}

/**
 * Канал BroadcastChannel для сообщений Force.
 */
export type ForceChannel = TypedBroadcastChannel<ForceMessage>
