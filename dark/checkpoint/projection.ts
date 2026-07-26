import {createHash} from "node:crypto"
import {
  validateMetaJSONV1,
  type MetaJSONV1,
} from "@metafor/types/metafor/meta-json"
import type {
  CheckpointJsonPatchOperationV1,
  CheckpointJsonValue,
} from "@metafor/types/dark/checkpoint"

export type CanonicalMetaJSONProjection = {
  value: MetaJSONV1
  bytes: Uint8Array
  sha256: string
}
export class CheckpointProjectionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = "CheckpointProjectionError"
  }
}

const utf16Compare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0

const validUnicodeScalarString = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0xd800 || code > 0xdfff) continue
    if (code > 0xdbff || index + 1 >= value.length) return false
    const next = value.charCodeAt(index + 1)
    if (next < 0xdc00 || next > 0xdfff) return false
    index += 1
  }
  return true
}

const closedJSON = (
  value: unknown,
  path: string,
  ancestors = new Set<object>(),
): CheckpointJsonValue => {
  if (value === null || typeof value === "boolean") return value
  if (typeof value === "string") {
    if (!validUnicodeScalarString(value)) {
      throw new CheckpointProjectionError("invalid_unicode", `${path || "/"} contains a lone UTF-16 surrogate`)
    }
    return value
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CheckpointProjectionError("invalid_number", `${path || "/"} contains a non-finite number`)
    }
    return value
  }
  if (typeof value !== "object" || ancestors.has(value)) {
    throw new CheckpointProjectionError("invalid_json", `${path || "/"} is not closed acyclic JSON data`)
  }
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new CheckpointProjectionError("invalid_json", `${path || "/"} is not a plain JSON array`)
      }
      const output: CheckpointJsonValue[] = []
      const ownKeys = Reflect.ownKeys(value)
      if (
        ownKeys.length !== value.length + 1 ||
        ownKeys.some((key) => key !== "length" && (
          typeof key !== "string" ||
          !/^(?:0|[1-9][0-9]*)$/.test(key) ||
          Number(key) >= value.length
        ))
      ) {
        throw new CheckpointProjectionError("invalid_json", `${path || "/"} is sparse or has extra properties`)
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index))
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
          throw new CheckpointProjectionError("invalid_json", `${path}/${index} is not a JSON data element`)
        }
        output.push(closedJSON(descriptor.value, `${path}/${index}`, ancestors))
      }
      return output
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CheckpointProjectionError("invalid_json", `${path || "/"} is not a plain JSON object`)
    }
    const output: {[key: string]: CheckpointJsonValue} = {}
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !validUnicodeScalarString(key)) {
        throw new CheckpointProjectionError("invalid_json", `${path || "/"} has a non-JSON object key`)
      }
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw new CheckpointProjectionError("invalid_json", `${path || "/"} has an accessor or hidden property`)
      }
      output[key] = closedJSON(descriptor.value, `${path}/${pointerToken(key)}`, ancestors)
    }
    return output
  } finally {
    ancestors.delete(value)
  }
}

