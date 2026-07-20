import {
  sourceForceMessage,
  type ForceMessageInput,
  type SourcedForceMessage,
} from "shared/protocol/force/message"
import {routeParticle} from "./force.ts"
import {force$, forceDomains, type ForceDomain, type ForceStore} from "./store.ts"

export type ForceLifecycleState = "created" | "starting" | "running" | "error" | "stopped"

export type ForceLifecycleStatus = {
  ok: boolean
  domain: "force"
  state: ForceLifecycleState
  requiredDomains: ForceDomain[]
  connectedDomains: ForceDomain[]
  error: string | null
}

export type ForceLifecycleDecision =
  | {ok: true; delivered: ForceDomain[]}
  | {ok: false; reason: "not_running" | "runtime_error"; error: string}

export type ForceAgentDecision =
  | {ok: true; delivered: ForceDomain[]; particle: SourcedForceMessage["parts"][0]}
  | {ok: false; reason: "not_running" | "runtime_error"; error: string}

/**
 * Lifecycle божественного уровня Force.
 *
 * Он принимает только готовые ForceChannel и типизированные Particle, управляет
 * gate/fail-stop и не знает о WebSocket, REST, WebRTC или Monad RPC.
 */
export class ForceLifecycle {
  #state: ForceLifecycleState = "created"
  #error: string | null = null
  #connectedDomains = new Set<ForceDomain>()

  /**
   * Сервер запущен и просит подготовить Force к рождению runtime.
   *
   * В `created` lifecycle помещает пять заранее созданных ForceChannel в Store
   * и входит в `starting`. Runtime разрешается только после готовности всех
   * обязательных доменов. Повторный вызов ничего не подменяет; из `error` и
   * `stopped` запуск не возобновляется.
   */
  start(channels: ForceStore): ForceLifecycleStatus {
    if (this.#state !== "created") return this.status()
    this.#state = "starting"
    try {
      for (const domain of forceDomains) force$[domain] = channels[domain]
    } catch (error) {
      this.#failStop("force", `could not prepare domain channels: ${this.#reason(error)}`)
    }
    return this.status()
  }

  /**
   * Один обязательный ForceChannel физически готов.
   *
   * В `starting` lifecycle фиксирует готовый канал и после пятого домена разрешает
   * runtime, переходя в `running`. Повторное соединение того же домена не меняет
   * состояние. В `error` и `stopped` подключение не восстанавливает Вселенную.
   */
  channelReady(domain: ForceDomain): ForceLifecycleStatus {
    if (this.#state !== "starting" && this.#state !== "running") return this.status()
    this.#connectedDomains.add(domain)
    if (this.#state === "starting" && forceDomains.every((required) => this.#connectedDomains.has(required))) {
      this.#state = "running"
    }
    return this.status()
  }

  /**
   * Внешний ingress передал уже декодированную Particle агента.
   *
   * В `running` lifecycle ставит доверенный `by: agent` и передаёт Particle
   * runtime-закону. Декодирование и проверка физического входа уже выполнены
   * снаружи. Ошибка runtime закрывает общий gate и переводит lifecycle в `error`.
   */
  acceptAgentParticle(input: ForceMessageInput): ForceAgentDecision {
    if (this.#state !== "running") {
      return {ok: false, reason: "not_running", error: this.#blockedReason()}
    }
    const message = sourceForceMessage(input, "agent")
    try {
      const delivered = routeParticle(message, "agent")
      return {ok: true, delivered, particle: message.parts[0]}
    } catch (error) {
      this.#failStop("force", `runtime could not transfer a Particle: ${this.#reason(error)}`)
      return {ok: false, reason: "runtime_error", error: this.#blockedReason()}
    }
  }

  /**
   * ForceChannel домена передал типизированную Particle.
   *
   * Сам канал уже гарантирует одну Particle с источником этого домена. Lifecycle не
   * проверяет форму или источник повторно. Только фактическая ошибка передачи
   * выполняет fail-stop. В остальных состояниях Particle не проходит дальше.
   */
  acceptParticle(domain: ForceDomain, value: SourcedForceMessage): ForceLifecycleDecision {
    if (this.#state !== "running") {
      return {ok: false, reason: "not_running", error: this.#blockedReason()}
    }
    try {
      return {ok: true, delivered: routeParticle(value, domain)}
    } catch (error) {
      this.#failStop(domain, `could not transfer a Particle: ${this.#reason(error)}`)
      return {ok: false, reason: "runtime_error", error: this.#blockedReason()}
    }
  }

  /**
   * Сервер обнаружил разрушение одного обязательного канала.
   *
   * Во время `starting` lifecycle только снимает готовность ещё не родившейся
   * Вселенной и продолжает ждать транспорт. В `running` потеря последнего
   * соединения домена фиксирует первую ошибку, закрывает общий gate и переводит
   * lifecycle в `error`. В `error` и `stopped` первая причина не меняется.
   */
  channelDestroyed(domain: ForceDomain, cause: unknown): void {
    this.#connectedDomains.delete(domain)
    if (this.#state === "created" || this.#state === "starting" || this.#state === "stopped" || this.#state === "error") return
    this.#failStop(domain, `channel was destroyed: ${this.#reason(cause)}`)
  }

  /**
   * Сервер завершает собственный lifecycle.
   *
   * Lifecycle закрывает общий gate и входит в `stopped` из любого текущего
   * состояния. Новые Particle после этого блокируются. Автоматического нового
   * запуска или восстановления каналов этот этап не выполняет.
   */
  stop(): void {
    this.#state = "stopped"
  }

  #failStop(domain: ForceDomain | "force", reason: string): void {
    if (this.#state === "error") return
    this.#error = domain === "force"
      ? `Force stopped: ${reason}`
      : `Force stopped: ${domain} ${reason}`
    this.#state = "error"
  }

  #blockedReason(): string {
    return this.#error ?? `Force is not running: ${this.#state}`
  }

  #reason(value: unknown): string {
    return value instanceof Error ? value.message : String(value)
  }

  status(): ForceLifecycleStatus {
    return {
      ok: this.#state === "running",
      domain: "force",
      state: this.#state,
      requiredDomains: [...forceDomains],
      connectedDomains: forceDomains.filter((domain) => this.#connectedDomains.has(domain)),
      error: this.#error,
    }
  }
}
