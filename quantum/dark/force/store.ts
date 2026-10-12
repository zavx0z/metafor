import type {SourcedForceMessage} from "shared/protocol/force/message"

/** Local Dark adapter и четыре обязательных remote domain channel. */
export const forceDomains = ["dark", "boundary", "matrix", "energy", "bulk"] as const

export type ForceDomain = typeof forceDomains[number]
export type RemoteForceDomain = Exclude<ForceDomain, "dark">

export const remoteForceDomains = ["boundary", "matrix", "energy", "bulk"] as const satisfies readonly RemoteForceDomain[]

/** Проверяет полный причинный состав; архивная Bulk projection может отсутствовать. */
export function forceParticipants(domains: readonly ForceDomain[] = forceDomains): ForceDomain[] {
  if (!Array.isArray(domains) || new Set(domains).size !== domains.length
    || domains.some(domain => !forceDomains.includes(domain))
    || ["dark", "boundary", "matrix", "energy"].some(domain => !domains.includes(domain as ForceDomain))) {
    throw new Error("Force participants must contain Dark, Boundary, Matrix and Energy, with optional Bulk")
  }
  return forceDomains.filter(domain => domains.includes(domain))
}

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
