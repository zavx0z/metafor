/**
 * Execution-bound Oracle access under the [Energy law](../../docs/domains/ENERGY.md#доступ-process-к-oracle-environment).
 * The trusted local profile reads the current full-root Graph. An independently
 * assigned Codespace Tool may call closed native status/start operations.
 * Назначенный REPL Tool исполняет код в отдельном процессе с возможностями ОС;
 * его секрет доступа остаётся в native composition. Права канонических изменений
 * принадлежат обычным Oracle/Force paths и не расширяются этим назначением.
 * @packageDocumentation
 */
import type {AtomRef, Graph, MetaAddress} from "./graph"
import type {CodespaceResult} from "./codespace"
import type {OraclePeerLease, OraclePeerLeaseInput, ProviderPeerCatalogSnapshot} from "./peer-oracle"
import type {ReplCapabilities, ReplSession, ReplJobReceipt, ReplReadReceipt, ReplOpenRequest, ReplEvaluateRequest, ReplReadRequest, ReplSessionTarget} from "../cosmos/repl"

/** Closed operations; native host composition decides which are assigned. */
export interface OracleProcessOperations {
  readGraph: {arguments: Readonly<Record<string, never>>; result: Graph}
  "existingCodespace.status": {arguments: Readonly<Record<string, never>>; result: CodespaceResult}
  "existingCodespace.start": {arguments: {readonly requestId: string}; result: CodespaceResult}
  "provider.peers.read": {arguments: Readonly<Record<string, never>>; result: ProviderPeerCatalogSnapshot}
  "cosmos.repl.capabilities": {arguments: Readonly<Record<string, never>>; result: ReplCapabilities}
  "cosmos.repl.open": {arguments: Omit<ReplOpenRequest, "token">; result: ReplSession}
  "cosmos.repl.evaluate": {arguments: Omit<ReplEvaluateRequest, "token">; result: ReplJobReceipt}
  "cosmos.repl.read": {arguments: Omit<ReplReadRequest, "token">; result: ReplReadReceipt}
  "cosmos.repl.close": {arguments: Omit<ReplSessionTarget, "token">; result: ReplSession}
}

/** The operation description and its closed arguments match the bound call. */
export interface OracleProcessEnvironmentOperation {
  readonly name: keyof OracleProcessOperations
  readonly description: string
  readonly inputSchema: {
    readonly type: "object"
    readonly properties: Readonly<Record<string, {readonly type: "string" | "number"; readonly maxLength?: number; readonly minimum?: number; readonly maximum?: number}>>
    readonly required?: readonly string[]
    readonly additionalProperties: false
  }
}

/** Caller and scope come from Energy and the current Graph, never action arguments. */
export interface OracleProcessEnvironmentRead {
  readonly contractVersion: 1
  readonly actor: {readonly ref: AtomRef; readonly meta: MetaAddress}
  readonly scope: {readonly kind: "full-root"; readonly root: MetaAddress}
  readonly operations: readonly OracleProcessEnvironmentOperation[]
  readonly graph: Graph
  /** Наблюдаемые Tool actors с отдельным назначением; это не права самого Agent. */
  readonly toolCapabilities?: readonly {readonly actor: {readonly ref: AtomRef; readonly meta: MetaAddress}; readonly operations: readonly (keyof OracleProcessOperations)[]}[]
}

/**
 * An optional capability of one Process action, revoked on completion or abort.
 * Every read verifies the bound actor still occurs in the returned world.
 * `readGraph` is an ordinary current observation, not `readGraphDelta` or an
 * applied-through cut: waiting for the running action would deadlock itself.
 * See [execution tests](../../quantum/energy/environment.spec.ts).
 */
export interface OracleProcessEnvironment {
  read(): Promise<OracleProcessEnvironmentRead>
  call<Name extends keyof OracleProcessOperations>(name: Name, arguments_: OracleProcessOperations[Name]["arguments"]): Promise<OracleProcessOperations[Name]["result"]>
  /** Exact native peer role only. Returned lease outlives this action, never its Mass resource or Energy. */
  openPeerOracle?(input: OraclePeerLeaseInput): Promise<OraclePeerLease>
}
