import type { Database } from "bun:sqlite"
import * as prettier from "prettier"
import ts from "typescript"
import {
  ensureRoundTripSchema,
  type FieldPresence,
  type FieldType,
  type LiteralType,
  type ProcessBuilder,
  type ProcessEnvRow,
  type ProcessStep,
  type ReactionRow,
  type SectionName,
  type SectionRow,
  type SuperpositionRow,
  type SuperpositionCommentRow,
  type TransitionRow,
} from "@metafor/dsl-parse"

export interface EmitDslModuleFromDbOptions {
  db: Database
  format?: boolean
  filepath?: string
}

interface EmittedMeta {
  name: string
  configMultiline: boolean | null
  desc: string | null
  descPosition: number | null
  dev: boolean | null
  devPosition: number | null
}

interface EmittedField {
  id: number
  position: number
  name: string
  type: FieldType
  presence: FieldPresence
  label: string | null
  defaultType: LiteralType | null
  defaultText: string | null
  defaultNumber: string | null
  defaultBoolean: boolean | null
}

interface EmittedEnumVariant {
  fieldId: number
  position: number
  textValue: string | null
  numberValue: string | null
}

interface EmittedCondition {
  transitionId: number
  position: number
  fieldId: number
  nullValue: boolean
}

interface EmittedProcess {
  id: number
  position: number
  name: string
  builder: ProcessBuilder
  gapBefore: number
  configMultiline: boolean | null
  label: string | null
  labelPosition: number | null
  desc: string | null
  descPosition: number | null
  envPosition: number | null
}

interface EmittedProcessHandler {
  processId: number
  position: number
  step: ProcessStep
  code: string
}

const getRequiredRow = <T>(row: T | null | undefined, message: string): T => {
  if (!row) throw new Error(message)
  return row
}

const indentBlock = (source: string, spaces: number) => {
  const prefix = " ".repeat(spaces)
  return source
    .split("\n")
    .map((line) => (line.length === 0 ? line : `${prefix}${line}`))
    .join("\n")
}

