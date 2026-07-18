import type {AgentIngressMessage, SourcedForceMessage} from "./message.ts"
import {isParticleSource, isParticleTimestamp, type SourcedParticle} from "./particle.ts"

const particleParts = new Set(["inflaton", "graviton", "photon", "gluon", "higgs", "w+", "w-", "z"])
const particleOperations = new Set(["add", "remove", "replace", "move", "copy", "test"])
const particleKeys = new Set(["part", "op", "path", "by", "ts", "value", "from"])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const isParticle = (value: unknown): value is SourcedParticle => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const particle = value as Partial<SourcedParticle>
  return Object.keys(value).every((key) => particleKeys.has(key)) &&
    typeof particle.part === "string" && particleParts.has(particle.part) &&
    typeof particle.op === "string" && particleOperations.has(particle.op) &&
    (typeof particle.path === "string" || typeof particle.path === "number") &&
    isParticleSource(particle.by) &&
    isParticleTimestamp(particle.ts) &&
    (particle.from === undefined || typeof particle.from === "string" || typeof particle.from === "number")
}

export const isForceMessage = (value: unknown): value is SourcedForceMessage =>
  typeof value === "object" && value !== null &&
  (value as {type?: unknown}).type === undefined &&
  Object.keys(value).length === 1 &&
  Array.isArray((value as {parts?: unknown}).parts) &&
  (value as {parts: unknown[]}).parts.length === 1 &&
  isParticle((value as {parts: unknown[]}).parts[0])

export const isAgentIngressMessage = (value: unknown): value is AgentIngressMessage => {
  if (!isRecord(value) || Object.keys(value).length !== 1 || !Array.isArray(value.parts) || value.parts.length !== 1) return false
  const part = value.parts[0]
  if (!isRecord(part) || part.part !== "inflaton" || typeof part.path !== "string" || !isParticleTimestamp(part.ts)) return false

  if (part.op === "test") {
    const segments = part.path.split("/")
    return Object.keys(part).every((key) => ["part", "op", "path", "ts"].includes(key)) &&
      segments.every((segment) => segment.length > 0 && segment !== "." && segment !== ".." && /^[a-zA-Z0-9._-]+$/.test(segment))
  }

  if (part.op !== "add" || !Object.keys(part).every((key) => ["part", "op", "path", "ts", "value"].includes(key))) return false
  if (
    part.path !== "wimp" || !isRecord(part.value) ||
    typeof part.value.src !== "string" || part.value.src.trim().length === 0 ||
    typeof part.value.name !== "string" || part.value.name.trim().length === 0
  ) return false
  return part.value.desc === undefined || part.value.desc === null || typeof part.value.desc === "string"
}
