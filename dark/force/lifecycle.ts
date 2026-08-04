import {
  sourceForceMessage,
  type ForceMessageInput,
  type SourcedForceMessage,
} from "shared/protocol/force/message"
import {particleDestinations, routeParticle, type ForceOrigin} from "./route.ts"
import {force$, forceDomains, type ForceDomain, type ForceStore} from "./store.ts"
import type {DarkForceHistory, DarkForceHistoryParticle} from "./history.ts"
import type {CheckpointDeliveryReceipt} from "../checkpoint/barrier.ts"
import type {
  MetaForceAcceptanceIdentity,
  MetaMatterAuthoringCauseV1,
} from "@metafor/types/metafor/authoring"

export type ForceLifecycleState = "created" | "starting" | "recovering" | "running" | "error" | "stopped"

export type ForceLifecycleStatus = {
  ok: boolean
  domain: "force"
  state: ForceLifecycleState
  externalAdmission: "open" | "closed"
  requiredDomains: ForceDomain[]
  connectedDomains: ForceDomain[]
  error: string | null
}

export type ForceLifecycleDecision =
  | {ok: true; delivered: ForceDomain[]}
  | {ok: false; reason: "not_running" | "runtime_error"; error: string}

export type ForceAgentDecision =
  | {ok: true; delivered: ForceDomain[]; particle: SourcedForceMessage["parts"][0]}
  | {ok: false; reason: "not_running" | "admission_closed" | "runtime_error"; error: string}

export type ForceAuthoringDecision =
  | {
      ok: true
      delivered: ForceDomain[]
      particle: SourcedForceMessage["parts"][0]
      acceptance: MetaForceAcceptanceIdentity
    }
  | {ok: false; reason: "not_running" | "admission_closed" | "runtime_error"; error: string}

