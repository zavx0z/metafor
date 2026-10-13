/**
 * Energy's execution-bound adapter for public Graph and assigned native Tool RPC.
 * Native composition grants exact Meta names; no caller-selected RPC or domain Store
 * crosses the [Process boundary](../../docs/domains/ENERGY.md#доступ-process-к-oracle-environment).
 * @packageDocumentation
 */
import {isMetaPackageName, parseMetaAddress, READ_GRAPH_METHOD, validateGraph, type AtomRef, type Graph, type RuntimeNode} from "@metafor/types/metafor/graph"
import type {OracleProcessEnvironment, OracleProcessEnvironmentRead, OracleProcessEnvironmentOperation, OracleProcessOperations} from "@metafor/types/metafor/environment"
import {CODESPACE_HOST, CODESPACE_META, CODESPACE_START_METHOD, CODESPACE_STATUS_METHOD, isCodespaceResult, validCodespaceRequestId} from "@metafor/types/metafor/codespace"
import {PROVIDER_META} from "@metafor/types/metafor/providers"
import {PROVIDER_PEERS_READ_METHOD, type OraclePeerLeaseInput} from "@metafor/types/metafor/peer-oracle"
import type {EnergyPeerOracleKernel} from "./peer-oracle"
import {createHash} from "node:crypto"
import type {NativeReplAssignment} from "shared/native/repl"
import {REPL_CHANNEL, REPL_METHODS, type ReplSession} from "@metafor/types/cosmos/repl"
import {DARK_FORCE_HISTORY_READ_METHOD} from "shared/protocol/metafor/observation"
import type {OracleRpcPeer} from "shared/transport/oracle"

/** Missing/empty native configuration grants nothing; malformed names fail closed. */
export function readOracleEnvironmentGraphScopes(environment: Readonly<Record<string, string | undefined>>): readonly string[] {
  const input = environment.ORACLE_ENVIRONMENT_GRAPH_SCOPES?.trim()
  if (!input) return Object.freeze([])
  const scopes = input.split(",").map(name => name.trim())
  if (scopes.some(name => !isMetaPackageName(name))) throw new Error("Oracle Environment scopes require exact Meta package names")
  return Object.freeze([...new Set(scopes)])
}

/** The separate host grant accepts only the exact Tool Meta, never a wildcard or Agent. */
export function readOracleEnvironmentCodespaceScopes(environment: Readonly<Record<string, string | undefined>>): readonly string[] {
  const value = environment.ORACLE_ENVIRONMENT_CODESPACE_SCOPES?.trim()
  if (!value) return []
  if (value !== CODESPACE_META) throw new Error("Codespace scope requires the exact Tool Meta")
  return [CODESPACE_META]
}

/** Нативное назначение хранится только в Energy, никогда в Process arguments или Mass. */
export interface EnergyNativeReplGrant {
  assignment: NativeReplAssignment
  sessions: Map<string, {world: string; actor: string; incarnation: string}>
}
export function readOracleEnvironmentReplScopes(environment: Readonly<Record<string, string | undefined>>): readonly string[] {
  const value = environment.ORACLE_ENVIRONMENT_REPL_SCOPES?.trim()
  if (!value) return []
  if (value !== "@metafor/repl") throw new Error("REPL scope requires the exact Tool Meta")
  return ["@metafor/repl"]
}

/** Durable peer and discovery roles are exact and independently granted by native composition. */
export function readOracleEnvironmentPeerRoles(environment: Readonly<Record<string, string | undefined>>) {
  const scopes = (key: string, expected: string) => {
    const value = environment[key]?.trim()
    if (!value) return []
    if (value !== expected) throw new Error("Peer Oracle role requires its exact Meta")
    return [expected]
  }
  return {peerScopes: scopes("ORACLE_ENVIRONMENT_PEER_SCOPES", "@internal/peer"), providerDiscoveryScopes: scopes("ORACLE_ENVIRONMENT_PROVIDER_DISCOVERY_SCOPES", PROVIDER_META)}
}

