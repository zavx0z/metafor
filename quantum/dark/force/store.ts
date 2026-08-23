import type {SourcedForceMessage} from "shared/protocol/force/message"

/** Local Dark adapter и четыре обязательных remote domain channel. */
export const forceDomains = ["dark", "boundary", "matrix", "energy", "bulk"] as const

export type ForceDomain = typeof forceDomains[number]
export type RemoteForceDomain = Exclude<ForceDomain, "dark">

export const remoteForceDomains = ["boundary", "matrix", "energy", "bulk"] as const satisfies readonly RemoteForceDomain[]

/**
 * Типизированный канал одного обязательного runtime-домена.
 *
 * Runtime знает только возможность передать одну Particle домену. Состояние
 * соединения, общий gate и причина остановки остаются в `ForceLifecycle`.
 */
export type ForceChannel = {
  readonly domain: ForceDomain
  send(message: SourcedForceMessage): void
}

export type ForceStore = {
  [domain in ForceDomain]: ForceChannel
}

/**
 * Постоянный Store Force runtime.
 *
 * `ForceLifecycle` наполняет этот объект пятью готовыми каналами до первого
 * runtime-события. Сам runtime не имеет функции инициализации и не знает,
 * откуда взялись каналы.
 */
export const force$ = Object.create(null) as ForceStore
