import {createHash} from "node:crypto"
import type {MetaAuthoringRequestDigest} from "shared/protocol/metafor/authoring"

const canonicalJson = (value: unknown): string => {
  if (value === null) return "null"
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`
    ).join(",")}}`
  }
  throw new Error("Authoring request digest accepts only normalized JSON data")
}

export const metaAuthoringRequestDigest = (request: unknown): MetaAuthoringRequestDigest =>
  `sha256:${createHash("sha256").update(canonicalJson(request)).digest("hex")}` as MetaAuthoringRequestDigest
