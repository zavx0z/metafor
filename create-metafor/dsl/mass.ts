import type {
  MassDeclaration,
  MassDeclarationDSL,
  MassDeclarations,
  MassFactory,
  MassFormat,
  MassOptions,
} from "@metafor/types/metafor/mass"

const declaration = <Format extends MassFormat>(
  format: Format,
  options: MassOptions = {},
): MassDeclaration<Format> => ({format, ...options})

/** Builds the authored Mass metadata for the MetaFor DSL. */
export const massFactory: MassFactory = {
  json: (options = {}) => declaration("json", options),
  binary: (options = {}) => declaration("binary", options),
  directory: (options = {}) => declaration("directory", options),
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