export interface ForceCheckpointTransfer {
  pendingDeliveries(): CheckpointDeliveryReceipt[]
  recordAccepted(
    acceptanceSequence: number,
    destinations: readonly ForceDomain[],
  ): CheckpointDeliveryReceipt[]
  prepare(receipts: readonly CheckpointDeliveryReceipt[]): Promise<void>
  waitApplied(receipts: readonly CheckpointDeliveryReceipt[]): Promise<void>
  acceptedFrom(domain: ForceDomain): void
}

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
  #externalAdmissionClosed = false
  #startup: Promise<void> = Promise.resolve()

  constructor(
    private readonly history: Pick<DarkForceHistory, "accept"> & Partial<Pick<DarkForceHistory, "read">>,
    private readonly checkpoint?: ForceCheckpointTransfer,
  ) {}

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
    if (this.#state !== "starting" && this.#state !== "recovering" && this.#state !== "running") return this.status()
    this.#connectedDomains.add(domain)
    if (this.#state === "starting" && forceDomains.every((required) => this.#connectedDomains.has(required))) {
      const pending = this.checkpoint?.pendingDeliveries() ?? []
      if (pending.length === 0) {
        this.#state = "running"
      } else {
        this.#state = "recovering"
        this.#startup = this.#recover(pending).then(() => {
          if (this.#state === "recovering") this.#state = "running"
        }).catch((error) => {
          this.#failStop("force", `could not recover accepted deliveries: ${this.#reason(error)}`)
        })
      }
    }
    return this.status()
  }

  async waitUntilStarted(): Promise<ForceLifecycleStatus> {
    await this.#startup
    return this.status()
  }

  /**
   * Внешний ingress передал уже декодированную Particle агента.
   *
   * В `running` lifecycle ставит доверенный `by: agent` и передаёт Particle
   * runtime-закону. Декодирование и проверка физического входа уже выполнены
   * снаружи. Ошибка runtime закрывает общий gate и переводит lifecycle в `error`.
   */
  async acceptAgentParticle(input: ForceMessageInput): Promise<ForceAgentDecision> {
    if (this.#state !== "running") {
      return {ok: false, reason: "not_running", error: this.#blockedReason()}
    }
    if (this.#externalAdmissionClosed) {
      return {
        ok: false,
        reason: "admission_closed",
        error: "Force external admission is held by an internal causal operation",
      }
    }
    return await this.#transferAgentParticle(input)
  }

  /**
   * Executes exactly one owner-supplied agent Particle while ordinary external
   * admission stays closed. The caller must hold and re-establish the causal
   * checkpoint frontier around this operation.
   */
  async stepAgentParticle(input: ForceMessageInput): Promise<ForceAgentDecision> {
    if (this.#state !== "running") {
      return {ok: false, reason: "not_running", error: this.#blockedReason()}
    }
    if (!this.#externalAdmissionClosed) {
      return {
        ok: false,
        reason: "admission_closed",
        error: "Force internal step requires closed external admission",
      }
    }
    return await this.#transferAgentParticle(input)
  }

  async #transferAgentParticle(input: ForceMessageInput): Promise<ForceAgentDecision> {
    const message = sourceForceMessage(input, "agent")
    try {
      const transfer = await this.#transfer(message, "agent")
      return {ok: true, delivered: transfer.delivered, particle: message.parts[0]}
    } catch (error) {
      this.#failStop("force", `runtime could not transfer a Particle: ${this.#reason(error)}`)
      return {ok: false, reason: "runtime_error", error: this.#blockedReason()}
    }
  }

  /** Accepts one Dark Monad-authored Particle with immutable RPC causation. */
  async acceptAuthoringParticle(
    input: ForceMessageInput,
    authoring: MetaMatterAuthoringCauseV1,
  ): Promise<ForceAuthoringDecision> {
    if (this.#state !== "running") {
      return {ok: false, reason: "not_running", error: this.#blockedReason()}
    }
    if (this.#externalAdmissionClosed) {
      return {
        ok: false,
        reason: "admission_closed",
        error: "Force external admission is held by an internal causal operation",
      }
    }
    const message = sourceForceMessage(input, "dark")
    try {
      const transfer = await this.#transfer(message, "dark", authoring)
      return {
        ok: true,
        delivered: transfer.delivered,
        particle: message.parts[0],
        acceptance: this.#acceptanceIdentity(transfer.accepted),
      }
    } catch (error) {
      this.#failStop("force", `runtime could not transfer an authored Particle: ${this.#reason(error)}`)
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
  async acceptParticle(domain: ForceDomain, value: SourcedForceMessage): Promise<ForceLifecycleDecision> {
    if (this.#state !== "running" && this.#state !== "recovering") {
      return {ok: false, reason: "not_running", error: this.#blockedReason()}
    }
    try {
      const transfer = await this.#transfer(value, domain)
      return {ok: true, delivered: transfer.delivered}
    } catch (error) {
      this.#failStop(domain, `could not transfer a Particle: ${this.#reason(error)}`)
      return {ok: false, reason: "runtime_error", error: this.#blockedReason()}
    }
  }

  async #recover(pending: readonly CheckpointDeliveryReceipt[]): Promise<void> {
    if (!this.checkpoint || !this.history.read) {
      throw new Error("Force recovery requires checkpoint receipts and readable history")
    }
    const sequences = [...new Set(pending.map(({acceptanceSequence}) => acceptanceSequence))].toSorted((a, b) => a - b)
    for (const sequence of sequences) {
      const [entry] = this.history.read({fromSequence: sequence, toSequence: sequence, limit: 1})
      if (!entry || entry.sequence !== sequence) {
        throw new Error(`Force history entry ${sequence} is unavailable for recovery`)
      }
      const origin: ForceOrigin = entry.particle.by === "agent"
        ? "agent"
        : forceDomains.includes(entry.particle.by as ForceDomain)
          ? entry.particle.by as ForceDomain
          : (() => { throw new Error(`Force history entry ${sequence} has an invalid source`) })()
      const expected = new Set(particleDestinations({parts: [entry.particle]}, origin))
      const receipts = pending.filter((receipt) => receipt.acceptanceSequence === sequence)
      if (receipts.some(({domain}) => !expected.has(domain))) {
        throw new Error(`Checkpoint recovery destinations do not match Force history entry ${sequence}`)
      }
      await this.checkpoint.prepare(receipts)
      for (const receipt of receipts) force$[receipt.domain].send({parts: [entry.particle]})
      await this.checkpoint.waitApplied(receipts)
    }
  }

  async #transfer(
    message: SourcedForceMessage,
    origin: ForceOrigin,
    authoring?: MetaMatterAuthoringCauseV1,
  ): Promise<{delivered: ForceDomain[]; accepted: DarkForceHistoryParticle}> {
    const accepted = this.history.accept(message.parts[0], authoring) as DarkForceHistoryParticle
    const destinations = particleDestinations(message, origin)
    const receipts = this.checkpoint?.recordAccepted(accepted.sequence, destinations) ?? []
    if (this.checkpoint) await this.checkpoint.prepare(receipts)
    const delivered = routeParticle(message, origin)
    if (origin !== "agent" && this.checkpoint) this.checkpoint.acceptedFrom(origin)
    if (this.checkpoint) await this.checkpoint.waitApplied(receipts)
    return {delivered, accepted}
  }

  #acceptanceIdentity(entry: DarkForceHistoryParticle): MetaForceAcceptanceIdentity {
    const separator = entry.id.lastIndexOf(":")
    if (separator <= 0 || entry.id.slice(separator + 1) !== String(entry.sequence)) {
      throw new Error("Dark Force history returned an invalid acceptance identity")
    }
    return {
      cutId: entry.id.slice(0, separator),
      sequence: entry.sequence,
      id: entry.id,
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
    this.#externalAdmissionClosed = true
  }

  /** Closes only agent ingress; domain causal output remains accepted. */
  closeExternalAdmission(): ForceLifecycleStatus {
    if (this.#state !== "running") {
      throw new Error(this.#blockedReason())
    }
    this.#externalAdmissionClosed = true
    return this.status()
  }

  /** Reopens agent ingress only while the same Force lifecycle is healthy. */
  openExternalAdmission(): ForceLifecycleStatus {
    if (this.#state !== "running") {
      throw new Error(this.#blockedReason())
    }
    this.#externalAdmissionClosed = false
    return this.status()
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
      externalAdmission: this.#externalAdmissionClosed ? "closed" : "open",
      requiredDomains: [...forceDomains],
      connectedDomains: forceDomains.filter((domain) => this.#connectedDomains.has(domain)),
      error: this.#error,
    }
  }
}
