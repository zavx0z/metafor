/** Нативный OS REPL: heap принадлежит session process, история — одной server incarnation. */
export const REPL_CHANNEL = "cosmos-repl"
export const REPL_METHODS = ["cosmos.repl.capabilities", "cosmos.repl.open", "cosmos.repl.evaluate", "cosmos.repl.read", "cosmos.repl.close"] as const
export type ReplJobState = "queued" | "running" | "completed" | "failed" | "uncertain" | "cancelled"
export interface ReplAuth {token: string}
export interface ReplSessionTarget extends ReplAuth {sessionId: string; incarnation: string}
export interface ReplOpenRequest extends ReplAuth {requestId: string}
export interface ReplEvaluateRequest extends ReplSessionTarget {requestId: string; code: string; timeoutMs?: number}
/** read возвращает не более 32 последних jobs либо одно явно выбранное jobId. */
export interface ReplReadRequest extends ReplSessionTarget {cursor: number; limit?: number; jobId?: string}
export interface ReplSession {
  sessionId: string
  incarnation: string
  state: "starting" | "ready" | "closed"
  cwd: string
  pid: number
  openedAt: number
  closedAt: number | null
  reason: string | null
}
export interface ReplJob {
  id: string
  requestId: string
  codeHash: string
  code: string
  /** Receipt ограничивает source preview; исходный codeHash остаётся точным. */
  codeTruncated?: boolean
  state: ReplJobState
  admittedAt: number
  startedAt: number | null
  finishedAt: number | null
  timeoutMs: number | null
  result: string | null
  error: string | null
}
export interface ReplLog {sequence: number; at: number; jobId: string | null; stream: "stdout" | "stderr"; text: string}
export interface ReplReadReceipt {
  schema: "cosmos/repl-read/v1"
  version: 1
  session: ReplSession
  jobs: ReplJob[]
  jobsTotal: number
  jobsTruncated: boolean
  logs: ReplLog[]
  cursor: number
  droppedThrough: number
}
export interface ReplJobReceipt {schema: "cosmos/repl-job/v1"; version: 1; sessionId: string; incarnation: string; job: ReplJob}
export interface ReplCapabilities {
  schema: "cosmos/repl-capabilities/v1"
  version: 1
  available: boolean
  execution: "native-bun-process"
  heapPersistence: "session-process-only"
  historyPersistence: "server-incarnation-only"
  automaticReplay: false
  defaultTimeoutMs: null
}