const identifierPattern = /^[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*$/u

const renderPropertyName = (name: string) => (identifierPattern.test(name) ? name : JSON.stringify(name))

const wrapArrowParams = (params: string | null) => `(${params ?? ""})`

const parseParameterNames = (params: string | null) =>
  (params ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)

const renderObjectLiteral = (memberSources: string[]) => {
  if (memberSources.length === 0) return "{}"
  return `{\n${memberSources.map((memberSource) => indentBlock(memberSource, 2)).join("\n")}\n}`
}

const renderArrayLiteral = (elementSources: string[]) => {
  if (elementSources.length === 0) return "[]"
  return `[\n${elementSources.map((elementSource) => indentBlock(elementSource, 2)).join("\n")}\n]`
}

const renderCompactObjectLiteral = (memberSources: string[]) => {
  if (memberSources.length === 0) return "{}"
  return `{ ${memberSources.join(", ")} }`
}

const keyByProcessAndPosition = (processId: number, position: number) => `${processId}:${position}`

const renderMetaConfig = (metaRow: EmittedMeta) => {
  const members: Array<{ position: number; code: string }> = []
  if (metaRow.desc !== null && metaRow.descPosition !== null) {
    members.push({
      position: metaRow.descPosition,
      code: `desc: ${JSON.stringify(metaRow.desc)}`,
    })
  }

  if (metaRow.dev !== null && metaRow.devPosition !== null) {
    members.push({
      position: metaRow.devPosition,
      code: `dev: ${metaRow.dev ? "true" : "false"}`,
    })
  }

  if (members.length === 0) return null
  members.sort((left, right) => left.position - right.position)
  return metaRow.configMultiline ? renderObjectLiteral(members.map((member) => `${member.code},`)) : renderCompactObjectLiteral(members.map((member) => member.code))
}

const renderFieldDefault = (fieldRow: EmittedField) => {
  switch (fieldRow.defaultType) {
    case "string":
      return JSON.stringify(fieldRow.defaultText ?? "")
    case "number":
      return fieldRow.defaultNumber ?? "0"
    case "boolean":
      return fieldRow.defaultBoolean ? "true" : "false"
    case "array":
      return "[]"
    case null:
      throw new Error(`Missing default literal for required field ${fieldRow.name}`)
  }
}

const renderFieldProperty = (fieldRow: EmittedField, enumVariants: EmittedEnumVariant[], fieldFactoryName: string) => {
  const enumSource = enumVariants
    .map((variant) => (variant.textValue !== null ? JSON.stringify(variant.textValue) : (variant.numberValue ?? "0")))
    .join(", ")

  let source = fieldRow.type === "enum" ? `${fieldFactoryName}.enum(${enumSource})` : `${fieldFactoryName}.${fieldRow.type}`
  if (fieldRow.presence === "optional") {
    source += fieldRow.label === null ? ".optional()" : `.optional({ label: ${JSON.stringify(fieldRow.label)} })`
  }

  if (fieldRow.presence === "required") {
    const args = [renderFieldDefault(fieldRow)]
    if (fieldRow.label !== null) args.push(`{ label: ${JSON.stringify(fieldRow.label)} }`)
    source += `.required(${args.join(", ")})`
  }

  return `${renderPropertyName(fieldRow.name)}: ${source},`
}

const renderFieldsArgument = (sectionRow: SectionRow, fieldRows: EmittedField[], enumVariantRows: EmittedEnumVariant[]) => {
  const [fieldFactoryName = "field"] = parseParameterNames(sectionRow.params)
  if (fieldRows.length === 0) return `${wrapArrowParams(sectionRow.params)} => ({})`

  const enumVariantsByFieldId = new Map<number, EmittedEnumVariant[]>()
  for (const enumVariantRow of enumVariantRows) {
    const list = enumVariantsByFieldId.get(enumVariantRow.fieldId) ?? []
    list.push(enumVariantRow)
    enumVariantsByFieldId.set(enumVariantRow.fieldId, list)
  }

  return `${wrapArrowParams(sectionRow.params)} => (${renderObjectLiteral(
    fieldRows.map((fieldRow) => renderFieldProperty(fieldRow, enumVariantsByFieldId.get(fieldRow.id) ?? [], fieldFactoryName)),
  )})`
}

const renderTransitionConditions = (conditions: EmittedCondition[], fieldsById: Map<number, EmittedField>) => {
  if (conditions.length === 0) return "{}"

  return renderCompactObjectLiteral(
    conditions.map((conditionRow) => {
      const fieldRow = getRequiredRow(fieldsById.get(conditionRow.fieldId), `Unknown field id in conditions: ${conditionRow.fieldId}`)
      return `${renderPropertyName(fieldRow.name)}: ${conditionRow.nullValue ? "null" : "{ null: false }"}`
    }),
  )
}

const renderSuperpositionProperty = (
  superpositionRow: SuperpositionRow,
  superpositionCommentRows: SuperpositionCommentRow[],
  transitionRows: TransitionRow[],
  conditionsByTransitionId: Map<number, EmittedCondition[]>,
  superpositionsById: Map<number, SuperpositionRow>,
  fieldsById: Map<number, EmittedField>,
) => {
  const items = [
    ...superpositionCommentRows.map((superpositionCommentRow) => ({
      position: superpositionCommentRow.position,
      source: superpositionCommentRow.text,
    })),
    ...transitionRows.map((transitionRow) => ({
      position: transitionRow.position,
      source: `${renderPropertyName(getRequiredRow(superpositionsById.get(transitionRow.targetSuperpositionId), `Unknown superposition id: ${transitionRow.targetSuperpositionId}`).name)}: ${renderTransitionConditions(
        conditionsByTransitionId.get(transitionRow.id) ?? [],
        fieldsById,
      )},`,
    })),
  ].sort((left, right) => left.position - right.position)

  if (items.length === 0) return `${renderPropertyName(superpositionRow.name)}: {},`
  return `${renderPropertyName(superpositionRow.name)}: {\n${indentBlock(items.map((item) => item.source).join("\n"), 2)}\n},`
}

const renderSuperpositionArgument = (
  superpositionRows: SuperpositionRow[],
  superpositionCommentRows: SuperpositionCommentRow[],
  transitionRows: TransitionRow[],
  conditionRows: EmittedCondition[],
  fieldRows: EmittedField[],
) => {
  const superpositionCommentsBySuperpositionId = new Map<number, SuperpositionCommentRow[]>()
  for (const superpositionCommentRow of superpositionCommentRows) {
    const list = superpositionCommentsBySuperpositionId.get(superpositionCommentRow.superpositionId) ?? []
    list.push(superpositionCommentRow)
    superpositionCommentsBySuperpositionId.set(superpositionCommentRow.superpositionId, list)
  }

  const transitionsBySuperpositionId = new Map<number, TransitionRow[]>()
  for (const transitionRow of transitionRows) {
    const list = transitionsBySuperpositionId.get(transitionRow.superpositionId) ?? []
    list.push(transitionRow)
    transitionsBySuperpositionId.set(transitionRow.superpositionId, list)
  }

  const conditionsByTransitionId = new Map<number, EmittedCondition[]>()
  for (const conditionRow of conditionRows) {
    const list = conditionsByTransitionId.get(conditionRow.transitionId) ?? []
    list.push(conditionRow)
    conditionsByTransitionId.set(conditionRow.transitionId, list)
  }

  const superpositionsById = new Map(superpositionRows.map((superpositionRow) => [superpositionRow.id, superpositionRow]))
  const fieldsById = new Map(fieldRows.map((fieldRow) => [fieldRow.id, fieldRow]))

  return renderObjectLiteral(
    superpositionRows.map((superpositionRow) =>
      renderSuperpositionProperty(
        superpositionRow,
        superpositionCommentsBySuperpositionId.get(superpositionRow.id) ?? [],
        transitionsBySuperpositionId.get(superpositionRow.id) ?? [],
        conditionsByTransitionId,
        superpositionsById,
        fieldsById,
      ),
    ),
  )
}

const renderProcessConfig = (processRow: EmittedProcess, processEnvRows: ProcessEnvRow[]) => {
  const members: Array<{ position: number; code: string }> = []
  if (processRow.label !== null && processRow.labelPosition !== null) {
    members.push({
      position: processRow.labelPosition,
      code: `label: ${JSON.stringify(processRow.label)}`,
    })
  }

  if (processRow.desc !== null && processRow.descPosition !== null) {
    members.push({
      position: processRow.descPosition,
      code: `desc: ${JSON.stringify(processRow.desc)}`,
    })
  }

  if (processRow.envPosition !== null) {
    members.push({
      position: processRow.envPosition,
      code: `env: [${processEnvRows.map((processEnvRow) => JSON.stringify(processEnvRow.env)).join(", ")}]`,
    })
  }

  if (members.length === 0) return ""
  members.sort((left, right) => left.position - right.position)
  return processRow.configMultiline ? renderObjectLiteral(members.map((member) => `${member.code},`)) : renderCompactObjectLiteral(members.map((member) => member.code))
}

const renderProcessProperty = (
  processRow: EmittedProcess,
  processEnvRows: ProcessEnvRow[],
  processHandlerRows: EmittedProcessHandler[],
  processName: string,
  destroyName: string | undefined,
) => {
  const builderName = processRow.builder === "process" ? processName : destroyName
  if (!builderName) throw new Error(`Missing destroy builder parameter for process ${processRow.name}`)

  let source = `${renderPropertyName(processRow.name)}: ${builderName}(${renderProcessConfig(processRow, processEnvRows)})`
  for (const processHandlerRow of processHandlerRows) {
    source += `.${processHandlerRow.step}(${processHandlerRow.code})`
  }

  return `${source},`
}

const renderProcessesArgument = (
  sectionRow: SectionRow,
  processRows: EmittedProcess[],
  processEnvRows: ProcessEnvRow[],
  processHandlerRows: EmittedProcessHandler[],
) => {
  const [processName = "process", destroyName] = parseParameterNames(sectionRow.params)
  if (processRows.length === 0) return `${wrapArrowParams(sectionRow.params)} => ({})`

  const processEnvsByProcessId = new Map<number, ProcessEnvRow[]>()
  for (const processEnvRow of processEnvRows) {
    const list = processEnvsByProcessId.get(processEnvRow.processId) ?? []
    list.push(processEnvRow)
    processEnvsByProcessId.set(processEnvRow.processId, list)
  }

  const processHandlersByProcessId = new Map<number, EmittedProcessHandler[]>()
  for (const processHandlerRow of processHandlerRows) {
    const list = processHandlersByProcessId.get(processHandlerRow.processId) ?? []
    list.push(processHandlerRow)
    processHandlersByProcessId.set(processHandlerRow.processId, list)
  }

  let body = ""
  for (const [index, processRow] of processRows.entries()) {
    if (index > 0) body += "\n".repeat(Math.max(1, processRow.gapBefore + 1))

    body += indentBlock(
      renderProcessProperty(
        processRow,
        processEnvsByProcessId.get(processRow.id) ?? [],
        processHandlersByProcessId.get(processRow.id) ?? [],
        processName,
        destroyName,
      ),
      2,
    )
  }

  return `${wrapArrowParams(sectionRow.params)} => ({\n${body}\n})`
}

const renderReactionsArgument = (sectionRow: SectionRow, reactionRows: ReactionRow[]) =>
  `${wrapArrowParams(sectionRow.params)} => ${renderArrayLiteral(reactionRows.map((reactionRow) => `${reactionRow.code},`))}`

const formatDiagnostic = (diagnostic: ts.Diagnostic, sourceFile: ts.SourceFile) => {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
  if (diagnostic.start === undefined) return message

  const position = sourceFile.getLineAndCharacterOfPosition(diagnostic.start)
  return `${position.line + 1}:${position.character + 1} ${message}`
}

const validateTypeScriptModule = (source: string, filepath: string) => {
  const sourceFile = ts.createSourceFile(filepath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const diagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? []
  if (diagnostics.length === 0) return

  const message = diagnostics.map((diagnostic) => formatDiagnostic(diagnostic, sourceFile)).join("; ")
  throw new Error(`Emitted TypeScript is invalid: ${message}`)
}

export const formatTypeScriptSource = async (source: string, filepath: string) => {
  const resolvedConfig = await prettier.resolveConfig(filepath)
  return prettier.format(source, {
    ...(resolvedConfig ?? {}),
    filepath,
  })
}

const renderSectionCall = (sectionName: SectionName, code: string | null) =>
  code === null ? `  .${sectionName}()` : `  .${sectionName}(${code})`

export const emitDslModuleFromDb = async (options: EmitDslModuleFromDbOptions) => {
  ensureRoundTripSchema(options.db)

  const metaBase = getRequiredRow(
    options.db
      .query(
        `SELECT name, configMultiline, desc, descPosition, dev, devPosition
         FROM meta
         WHERE id = 1`,
      )
      .get() as
      | {
          name: string
          configMultiline: number | null
          desc: string | null
          descPosition: number | null
          dev: number | null
          devPosition: number | null
        }
      | undefined,
    "The database does not contain a parsed MetaFor module",
  )

  const metaRow: EmittedMeta = {
    name: metaBase.name,
    configMultiline: metaBase.configMultiline === null ? null : Boolean(metaBase.configMultiline),
    desc: metaBase.desc,
    descPosition: metaBase.descPosition,
    dev: metaBase.dev === null ? null : Boolean(metaBase.dev),
    devPosition: metaBase.devPosition,
  }

  const sectionRows = options.db
    .query(
      `SELECT name, params, code
       FROM sections`,
    )
    .all() as SectionRow[]

  const fieldRowsRaw = options.db
    .query(
      `SELECT id, position, name, type, required, label
       FROM fields
       ORDER BY position`,
    )
    .all() as Array<{
      id: number
      position: number
      name: string
      type: FieldType
      required: number | null
      label: string | null
    }>

  const fieldDefaultIds = new Set<number>(
    (
      options.db
        .query(
          `SELECT fieldId
           FROM field_defaults`,
        )
        .all() as Array<{ fieldId: number }>
    ).map((row) => row.fieldId),
  )

  const stringFieldDefaults = new Map(
    (
      options.db
        .query(
          `SELECT fieldId, value
           FROM string_field_defaults`,
        )
        .all() as Array<{ fieldId: number; value: string }>
    ).map((row) => [row.fieldId, row.value]),
  )

  const numberFieldDefaults = new Map(
    (
      options.db
        .query(
          `SELECT fieldId, value
           FROM number_field_defaults`,
        )
        .all() as Array<{ fieldId: number; value: string }>
    ).map((row) => [row.fieldId, row.value]),
  )

  const booleanFieldDefaults = new Map(
    (
      options.db
        .query(
          `SELECT fieldId, value
           FROM boolean_field_defaults`,
        )
        .all() as Array<{ fieldId: number; value: number }>
    ).map((row) => [row.fieldId, Boolean(row.value)]),
  )

  const arrayFieldDefaultIds = new Set<number>(
    (
      options.db
        .query(
          `SELECT fieldId
           FROM array_field_defaults`,
        )
        .all() as Array<{ fieldId: number }>
    ).map((row) => row.fieldId),
  )

  const enumFieldDefaults = new Map(
    (
      options.db
        .query(
          `SELECT fieldId, variantPosition
           FROM enum_field_defaults`,
        )
        .all() as Array<{ fieldId: number; variantPosition: number }>
    ).map((row) => [row.fieldId, row.variantPosition]),
  )

  const enumVariantBases = options.db
    .query(
      `SELECT fieldId, position
       FROM enum_variants
       ORDER BY fieldId, position`,
    )
    .all() as Array<{ fieldId: number; position: number }>

  const enumTextVariants = new Map(
    (
      options.db
        .query(
          `SELECT fieldId, position, value
           FROM enum_text_variants`,
        )
        .all() as Array<{ fieldId: number; position: number; value: string }>
    ).map((row) => [keyByProcessAndPosition(row.fieldId, row.position), row.value]),
  )

  const enumNumberVariants = new Map(
    (
      options.db
        .query(
          `SELECT fieldId, position, value
           FROM enum_number_variants`,
        )
        .all() as Array<{ fieldId: number; position: number; value: string }>
    ).map((row) => [keyByProcessAndPosition(row.fieldId, row.position), row.value]),
  )

  const enumVariantsByFieldId = new Map<number, EmittedEnumVariant[]>()
  for (const enumVariantBase of enumVariantBases) {
    const key = keyByProcessAndPosition(enumVariantBase.fieldId, enumVariantBase.position)
    const hasText = enumTextVariants.has(key)
    const hasNumber = enumNumberVariants.has(key)
    if (Number(hasText) + Number(hasNumber) !== 1) {
      throw new Error(`Enum variant ${enumVariantBase.fieldId}:${enumVariantBase.position} must have exactly one typed subtype row`)
    }

    const list = enumVariantsByFieldId.get(enumVariantBase.fieldId) ?? []
    list.push({
      fieldId: enumVariantBase.fieldId,
      position: enumVariantBase.position,
      textValue: hasText ? (enumTextVariants.get(key) ?? null) : null,
      numberValue: hasNumber ? (enumNumberVariants.get(key) ?? null) : null,
    })
    enumVariantsByFieldId.set(enumVariantBase.fieldId, list)
  }

  const fieldRows = fieldRowsRaw.map((fieldRow) => {
    const presence = fieldRow.required === null ? null : fieldRow.required === 1 ? "required" : "optional"
    let defaultType: LiteralType | null = null
    let defaultText: string | null = null
    let defaultNumber: string | null = null
    let defaultBoolean: boolean | null = null

    if (presence === "required") {
      if (!fieldDefaultIds.has(fieldRow.id)) {
        throw new Error(`Required field ${fieldRow.name} is missing its field_defaults row`)
      }

      const matches = [
        stringFieldDefaults.has(fieldRow.id) ? "string" : null,
        numberFieldDefaults.has(fieldRow.id) ? "number" : null,
        booleanFieldDefaults.has(fieldRow.id) ? "boolean" : null,
        arrayFieldDefaultIds.has(fieldRow.id) ? "array" : null,
        enumFieldDefaults.has(fieldRow.id) ? "enum" : null,
      ].filter(Boolean) as Array<LiteralType | "enum">

      if (matches.length !== 1) {
        throw new Error(`Required field ${fieldRow.name} must have exactly one default subtype row`)
      }

      const match = matches[0]
      if (match === "string") {
        if (fieldRow.type !== "string") throw new Error(`Field ${fieldRow.name} has a string default but type ${fieldRow.type}`)
        defaultType = "string"
        defaultText = stringFieldDefaults.get(fieldRow.id) ?? null
      } else if (match === "number") {
        if (fieldRow.type !== "number") throw new Error(`Field ${fieldRow.name} has a number default but type ${fieldRow.type}`)
        defaultType = "number"
        defaultNumber = numberFieldDefaults.get(fieldRow.id) ?? null
      } else if (match === "boolean") {
        if (fieldRow.type !== "boolean") throw new Error(`Field ${fieldRow.name} has a boolean default but type ${fieldRow.type}`)
        defaultType = "boolean"
        defaultBoolean = booleanFieldDefaults.get(fieldRow.id) ?? null
      } else if (match === "array") {
        if (fieldRow.type !== "array") throw new Error(`Field ${fieldRow.name} has an array default but type ${fieldRow.type}`)
        defaultType = "array"
      } else {
        if (fieldRow.type !== "enum") throw new Error(`Field ${fieldRow.name} has an enum default but type ${fieldRow.type}`)
        const variantPosition = enumFieldDefaults.get(fieldRow.id)
        const enumVariant = (enumVariantsByFieldId.get(fieldRow.id) ?? []).find((variant) => variant.position === variantPosition)
        if (!enumVariant) {
          throw new Error(`Required enum default for field ${fieldRow.name} does not reference an existing enum variant`)
        }

        if (enumVariant.textValue !== null) {
          defaultType = "string"
          defaultText = enumVariant.textValue
        } else {
          defaultType = "number"
          defaultNumber = enumVariant.numberValue
        }
      }
    }

    return {
      id: fieldRow.id,
      position: fieldRow.position,
      name: fieldRow.name,
      type: fieldRow.type,
      presence,
      label: fieldRow.label,
      defaultType,
      defaultText,
      defaultNumber,
      defaultBoolean,
    } satisfies EmittedField
  })

  const enumVariantRows = fieldRows.flatMap((fieldRow) => enumVariantsByFieldId.get(fieldRow.id) ?? [])

  const superpositionRows = options.db
    .query(
      `SELECT id, position, name
       FROM superposition
       ORDER BY position`,
    )
    .all() as SuperpositionRow[]

  const superpositionCommentRows = options.db
    .query(
      `SELECT id, superpositionId, position, text
       FROM superposition_comments
       ORDER BY superpositionId, position`,
    )
    .all() as SuperpositionCommentRow[]

  const transitionRows = options.db
    .query(
      `SELECT id, superpositionId, targetSuperpositionId, position
       FROM transitions
       ORDER BY superpositionId, position`,
    )
    .all() as TransitionRow[]

  const conditionBases = options.db
    .query(
      `SELECT transitionId, position, fieldId, nullValue
       FROM conditions
       ORDER BY transitionId, position`,
    )
    .all() as Array<{
      transitionId: number
      position: number
      fieldId: number
      nullValue: number
    }>

  const conditionRows = conditionBases.map((conditionBase) => {
    return {
      transitionId: conditionBase.transitionId,
      position: conditionBase.position,
      fieldId: conditionBase.fieldId,
      nullValue: Boolean(conditionBase.nullValue),
    } satisfies EmittedCondition
  })

  const processBases = options.db
    .query(
      `SELECT id, position, name, builder, gapBefore, configMultiline, label, labelPosition, desc, descPosition, envPosition
       FROM processes
       ORDER BY position`,
    )
    .all() as Array<{
      id: number
      position: number
      name: string
      builder: ProcessBuilder
      gapBefore: number
      configMultiline: number | null
      label: string | null
      labelPosition: number | null
      desc: string | null
      descPosition: number | null
      envPosition: number | null
    }>

  const processEnvRows = options.db
    .query(
      `SELECT processId, position, env
       FROM process_envs
       ORDER BY processId, position`,
    )
    .all() as ProcessEnvRow[]

  const processHandlerRows = options.db
    .query(
      `SELECT processId, position, step, code
       FROM process_handlers
       ORDER BY processId, position`,
    )
    .all() as EmittedProcessHandler[]

  const processRows = processBases.map((processBase) => {
    const handlers = processHandlerRows.filter((processHandlerRow) => processHandlerRow.processId === processBase.id)
    if (processBase.builder === "process" && handlers.some((handler) => handler.step === "before")) {
      throw new Error(`Process ${processBase.name} cannot contain before(...) handlers`)
    }

    if (processBase.builder === "destroy" && handlers.some((handler) => handler.step !== "before")) {
      throw new Error(`Destroy process ${processBase.name} can only contain before(...) handlers`)
    }

    return {
      id: processBase.id,
      position: processBase.position,
      name: processBase.name,
      builder: processBase.builder,
      gapBefore: processBase.gapBefore,
      configMultiline: processBase.configMultiline === null ? null : Boolean(processBase.configMultiline),
      label: processBase.label,
      labelPosition: processBase.labelPosition,
      desc: processBase.desc,
      descPosition: processBase.descPosition,
      envPosition: processBase.envPosition,
    } satisfies EmittedProcess
  })

  for (const fieldRow of fieldRows) {
    if (fieldRow.type !== "enum" && (enumVariantsByFieldId.get(fieldRow.id)?.length ?? 0) > 0) {
      throw new Error(`Field ${fieldRow.name} has enum variants but type ${fieldRow.type}`)
    }
  }

  const superpositionPositionsBySuperpositionId = new Map<number, Set<number>>()
  for (const superpositionCommentRow of superpositionCommentRows) {
    const positions = superpositionPositionsBySuperpositionId.get(superpositionCommentRow.superpositionId) ?? new Set<number>()
    if (positions.has(superpositionCommentRow.position)) {
      throw new Error(`Superposition ${superpositionCommentRow.superpositionId} contains duplicate member position ${superpositionCommentRow.position}`)
    }
    positions.add(superpositionCommentRow.position)
    superpositionPositionsBySuperpositionId.set(superpositionCommentRow.superpositionId, positions)
  }
  for (const transitionRow of transitionRows) {
    const positions = superpositionPositionsBySuperpositionId.get(transitionRow.superpositionId) ?? new Set<number>()
    if (positions.has(transitionRow.position)) {
      throw new Error(`Superposition ${transitionRow.superpositionId} contains duplicate member position ${transitionRow.position}`)
    }
    positions.add(transitionRow.position)
    superpositionPositionsBySuperpositionId.set(transitionRow.superpositionId, positions)
  }

  for (const fieldDefaultId of fieldDefaultIds) {
    const fieldRow = fieldRows.find((candidate) => candidate.id === fieldDefaultId)
    if (!fieldRow) {
      throw new Error(`field_defaults references unknown field ${fieldDefaultId}`)
    }

    if (fieldRow.presence !== "required") {
      throw new Error(`field_defaults references non-required field ${fieldRow.name}`)
    }
  }

  for (const fieldRow of fieldRows) {
    if (fieldRow.presence !== "required" && fieldDefaultIds.has(fieldRow.id)) {
      throw new Error(`Optional field ${fieldRow.name} cannot have a persisted default row`)
    }
  }

  const reactionRows = options.db
    .query(
      `SELECT id, position, code
       FROM reactions
       ORDER BY position`,
    )
    .all() as ReactionRow[]

  const sections = new Map(sectionRows.map((sectionRow) => [sectionRow.name, sectionRow]))
  const getSection = (sectionName: SectionName) => getRequiredRow(sections.get(sectionName), `Missing ${sectionName} section in the database`)

  const fieldsSection = getSection("fields")
  const massSection = getSection("mass")
  const processesSection = getSection("processes")
  const reactionsSection = getSection("reactions")
  const matterSection = getSection("matter")
  const bulkSection = getSection("bulk")

  const metaArgs = [JSON.stringify(metaRow.name)]
  const metaConfig = renderMetaConfig(metaRow)
  if (metaConfig !== null) metaArgs.push(metaConfig)

  let source = 'import { MetaFor } from "@metafor/dsl"\n\n'
  source += `export default MetaFor(${metaArgs.join(", ")})`
  source += `\n${renderSectionCall("fields", renderFieldsArgument(fieldsSection, fieldRows, enumVariantRows))}`
  source += `\n${renderSectionCall("superposition", renderSuperpositionArgument(superpositionRows, superpositionCommentRows, transitionRows, conditionRows, fieldRows))}`
  source += `\n${renderSectionCall("mass", massSection.code)}`
  source += `\n${renderSectionCall("processes", renderProcessesArgument(processesSection, processRows, processEnvRows, processHandlerRows))}`
  source += `\n${renderSectionCall("reactions", renderReactionsArgument(reactionsSection, reactionRows))}`
  source += `\n${renderSectionCall("matter", matterSection.code)}`
  source += `\n${renderSectionCall("bulk", bulkSection.code)}\n`

  const filepath = options.filepath ?? `${metaRow.name}.ts`
  validateTypeScriptModule(source, filepath)

  if (!options.format) return source
  return formatTypeScriptSource(source, filepath)
}