const canonicalString = (value: CheckpointJsonValue): string => {
  if (value === null) return "null"
  if (typeof value === "boolean" || typeof value === "number") return JSON.stringify(value)
  if (typeof value === "string") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalString).join(",")}]`
  return `{${Object.keys(value)
    .toSorted(utf16Compare)
    .map((key) => `${JSON.stringify(key)}:${canonicalString(value[key]!)}`)
    .join(",")}}`
}

const pointerToken = (value: string): string =>
  value.replaceAll("~", "~0").replaceAll("/", "~1")

const pointerPath = (parent: string, key: string): string =>
  `${parent}/${pointerToken(key)}`

const sameJSON = (left: CheckpointJsonValue, right: CheckpointJsonValue): boolean =>
  canonicalString(left) === canonicalString(right)

const diffValue = (
  base: CheckpointJsonValue,
  result: CheckpointJsonValue,
  path: string,
  operations: CheckpointJsonPatchOperationV1[],
): void => {
  if (sameJSON(base, result)) return
  if (Array.isArray(base) || Array.isArray(result)) {
    operations.push({op: "replace", path, value: structuredClone(result)})
    return
  }
  if (
    typeof base !== "object" ||
    base === null ||
    typeof result !== "object" ||
    result === null
  ) {
    operations.push({op: "replace", path, value: structuredClone(result)})
    return
  }

  const baseKeys = Object.keys(base)
  const resultKeys = Object.keys(result)
  const resultSet = new Set(resultKeys)
  for (const key of baseKeys.filter((key) => !resultSet.has(key)).toSorted(utf16Compare)) {
    operations.push({op: "remove", path: pointerPath(path, key)})
  }
  const baseSet = new Set(baseKeys)
  for (const key of baseKeys.filter((key) => resultSet.has(key)).toSorted(utf16Compare)) {
    diffValue(base[key]!, result[key]!, pointerPath(path, key), operations)
  }
  for (const key of resultKeys.filter((key) => !baseSet.has(key)).toSorted(utf16Compare)) {
    operations.push({op: "add", path: pointerPath(path, key), value: structuredClone(result[key]!)})
  }
}

const decodePointer = (path: string): string[] => {
  if (path === "") return []
  if (!path.startsWith("/")) {
    throw new CheckpointProjectionError("invalid_patch_path", `JSON Patch path is invalid: ${path}`)
  }
  return path.slice(1).split("/").map((token) => {
    if (/(?:~[^01])|(?:~$)/.test(token)) {
      throw new CheckpointProjectionError("invalid_patch_path", `JSON Patch path is invalid: ${path}`)
    }
    return token.replaceAll("~1", "/").replaceAll("~0", "~")
  })
}

const containerAt = (
  root: CheckpointJsonValue,
  tokens: readonly string[],
): {parent: CheckpointJsonValue[] | {[key: string]: CheckpointJsonValue}; key: string} => {
  if (tokens.length === 0) {
    throw new CheckpointProjectionError("invalid_patch_path", "Root JSON Patch operation has no parent")
  }
  let current: CheckpointJsonValue = root
  for (const token of tokens.slice(0, -1)) {
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/.test(token) || Number(token) >= current.length) {
        throw new CheckpointProjectionError("invalid_patch_path", `JSON Patch array index does not exist: ${token}`)
      }
      current = current[Number(token)]!
      continue
    }
    if (typeof current !== "object" || current === null || !Object.hasOwn(current, token)) {
      throw new CheckpointProjectionError("invalid_patch_path", `JSON Patch object member does not exist: ${token}`)
    }
    current = current[token]!
  }
  if (typeof current !== "object" || current === null) {
    throw new CheckpointProjectionError("invalid_patch_path", "JSON Patch parent is not a container")
  }
  return {parent: current, key: tokens.at(-1)!}
}

export const canonicalizeMetaJSONV1 = (input: unknown): CanonicalMetaJSONProjection => {
  const validation = validateMetaJSONV1(input)
  if (!validation.ok) {
    throw new CheckpointProjectionError(
      "invalid_projection",
      `Checkpoint projection is not MetaJSON v1: ${validation.issues.map((issue) => `${issue.path}:${issue.code}`).join(", ")}`,
    )
  }
  const value = closedJSON(validation.value, "") as unknown as MetaJSONV1
  const bytes = new TextEncoder().encode(canonicalString(value as unknown as CheckpointJsonValue))
  return {
    value,
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }
}

export const diffMetaJSONV1 = (
  base: unknown,
  result: unknown,
): CheckpointJsonPatchOperationV1[] => {
  const left = canonicalizeMetaJSONV1(base).value as unknown as CheckpointJsonValue
  const right = canonicalizeMetaJSONV1(result).value as unknown as CheckpointJsonValue
  const operations: CheckpointJsonPatchOperationV1[] = []
  diffValue(left, right, "", operations)
  return operations
}

export const applyMetaJSONPatchV1 = (
  base: unknown,
  operations: readonly CheckpointJsonPatchOperationV1[],
): MetaJSONV1 => {
  let current = structuredClone(canonicalizeMetaJSONV1(base).value) as unknown as CheckpointJsonValue
  for (const operation of operations) {
    const tokens = decodePointer(operation.path)
    if (tokens.length === 0) {
      if (operation.op === "remove") {
        throw new CheckpointProjectionError("invalid_patch_path", "MetaJSON root cannot be removed")
      }
      current = structuredClone(operation.value)
      continue
    }
    const {parent, key} = containerAt(current, tokens)
    if (Array.isArray(parent)) {
      if (!/^(?:0|[1-9][0-9]*)$/.test(key)) {
        throw new CheckpointProjectionError("invalid_patch_path", `JSON Patch array index is invalid: ${key}`)
      }
      const index = Number(key)
      if (operation.op === "add") {
        if (index > parent.length) throw new CheckpointProjectionError("invalid_patch_path", "JSON Patch add index is ahead")
        parent.splice(index, 0, structuredClone(operation.value))
      } else if (operation.op === "remove") {
        if (index >= parent.length) throw new CheckpointProjectionError("invalid_patch_path", "JSON Patch remove index is missing")
        parent.splice(index, 1)
      } else {
        if (index >= parent.length) throw new CheckpointProjectionError("invalid_patch_path", "JSON Patch replace index is missing")
        parent[index] = structuredClone(operation.value)
      }
      continue
    }
    if (operation.op === "add") {
      parent[key] = structuredClone(operation.value)
    } else if (operation.op === "remove") {
      if (!Object.hasOwn(parent, key)) throw new CheckpointProjectionError("invalid_patch_path", "JSON Patch remove member is missing")
      delete parent[key]
    } else {
      if (!Object.hasOwn(parent, key)) throw new CheckpointProjectionError("invalid_patch_path", "JSON Patch replace member is missing")
      parent[key] = structuredClone(operation.value)
    }
  }
  return canonicalizeMetaJSONV1(current).value
}
