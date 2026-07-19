import type {SourcedForceMessage} from "@metafor/types/force/message"

/** Пять обязательных доменов одной работающей Вселенной. */
export const forceDomains = ["dark", "boundary", "matrix", "energy", "bulk"] as const

export type ForceDomain = typeof forceDomains[number]

/**
 * Канал, уже подготовленный Монадой до рождения Force runtime.
 *
 * Runtime знает только возможность передать одну Particle домену. Состояние
 * соединения, общий gate и причина остановки остаются снаружи, в Монаде.
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
 * Монада наполняет этот объект пятью готовыми каналами до первого runtime-
 * события. Сам runtime не имеет функции инициализации и не знает, откуда взялись
 * каналы.
 */
export const force$ = Object.create(null) as ForceStore
