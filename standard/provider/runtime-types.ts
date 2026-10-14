/** Native transport ports belong to Provider Processes, never Chat or browser Fields. */
import type {ProviderBinding} from "@metafor/types/metafor/providers"
import type {MassHandle} from "@metafor/types/metafor/mass"
export interface ProviderConnection {
  readonly sessionId: string
  prompt(text: string, signal: AbortSignal): Promise<string>
  settings?(selection: {model?: string; reasoning?: string}, signal: AbortSignal): Promise<unknown>
  close(): Promise<void>
}
export interface ProviderDriver {
  readonly binding?: ProviderBinding
  open(input: {sessionId: string | null; signal: AbortSignal}): Promise<ProviderConnection>
  check?(signal: AbortSignal): Promise<void>
  /** Только чтение прежней native сессии с полной server receipt, без prompt/new/resume. Встроенный peer adapter предоставляет Qwen recovery. */
  recover?(input: {sessionId: string; prompt: string; signal: AbortSignal}): Promise<ProviderRecoveryResult>
}
/** Подтверждённый native owner результат; transcript без этих anchors недостаточен для recovery. */
export interface ProviderRecoveryResult {
  sessionId: string
  prompt: string
  response: string
  native: {turnId: string; turnCount: number; conversationId: string; requestId: string; userId: string; assistantId: string}
}
export type ProviderEnergy = {connection?: ProviderConnection}
export interface ProviderTurnInput {
  request: string | null
  binding: string | null
  mass: {registry: MassHandle; turns: MassHandle}
  energy: ProviderEnergy
  signal: AbortSignal
  self: {atom: string}
  /** Trusted isolated tests may supply their owned transport; Fields cannot. */
  driver?: ProviderDriver
}
