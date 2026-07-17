import type {ForceMessage} from "./message.ts"
import {isParticleTimestamp, type Particle} from "./particle.ts"

const particleParts = new Set(["inflaton", "graviton", "photon", "gluon", "higgs", "w+", "w-", "z"])
const particleOperations = new Set(["add", "remove", "replace", "move", "copy", "test"])
const particleKeys = new Set(["part", "op", "path", "ts", "value", "from"])

export const isParticle = (value: unknown): value is Particle => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const particle = value as Partial<Particle>
  return Object.keys(value).every((key) => particleKeys.has(key)) &&
    typeof particle.part === "string" && particleParts.has(particle.part) &&
    typeof particle.op === "string" && particleOperations.has(particle.op) &&
    (typeof particle.path === "string" || typeof particle.path === "number") &&
    isParticleTimestamp(particle.ts) &&
    (particle.from === undefined || typeof particle.from === "string" || typeof particle.from === "number")
}

export const isForceMessage = (value: unknown): value is ForceMessage =>
  typeof value === "object" && value !== null &&
  (value as {type?: unknown}).type === undefined &&
  Object.keys(value).length === 1 &&
  Array.isArray((value as {parts?: unknown}).parts) &&
  (value as {parts: unknown[]}).parts.length === 1 &&
  isParticle((value as {parts: unknown[]}).parts[0])
