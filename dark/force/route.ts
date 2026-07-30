import type {SourcedForceMessage} from "shared/protocol/force/message"
import {force$, forceDomains, type ForceDomain, type ForceStore} from "./store.ts"

export type ForceOrigin = ForceDomain | "agent"

const isUncommittedWorldMutation = (message: SourcedForceMessage): boolean => {
  const particle = message.parts[0]
  return (particle.part === "gluon" || particle.part === "higgs") &&
    (particle.op === "add" || particle.op === "replace" || particle.op === "remove") &&
    particle.from === undefined
}

const relevantDomains = (message: SourcedForceMessage, origin: ForceOrigin): Set<ForceDomain> | null => {
  const particle = message.parts[0]
  if (particle.by === "agent" && particle.part === "inflaton") return new Set(["dark", "bulk"])
  if (particle.by === "dark" && particle.part === "inflaton") return new Set(["boundary", "bulk"])
  if (isUncommittedWorldMutation(message) && origin !== "boundary") return new Set(["boundary"])
  return null
}

export function particleDestinations(
  message: SourcedForceMessage,
  origin: ForceOrigin,
): ForceDomain[] {
  const relevant = relevantDomains(message, origin)
  return forceDomains.filter((domain) =>
    domain !== origin && (relevant === null || relevant.has(domain))
  )
}

/**
 * Применяет routing laws Dark Force к одной Particle.
 *
 * Закон канала уже гарантирует, что сюда попадает одна Particle с назначенным
 * источником. Runtime не проверяет это условие повторно: он только определяет
 * нужные домены и передаёт Particle в уже существующие каналы Store. Все решения
 * серверного жизненного цикла принимает `ForceLifecycle` до вызова этой функции.
 */
export function routeParticle(message: SourcedForceMessage, origin: ForceOrigin): ForceDomain[] {
  const delivered = particleDestinations(message, origin)
  for (const domain of delivered) {
    const channel = (force$ as Partial<ForceStore>)[domain]
    if (!channel) throw new Error(`Force Store has no ${domain} channel`)
    channel.send(message)
  }
  return delivered
}
