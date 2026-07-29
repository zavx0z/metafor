import type {
  EdgeConstraintInput,
  EdgeRouteVariant,
} from "./EdgesLab.ts"

export const EDGE_EXAMPLE_SCHEMA =
  "metafor/visual-edge-example@1" as const

export type EdgeExampleDraft = Readonly<{
  createdAt: string
  input: EdgeConstraintInput
  schema: typeof EDGE_EXAMPLE_SCHEMA
  sourceVariant: EdgeRouteVariant
}>

export type StoredEdgeExample = EdgeExampleDraft & Readonly<{
  id: string
}>

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

const parseInput = (value: unknown): EdgeConstraintInput | null => {
  if (typeof value !== "object" || value === null) return null
  const candidate = value as Record<string, unknown>
  for (const key of [
    "centerDistance",
    "clearance",
    "extraLift",
    "leftSphereX",
    "leftSphereY",
    "rightSphereX",
    "rightSphereY",
    "torusRadius",
    "torusTube",
  ]) {
    if (!isFiniteNumber(candidate[key])) return null
  }
  for (const key of ["leftTorusScale", "rightTorusScale", "sphereRadius"]) {
    if (candidate[key] !== undefined && !isFiniteNumber(candidate[key])) {
      return null
    }
  }
  return {
    centerDistance: candidate.centerDistance as number,
    clearance: candidate.clearance as number,
    extraLift: candidate.extraLift as number,
    leftSphereX: candidate.leftSphereX as number,
    leftSphereY: candidate.leftSphereY as number,
    ...(candidate.leftTorusScale === undefined
      ? {}
      : {leftTorusScale: candidate.leftTorusScale as number}),
    rightSphereX: candidate.rightSphereX as number,
    rightSphereY: candidate.rightSphereY as number,
    ...(candidate.rightTorusScale === undefined
      ? {}
      : {rightTorusScale: candidate.rightTorusScale as number}),
    ...(candidate.sphereRadius === undefined
      ? {}
      : {sphereRadius: candidate.sphereRadius as number}),
    torusRadius: candidate.torusRadius as number,
    torusTube: candidate.torusTube as number,
  }
}

export const parseEdgeExampleDraft = (
  value: unknown,
): EdgeExampleDraft | null => {
  if (typeof value !== "object" || value === null) return null
  const candidate = value as Record<string, unknown>
  const input = parseInput(candidate.input)
  if (
    candidate.schema !== EDGE_EXAMPLE_SCHEMA ||
    (
      candidate.sourceVariant !== "composite" &&
      candidate.sourceVariant !== "source-sink"
    ) ||
    typeof candidate.createdAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.createdAt)) ||
    input === null
  ) return null
  return {
    createdAt: candidate.createdAt,
    input,
    schema: EDGE_EXAMPLE_SCHEMA,
    sourceVariant: candidate.sourceVariant,
  }
}
