import {
  sourceForceMessage,
  type ForceMessageInput,
  type SourcedForceMessage,
} from "@metafor/types/force/message"
import {parseForceReplayPath} from "@metafor/types/force/replay"
import {routeParticle} from "./force.ts"
import {json, readJson} from "./src/http.ts"
import {force$, forceDomains, type ForceDomain, type ForceStore} from "./store.ts"

export type ForceMonadState = "created" | "starting" | "running" | "error" | "stopped"

export type ForceMonadStatus = {
  ok: boolean
  domain: "force"
  state: ForceMonadState
  requiredDomains: ForceDomain[]
  connectedDomains: ForceDomain[]
  error: string | null
}

export type ForceMonadDecision =
  | {ok: true; delivered: ForceDomain[]}
  | {ok: false; error: string}

/**
 * Монада Force хранит замысел серверного существования домена.
 *
 * Здесь находятся этапы запуска, приёма внешнего события, разрушения канала,
 * fail-stop и остановки. Runtime `force.ts` этого состояния не видит.
 */
export class ForceMonad {
  #state: ForceMonadState = "created"
  #error: string | null = null
  #connectedDomains = new Set<ForceDomain>()

  /**
   * Сервер запущен и просит подготовить Force к рождению runtime.
   *
   * В `created` Монада помещает пять заранее созданных сервером transport-
   * каналов в Store и входит в `starting`. Runtime разрешается только после
   * физического подключения всех обязательных доменов. Повторный вызов ничего
   * не подменяет; из `error` и `stopped` запуск не возобновляется.
   */
  onServerStarted(channels: ForceStore): ForceMonadStatus {
    if (this.#state !== "created") return this.#status()
    this.#state = "starting"
    try {
      for (const domain of forceDomains) force$[domain] = channels[domain]
    } catch (error) {
      this.#failStop("force", `could not prepare domain channels: ${this.#reason(error)}`)
    }
    return this.#status()
  }

  /**
   * Сервер закончил HTTP Upgrade физического канала обязательного домена.
   *
   * В `starting` Монада фиксирует готовый канал и после пятого домена разрешает
   * runtime, переходя в `running`. Повторное соединение того же домена не меняет
   * состояние. В `error` и `stopped` подключение не восстанавливает Вселенную.
   */
  onDomainChannelReady(domain: ForceDomain): ForceMonadStatus {
    if (this.#state !== "starting" && this.#state !== "running") return this.#status()
    this.#connectedDomains.add(domain)
    if (this.#state === "starting" && forceDomains.every((required) => this.#connectedDomains.has(required))) {
      this.#state = "running"
    }
    return this.#status()
  }

  /**
   * Сервер получил health-запрос.
   *
   * Метод не меняет состояние. Для `created`, `starting`, `error` и `stopped`
   * он возвращает `ok: false`; только `running` считается готовым. Причина
   * первого fail-stop сохраняется в ответе.
   */
  onHealthRequested(): Response {
    return json(this.#status(), this.#state === "running" ? 200 : 503)
  }

  /**
   * REST API получил Particle агента.
   *
   * В `running` Монада декодирует JSON, ставит доверенный `by: agent` и передаёт
   * Particle runtime-закону. Допустимую форму входа гарантирует закон REST-канала,
   * поэтому Монада не валидирует её повторно. В любом другом состоянии запрос
   * блокируется до чтения payload. Ошибка самого runtime закрывает общий gate и
   * переводит Монаду в `error`.
   */
  async onAgentParticleReceived(request: Request): Promise<Response> {
    if (this.#state !== "running") return json({ok: false, error: this.#blockedReason()}, 503)
    const payload = await readJson<ForceMessageInput>(request)
    if (!payload.ok) return json({ok: false, error: payload.error}, 400)

    const message = sourceForceMessage(payload.value, "agent")
    if (this.#mocksLegacyReplay(message)) {
      return json({ok: true, delivered: [], particle: message.parts[0]})
    }
    try {
      const delivered = routeParticle(message, "agent")
      return json({ok: true, delivered, particle: message.parts[0]})
    } catch (error) {
      this.#failStop("force", `runtime could not transfer a Particle: ${this.#reason(error)}`)
      return json({ok: false, error: this.#blockedReason()}, 500)
    }
  }

  /**
   * Физический канал домена передал Particle серверу Force.
   *
   * Сам канал уже гарантирует одну Particle с источником этого домена. Монада не
   * проверяет форму или источник повторно. Единственное временное исключение —
   * старый `z/test force/replay/...`: до отдельной миграции он поглощается здесь
   * и не попадает в runtime. Только фактическая ошибка передачи выполняет
   * fail-stop. В остальных состояниях Particle не проходит дальше.
   */
  onDomainParticleReceived(domain: ForceDomain, value: SourcedForceMessage): ForceMonadDecision {
    if (this.#state !== "running") return {ok: false, error: this.#blockedReason()}
    if (this.#mocksLegacyReplay(value)) return {ok: true, delivered: []}
    try {
      return {ok: true, delivered: routeParticle(value, domain)}
    } catch (error) {
      this.#failStop(domain, `could not transfer a Particle: ${this.#reason(error)}`)
      return {ok: false, error: this.#blockedReason()}
    }
  }

  /**
   * Сервер обнаружил разрушение одного обязательного канала.
   *
   * Во время `starting` Монада только снимает готовность ещё не родившейся
   * Вселенной и продолжает ждать транспорт. В `running` потеря последнего
   * соединения домена фиксирует первую ошибку, закрывает общий gate и переводит
   * Монаду в `error`. В `error` и `stopped` первая причина не меняется.
   */
  onDomainChannelDestroyed(domain: ForceDomain, cause: unknown): void {
    this.#connectedDomains.delete(domain)
    if (this.#state === "created" || this.#state === "starting" || this.#state === "stopped" || this.#state === "error") return
    this.#failStop(domain, `channel was destroyed: ${this.#reason(cause)}`)
  }

  /**
   * Сервер завершает собственный lifecycle.
   *
   * Монада закрывает общий gate и входит в `stopped` из любого текущего
   * состояния. Новые Particle после этого блокируются. Автоматического нового
   * запуска или восстановления каналов этот этап не выполняет.
   */
  onServerStopping(): void {
    this.#state = "stopped"
  }

  #failStop(domain: ForceDomain | "force", reason: string): void {
    if (this.#state === "error") return
    this.#error = domain === "force"
      ? `Force stopped: ${reason}`
      : `Force stopped: ${domain} ${reason}`
    this.#state = "error"
  }

  /**
   * Временно поглощает старый технический `z/test force/replay/...`.
   *
   * Домены ещё могут испускать эту Particle до отдельной миграции replay. Монада
   * принимает событие на серверной границе и намеренно ничего не передаёт в
   * runtime. Настоящий числовой `z/test` Energy сюда не попадает.
   */
  #mocksLegacyReplay(message: SourcedForceMessage): boolean {
    const particle = message.parts[0]
    return particle.part === "z" && particle.op === "test" && parseForceReplayPath(particle.path) !== null
  }

  #blockedReason(): string {
    return this.#error ?? `Force is not running: ${this.#state}`
  }

  #reason(value: unknown): string {
    return value instanceof Error ? value.message : String(value)
  }

  #status(): ForceMonadStatus {
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
