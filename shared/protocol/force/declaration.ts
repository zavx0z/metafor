export const declarationPaths = [
  "wimp",
  "field",
  "variant",
  "state",
  "transition",
  "condition",
  "process",
  "reaction",
  "matter",
  "mass",
  "bulk",
] as const

export type DeclarationPath = typeof declarationPaths[number]

export const isDeclarationPath = (value: unknown): value is DeclarationPath =>
  typeof value === "string" && declarationPaths.includes(value as DeclarationPath)

export type WimpDeclarationIdentity = {src: string}
export type LocalDeclarationIdentity = {wimp: string; id: number}

export const isWimpDeclarationIdentity = (value: unknown): value is WimpDeclarationIdentity =>
  typeof value === "object" && value !== null && !Array.isArray(value) &&
  typeof (value as Record<string, unknown>).src === "string" &&
  ((value as Record<string, unknown>).src as string).trim().length > 0

export const isLocalDeclarationIdentity = (value: unknown): value is LocalDeclarationIdentity =>
  typeof value === "object" && value !== null && !Array.isArray(value) &&
  typeof (value as Record<string, unknown>).wimp === "string" &&
  ((value as Record<string, unknown>).wimp as string).trim().length > 0 &&
  Number.isSafeInteger((value as Record<string, unknown>).id) &&
  Number((value as Record<string, unknown>).id) > 0