const emptyArguments = (value: unknown): boolean => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return (prototype === Object.prototype || prototype === null) && Reflect.ownKeys(value).length === 0
}

/**
 * Creates a revocable capability only for the pending action's granted Meta.
 * Revocation rejects in-flight observations too; a late RPC result never leaves
 * this adapter. The owner calls close in the action's finally, including errors.
 * [Tests](./environment.spec.ts) cover grant, identity, arguments and lifetime.
 */
export function createProcessOracleEnvironment(options: {
  peer: Pick<OracleRpcPeer, "call">
  graphScopes: readonly string[]
  codespaceScopes?: readonly string[]
  replScopes?: readonly string[]
  replGrant?: EnergyNativeReplGrant
  peerScopes?: readonly string[]
  providerDiscoveryScopes?: readonly string[]
  peerKernel?: EnergyPeerOracleKernel
  atomId: number
  wimp: string
  signal: AbortSignal
}): {environment: OracleProcessEnvironment; close(): void} | undefined {
  const codespace = options.wimp === CODESPACE_META && options.codespaceScopes?.includes(CODESPACE_META) === true
  const nativeReplAssigned = options.replScopes?.includes("@metafor/repl") === true && options.replGrant !== undefined
  const repl = options.wimp === "@metafor/repl" && nativeReplAssigned
  const peerRole = options.wimp === "@internal/peer" && options.peerScopes?.includes("@internal/peer") === true && options.peerKernel !== undefined
  const discoveryRole = options.wimp === PROVIDER_META && options.providerDiscoveryScopes?.includes(PROVIDER_META) === true && options.peerKernel !== undefined
  if (!options.graphScopes.includes(options.wimp) && !codespace && !repl && !peerRole && !discoveryRole) return
  const meta = parseMetaAddress(options.wimp)
  if (!meta || !Number.isSafeInteger(options.atomId) || options.atomId <= 0) throw new Error("Invalid Oracle Environment actor")
  const actor = Object.freeze({ref: `atom:${options.atomId}` as AtomRef, meta})
  let closed = false
  const revoked = Promise.withResolvers<never>()
  void revoked.promise.catch(() => {})
  const close = () => {
    if (closed) return
    closed = true
    options.signal.removeEventListener("abort", close)
    revoked.reject(new Error("Oracle Environment execution has ended"))
  }
  options.signal.addEventListener("abort", close, {once: true})
  if (options.signal.aborted) close()
  const assertLive = () => {
    if (closed || options.signal.aborted) throw new Error("Oracle Environment execution has ended")
  }
  const readGraph = async (): Promise<Graph> => {
    assertLive()
    const observed = await Promise.race([options.peer.call<unknown>("dark", READ_GRAPH_METHOD, {}), revoked.promise])
    assertLive()
    const validation = validateGraph(observed)
    if (!validation.ok) throw new Error("Oracle Environment received an invalid Graph")
    const graph = validation.value
    const pending: RuntimeNode[] = [...graph.runtime.roots]
    let found = false
    for (let index = 0; index < pending.length; index++) {
      const node = pending[index]!
      if (node.kind === "atom" && node.ref === actor.ref && node.meta === actor.meta) found = true
      pending.push(...(node.children ?? []))
    }
    if (!found) throw new Error("Oracle Environment actor is absent from the current Graph")
    assertLive()
    return structuredClone(graph)
  }
  const replDescriptors: OracleProcessEnvironmentOperation[] = REPL_METHODS.map(name => {
    const properties: OracleProcessEnvironmentOperation["inputSchema"]["properties"] = name === "cosmos.repl.capabilities" ? {} : name === "cosmos.repl.open" ? {requestId: {type: "string", maxLength: 160}}
      : {sessionId: {type: "string", maxLength: 160}, incarnation: {type: "string", maxLength: 160},
        ...(name === "cosmos.repl.evaluate" ? {requestId: {type: "string" as const, maxLength: 160}, code: {type: "string" as const, maxLength: 524288}, timeoutMs: {type: "number" as const, minimum: 1, maximum: 2147483647}} : {}),
        ...(name === "cosmos.repl.read" ? {cursor: {type: "number" as const, minimum: 0}, limit: {type: "number" as const, minimum: 1, maximum: 512}, jobId: {type: "string" as const, maxLength: 160}} : {})}
    return {name, description: "Host-assigned native Bun REPL operation", inputSchema: {type: "object", properties,
      required: Object.keys(properties).filter(key => !["timeoutMs", "limit", "jobId"].includes(key)), additionalProperties: false}}
  })
  const environment: OracleProcessEnvironment = Object.freeze({
    async read(...arguments_: unknown[]): Promise<OracleProcessEnvironmentRead> {
      assertLive()
      if (arguments_.length) throw new Error("Oracle Environment read accepts no arguments")
      const graph = await readGraph()
      assertLive()
      const operations: OracleProcessEnvironmentOperation[] = [{name: "readGraph", description: "Read the current full-root Graph", inputSchema: {type: "object", properties: {}, additionalProperties: false}}]
      if (codespace) operations.push(
        {name: CODESPACE_STATUS_METHOD, description: "Observe the host-assigned existing Codespace", inputSchema: {type: "object", properties: {}, additionalProperties: false}},
        {name: CODESPACE_START_METHOD, description: "Request one start of the host-assigned existing Codespace", inputSchema: {type: "object", properties: {requestId: {type: "string", maxLength: 200}}, required: ["requestId"], additionalProperties: false}},
      )
      if (repl) operations.push(...replDescriptors)
      if (discoveryRole) operations.push({name: PROVIDER_PEERS_READ_METHOD, description: "Read catalogs of admitted peer worlds on the owned network", inputSchema: {type: "object", properties: {}, additionalProperties: false}})
      const nodes: RuntimeNode[] = [...graph.runtime.roots]
      for (let index = 0; index < nodes.length; index++) nodes.push(...(nodes[index]!.children ?? []))
      const toolCapabilities = nativeReplAssigned ? nodes.flatMap(node => node.kind === "atom" && node.meta === "@metafor/repl" ? [{actor: {ref: node.ref, meta: node.meta}, operations: [...REPL_METHODS]}] : []) : []
      return {contractVersion: 1, actor, scope: {kind: "full-root", root: graph.root}, operations, graph, toolCapabilities}
    },
    async call<Name extends keyof OracleProcessOperations>(name: Name, arguments_: OracleProcessOperations[Name]["arguments"], ...extra: unknown[]): Promise<OracleProcessOperations[Name]["result"]> {
      assertLive()
      if (name === READ_GRAPH_METHOD && !extra.length && emptyArguments(arguments_)) return await readGraph() as OracleProcessOperations[Name]["result"]
      if (name === PROVIDER_PEERS_READ_METHOD && discoveryRole && !extra.length && emptyArguments(arguments_)) {
        await readGraph()
        const result = await Promise.race([options.peerKernel!.read(options.signal), revoked.promise])
        assertLive()
        return result as OracleProcessOperations[Name]["result"]
      }
      if (REPL_METHODS.includes(name as typeof REPL_METHODS[number])) {
        if (!repl || extra.length || !arguments_ || typeof arguments_ !== "object" || Array.isArray(arguments_)) throw new Error("Native REPL capability is not assigned to this Tool")
        const descriptor = replDescriptors.find(item => item.name === name)!
        const values = arguments_ as Record<string, unknown>
        if (Reflect.ownKeys(values).some(key => typeof key !== "string" || !Object.hasOwn(descriptor.inputSchema.properties, key)) || descriptor.inputSchema.required?.some(key => !Object.hasOwn(values, key))) throw new Error("Invalid native REPL Tool arguments")
        for (const [key, value] of Object.entries(values)) {
          const schema = descriptor.inputSchema.properties[key]!
          if (schema.type === "string" ? typeof value !== "string" || value.length > schema.maxLength! : typeof value !== "number" || !Number.isSafeInteger(value) || value < (schema.minimum ?? 0) || value > (schema.maximum ?? Number.MAX_SAFE_INTEGER)) throw new Error("Invalid native REPL Tool arguments")
        }
        const graph = await readGraph()
        const frontier = await Promise.race([options.peer.call<{frontier: {cutId: string}}>("dark", DARK_FORCE_HISTORY_READ_METHOD, {contractVersion: 1, query: {kind: "frontier"}}), revoked.promise])
        assertLive()
        if (typeof frontier.frontier?.cutId !== "string" || !frontier.frontier.cutId) throw new Error("Native REPL world binding is unavailable")
        const world = JSON.stringify([graph.root, frontier.frontier.cutId])
        const grant = options.replGrant!
        if (name !== "cosmos.repl.open" && name !== "cosmos.repl.capabilities") {
          const binding = grant.sessions.get(String(values.sessionId))
          if (!binding || binding.actor !== actor.ref || binding.world !== world || binding.incarnation !== values.incarnation) throw new Error("Native REPL session is not owned by this Tool world; never replay")
        }
        const request: Record<string, unknown> = {...values, token: grant.assignment.token}
        if (typeof values.requestId === "string") request.requestId = createHash("sha256").update(JSON.stringify([world, actor.ref, values.requestId])).digest("hex")
        try {
          const result = await Promise.race([options.peer.call<unknown>(REPL_CHANNEL, name, request), revoked.promise])
          assertLive()
          if (name === "cosmos.repl.open") {
            const session = result as ReplSession
            if (typeof session.sessionId !== "string" || typeof session.incarnation !== "string") throw new Error("Invalid native REPL session")
            grant.sessions.set(session.sessionId, {world, actor: actor.ref, incarnation: session.incarnation})
          }
          if (JSON.stringify(result).includes(grant.assignment.token)) throw new Error("Native REPL returned private credential data")
          return result as OracleProcessOperations[Name]["result"]
        } catch (error) {throw new Error((error instanceof Error ? error.message : "Native REPL call failed").split(grant.assignment.token).join("[REDACTED]"))}
      }
      const start = name === CODESPACE_START_METHOD
      const validArguments = start ? arguments_ !== null && typeof arguments_ === "object" && !Array.isArray(arguments_) &&
        Reflect.ownKeys(arguments_).length === 1 && Object.hasOwn(arguments_, "requestId") &&
        validCodespaceRequestId(Reflect.get(arguments_, "requestId")) : emptyArguments(arguments_)
      if (!codespace || extra.length || (name !== CODESPACE_STATUS_METHOD && !start) || !validArguments) {
        throw new Error("Oracle Environment permits only readGraph with empty arguments or explicitly assigned Codespace operations")
      }
      const graph = await readGraph()
      assertLive()
      const result = await Promise.race([options.peer.call<unknown>(CODESPACE_HOST, name, {
        actor: {...actor, root: graph.root}, ...(start ? {requestId: Reflect.get(arguments_, "requestId")} : {}),
      }), revoked.promise])
      assertLive()
      if (!isCodespaceResult(result) || result.operation !== (start ? "start" : "status")) throw new Error("Invalid Codespace host result")
      return result as OracleProcessOperations[Name]["result"]
    },
    ...(peerRole ? {async openPeerOracle(input: OraclePeerLeaseInput) {
      assertLive()
      await readGraph()
      const lease = await options.peerKernel!.open({ref: actor.ref, meta: "@internal/peer"}, input)
      try {assertLive(); return lease} catch (error) {await lease.close(); throw error}
    }} : {}),
  })
  return {environment, close}
}
