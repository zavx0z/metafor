import type {
  MassDeclaration,
  MassDeclarationDSL,
  MassDeclarations,
  MassFactory,
  MassFormat,
  MassOptions,
} from "@metafor/types/metafor/mass"

const declaration = (
  format: MassFormat,
  options: MassOptions = {},
): MassDeclaration => ({format, ...options})

/** Builds the authored Mass metadata for the MetaFor DSL. */
export const massFactory: MassFactory = {
  json: (options = {}) => declaration("json", options),
  binary: (options = {}) => declaration("binary", options),
}

export const normalizeMassDeclarations = (
  schema: MassDeclarations,
): MassDeclarationDSL[] =>
  Object.entries(schema).map(([key, value]) => ({
    key,
    format: value.format,
    ...(value.label === undefined ? {} : {label: value.label}),
    ...(value.description === undefined ? {} : {description: value.description}),
  }))
