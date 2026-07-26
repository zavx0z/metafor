import {
  META_JSON_V1_SCHEMA,
  READ_META_JSON_METHOD,
  parseMetaAddress,
  validateMetaJSONV1,
  type MetaAddress,
  type MetaJSONV1,
  type ValidationIssue,
} from "@metafor/types/metafor/meta-json"
import type {MonadRpcPeer} from "shared/transport/monad"
import {
  DARK_DECLARATION_PROJECTION_METHOD,
  type DarkDeclarationProjectionV1,
} from "../dark/meta-json.ts"
import {
  BOUNDARY_META_JSON_PROJECTION_METHOD,
  type BoundaryMetaJSONProjectionV1,
} from "../boundary/meta-json.ts"

export type MetaJSONMonadPeer = Pick<MonadRpcPeer, "call" | "expose">

export type MetaJSONAssemblyErrorCode =
  | "invalid_params"
  | "invalid_provider_projection"
  | "provider_root_mismatch"
  | "validation_failed"

/** Deterministic local assembly failure. Provider call failures pass through unchanged. */
export class MetaJSONAssemblyError extends Error {
  override readonly name = "MetaJSONAssemblyError"

  constructor(
    readonly code: MetaJSONAssemblyErrorCode,
    message: string,
    readonly issues: readonly ValidationIssue[] = [],
  ) {
    super(message)
  }
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const readRoot = (params: unknown): MetaAddress => {
  if (!isPlainRecord(params)) {
    throw new MetaJSONAssemblyError(
      "invalid_params",
      "MetaJSON read params must be a plain object containing only root",
    )
  }
  const keys = Object.keys(params)
  if (keys.length !== 1 || keys[0] !== "root") {
    throw new MetaJSONAssemblyError(
      "invalid_params",
      "MetaJSON read params must contain only root",
    )
  }
  const root = typeof params.root === "string" ? parseMetaAddress(params.root) : null
  if (!root) {
    throw new MetaJSONAssemblyError(
      "invalid_params",
      "MetaJSON read root must be a canonical <owner>/<repository> address",
    )
  }
  return root
}

const isStrictJSONData = (
  value: unknown,
  ancestors = new Set<object>(),
): boolean => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) return true
  if (typeof value === "number") return Number.isFinite(value)
  if (typeof value !== "object" || ancestors.has(value)) return false
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) return false
      const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length")
      if (
        !lengthDescriptor ||
        !("value" in lengthDescriptor) ||
        !Number.isSafeInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < 0 ||
        lengthDescriptor.enumerable ||
        lengthDescriptor.configurable
      ) return false
      const length = lengthDescriptor.value as number
      const expectedKeys = new Set<string>(["length"])
      for (let index = 0; index < length; index++) {
        const key = String(index)
        expectedKeys.add(key)
        if (!Object.hasOwn(value, index)) return false
        const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
        if (
          !descriptor ||
          !descriptor.enumerable ||
          !("value" in descriptor) ||
          !isStrictJSONData(descriptor.value, ancestors)
        ) return false
      }
      const keys = Reflect.ownKeys(value)
      if (keys.length !== expectedKeys.size) return false
      for (const key of keys) {
        if (typeof key !== "string" || !expectedKeys.has(key)) return false
      }
      return true
    }
    if (!isPlainRecord(value)) return false
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === "symbol") return false
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !("value" in descriptor) ||
        !isStrictJSONData(descriptor.value, ancestors)
      ) return false
    }
    return true
  } finally {
    ancestors.delete(value)
  }
}

const invalidProviderProjection = (
  provider: "Dark" | "Boundary",
): MetaJSONAssemblyError =>
  new MetaJSONAssemblyError(
    "invalid_provider_projection",
    `${provider} MetaJSON projection must be cloneable JSON data`,
  )

const detachedProviderProjection = (
  value: unknown,
  provider: "Dark" | "Boundary",
): Record<string, unknown> => {
  try {
    if (!isStrictJSONData(value)) throw invalidProviderProjection(provider)
  } catch (error) {
    if (error instanceof MetaJSONAssemblyError) throw error
    throw invalidProviderProjection(provider)
  }
  let detached: unknown
  try {
    detached = structuredClone(value)
  } catch {
    throw invalidProviderProjection(provider)
  }
  try {
    if (isPlainRecord(detached) && isStrictJSONData(detached)) return detached
  } catch {
    // Fall through to the same deterministic provider contract.
  }
  throw invalidProviderProjection(provider)
}

const requireProviderRoot = (
  projection: Record<string, unknown>,
  provider: "Dark" | "Boundary",
  root: MetaAddress,
): void => {
  if (projection.root === root) return
  const actual = typeof projection.root === "string"
    ? `"${projection.root}"`
    : String(projection.root)
  throw new MetaJSONAssemblyError(
    "provider_root_mismatch",
    `${provider} MetaJSON projection root mismatch: expected "${root}", received ${actual}`,
  )
}

const validationMessage = (issues: readonly ValidationIssue[]): string =>
  issues
    .map(({path, code, message}) => `${path || "/"} [${code}] ${message}`)
    .join("; ")

/** Stateless Monad-owned structural join. It reads both providers on every call. */
export const assembleMetaJSON = async (
  peer: Pick<MonadRpcPeer, "call">,
  params: unknown,
): Promise<MetaJSONV1> => {
  const root = readRoot(params)
  const darkValue = await peer.call<DarkDeclarationProjectionV1>(
    "dark",
    DARK_DECLARATION_PROJECTION_METHOD,
    {root},
  )
  const dark = detachedProviderProjection(darkValue, "Dark")
  requireProviderRoot(dark, "Dark", root)

  const boundaryValue = await peer.call<BoundaryMetaJSONProjectionV1>(
    "boundary",
    BOUNDARY_META_JSON_PROJECTION_METHOD,
    {root},
  )
  const boundary = detachedProviderProjection(boundaryValue, "Boundary")
  requireProviderRoot(boundary, "Boundary", root)

  const candidate = {
    schema: META_JSON_V1_SCHEMA,
    root,
    template: dark.template,
    runtime: boundary.runtime,
  }
  const validation = validateMetaJSONV1(candidate)
  if (!validation.ok) {
    throw new MetaJSONAssemblyError(
      "validation_failed",
      `MetaJSON assembly validation failed: ${validationMessage(validation.issues)}`,
      validation.issues,
    )
  }
  return validation.value
}

/** Transport-neutral service surface; it retains no assembled document or provider result. */
export class MetaJSONMonad {
  onServerStarted(peer: MetaJSONMonadPeer): void {
    peer.expose(
      READ_META_JSON_METHOD,
      async (params) => await assembleMetaJSON(peer, params),
    )
  }
}
