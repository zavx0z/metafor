export const INPUT_EXECUTION_PREFIX = "input:" as const

export type InputExecutionId = `${typeof INPUT_EXECUTION_PREFIX}${string}`

export type ExternalInputProposal = {
  fields: Record<string, unknown>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const isInputExecutionId = (value: unknown): value is InputExecutionId =>
  typeof value === "string" &&
  value.startsWith(INPUT_EXECUTION_PREFIX) &&
  value.length > INPUT_EXECUTION_PREFIX.length &&
  value.length <= 128 &&
  value.trim() === value

export const isExternalInputProposal = (value: unknown): value is ExternalInputProposal =>
  isRecord(value) && isRecord(value.fields) && Object.keys(value.fields).length > 0
