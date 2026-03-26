import type { Database } from "bun:sqlite"
import * as prettier from "prettier"
import * as ts from "typescript"
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
  type StateRow,
  type TransitionCommentRow,
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

const pickSingle = <T>(matches: T[], message: string): T => {
  if (matches.length !== 1) throw new Error(message)
  return matches[0] as T
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

const renderStateProperty = (
  stateRow: StateRow,
  transitionCommentRows: TransitionCommentRow[],
  transitionRows: TransitionRow[],
  conditionsByTransitionId: Map<number, EmittedCondition[]>,
  statesById: Map<number, StateRow>,
  fieldsById: Map<number, EmittedField>,
) => {
  const items = [
    ...transitionCommentRows.map((transitionCommentRow) => ({
      position: transitionCommentRow.position,
      source: transitionCommentRow.text,
    })),
    ...transitionRows.map((transitionRow) => ({
      position: transitionRow.position,
      source: `${renderPropertyName(getRequiredRow(statesById.get(transitionRow.targetStateId), `Unknown state id: ${transitionRow.targetStateId}`).name)}: ${renderTransitionConditions(
        conditionsByTransitionId.get(transitionRow.id) ?? [],
        fieldsById,
      )},`,
    })),
  ].sort((left, right) => left.position - right.position)

  if (items.length === 0) return `${renderPropertyName(stateRow.name)}: {},`
  return `${renderPropertyName(stateRow.name)}: {\n${indentBlock(items.map((item) => item.source).join("\n"), 2)}\n},`
}

const renderSuperpositionArgument = (
  stateRows: StateRow[],
  transitionCommentRows: TransitionCommentRow[],
  transitionRows: TransitionRow[],
  conditionRows: EmittedCondition[],
  fieldRows: EmittedField[],
) => {
  const transitionCommentsByStateId = new Map<number, TransitionCommentRow[]>()
  for (const transitionCommentRow of transitionCommentRows) {
    const list = transitionCommentsByStateId.get(transitionCommentRow.stateId) ?? []
    list.push(transitionCommentRow)
    transitionCommentsByStateId.set(transitionCommentRow.stateId, list)
  }

  const transitionsByStateId = new Map<number, TransitionRow[]>()
  for (const transitionRow of transitionRows) {
    const list = transitionsByStateId.get(transitionRow.stateId) ?? []
    list.push(transitionRow)
    transitionsByStateId.set(transitionRow.stateId, list)
  }

  const conditionsByTransitionId = new Map<number, EmittedCondition[]>()
  for (const conditionRow of conditionRows) {
    const list = conditionsByTransitionId.get(conditionRow.transitionId) ?? []
    list.push(conditionRow)
    conditionsByTransitionId.set(conditionRow.transitionId, list)
  }

  const statesById = new Map(stateRows.map((stateRow) => [stateRow.id, stateRow]))
  const fieldsById = new Map(fieldRows.map((fieldRow) => [fieldRow.id, fieldRow]))

  return renderObjectLiteral(
    stateRows.map((stateRow) =>
      renderStateProperty(
        stateRow,
        transitionCommentsByStateId.get(stateRow.id) ?? [],
        transitionsByStateId.get(stateRow.id) ?? [],
        conditionsByTransitionId,
        statesById,
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
        `SELECT name, configMultiline
         FROM meta
         WHERE id = 1`,
      )
      .get() as
      | {
          name: string
          configMultiline: number | null
        }
      | undefined,
    "The database does not contain a parsed MetaFor module",
  )

  const metaDesc = options.db
    .query(
      `SELECT position, value
       FROM meta_descs
       ORDER BY position`,
    )
    .get() as
    | {
        position: number
        value: string
      }
    | undefined

  const metaDev = options.db
    .query(
      `SELECT position, value
       FROM meta_devs
       ORDER BY position`,
    )
    .get() as
    | {
        position: number
        value: number
      }
    | undefined

  const metaRow: EmittedMeta = {
    name: metaBase.name,
    configMultiline: metaBase.configMultiline === null ? null : Boolean(metaBase.configMultiline),
    desc: metaDesc?.value ?? null,
    descPosition: metaDesc?.position ?? null,
    dev: metaDev ? Boolean(metaDev.value) : null,
    devPosition: metaDev?.position ?? null,
  }

  const sectionRows = options.db
    .query(
      `SELECT name, params, code
       FROM sections`,
    )
    .all() as SectionRow[]

  const fieldBases = options.db
    .query(
      `SELECT id, position, name
       FROM fields
       ORDER BY position`,
    )
    .all() as Array<{
      id: number
      position: number
      name: string
    }>

  const queryFieldIdSet = (table: string) =>
    new Set<number>(
      (
        options.db
          .query(`SELECT fieldId FROM ${table}`)
          .all() as Array<{ fieldId: number }>
      ).map((row) => row.fieldId),
    )

  const stringFieldIds = queryFieldIdSet("string_fields")
  const numberFieldIds = queryFieldIdSet("number_fields")
  const booleanFieldIds = queryFieldIdSet("boolean_fields")
  const arrayFieldIds = queryFieldIdSet("array_fields")
  const enumFieldIds = queryFieldIdSet("enum_fields")

  const optionalFields = new Map(
    (
      options.db
        .query(
          `SELECT fieldId, label
           FROM optional_fields`,
        )
        .all() as Array<{ fieldId: number; label: string | null }>
    ).map((row) => [row.fieldId, row.label]),
  )

  const requiredFields = new Map(
    (
      options.db
        .query(
          `SELECT fieldId, label
           FROM required_fields`,
        )
        .all() as Array<{ fieldId: number; label: string | null }>
    ).map((row) => [row.fieldId, row.label]),
  )

  const requiredStringDefaults = new Map(
    (
      options.db
        .query(
          `SELECT fieldId, value
           FROM required_string_defaults`,
        )
        .all() as Array<{ fieldId: number; value: string }>
    ).map((row) => [row.fieldId, row.value]),
  )

  const requiredNumberDefaults = new Map(
    (
      options.db
        .query(
          `SELECT fieldId, value
           FROM required_number_defaults`,
        )
        .all() as Array<{ fieldId: number; value: string }>
    ).map((row) => [row.fieldId, row.value]),
  )

  const requiredBooleanDefaults = new Map(
    (
      options.db
        .query(
          `SELECT fieldId, value
           FROM required_boolean_defaults`,
        )
        .all() as Array<{ fieldId: number; value: number }>
    ).map((row) => [row.fieldId, Boolean(row.value)]),
  )

  const requiredArrayDefaults = queryFieldIdSet("required_array_defaults")
  const requiredDefaultIds = queryFieldIdSet("required_defaults")
  const requiredEnumDefaults = new Map(
    (
      options.db
        .query(
          `SELECT fieldId, variantPosition
           FROM required_enum_defaults`,
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

  const fieldRows = fieldBases.map((fieldBase) => {
    const type = pickSingle<FieldType>(
      [
        stringFieldIds.has(fieldBase.id) ? "string" : null,
        numberFieldIds.has(fieldBase.id) ? "number" : null,
        booleanFieldIds.has(fieldBase.id) ? "boolean" : null,
        arrayFieldIds.has(fieldBase.id) ? "array" : null,
        enumFieldIds.has(fieldBase.id) ? "enum" : null,
      ].filter(Boolean) as FieldType[],
      `Field ${fieldBase.name} must have exactly one type subtype row`,
    )

    const presenceMatches = [
      optionalFields.has(fieldBase.id) ? "optional" : null,
      requiredFields.has(fieldBase.id) ? "required" : null,
    ].filter(Boolean) as Exclude<FieldPresence, null>[]

    if (presenceMatches.length > 1) {
      throw new Error(`Field ${fieldBase.name} has conflicting optional/required subtype rows`)
    }

    const presence = (presenceMatches[0] ?? null) as FieldPresence
    const label = presence === "optional" ? (optionalFields.get(fieldBase.id) ?? null) : presence === "required" ? (requiredFields.get(fieldBase.id) ?? null) : null

    let defaultType: LiteralType | null = null
    let defaultText: string | null = null
    let defaultNumber: string | null = null
    let defaultBoolean: boolean | null = null

    if (presence === "required") {
      if (!requiredDefaultIds.has(fieldBase.id)) {
        throw new Error(`Required field ${fieldBase.name} is missing its required_defaults base row`)
      }

      const matches = [
        requiredStringDefaults.has(fieldBase.id) ? "string" : null,
        requiredNumberDefaults.has(fieldBase.id) ? "number" : null,
        requiredBooleanDefaults.has(fieldBase.id) ? "boolean" : null,
        requiredArrayDefaults.has(fieldBase.id) ? "array" : null,
        requiredEnumDefaults.has(fieldBase.id) ? "enum" : null,
      ].filter(Boolean) as Array<LiteralType | "enum">

      if (matches.length !== 1) {
        throw new Error(`Required field ${fieldBase.name} must have exactly one default subtype row`)
      }

      const match = matches[0]
      if (match === "string") {
        defaultType = "string"
        defaultText = requiredStringDefaults.get(fieldBase.id) ?? null
      } else if (match === "number") {
        defaultType = "number"
        defaultNumber = requiredNumberDefaults.get(fieldBase.id) ?? null
      } else if (match === "boolean") {
        defaultType = "boolean"
        defaultBoolean = requiredBooleanDefaults.get(fieldBase.id) ?? null
      } else if (match === "array") {
        defaultType = "array"
      } else {
        const variantPosition = requiredEnumDefaults.get(fieldBase.id)
        const enumVariant = (enumVariantsByFieldId.get(fieldBase.id) ?? []).find((variant) => variant.position === variantPosition)
        if (!enumVariant) {
          throw new Error(`Required enum default for field ${fieldBase.name} does not reference an existing enum variant`)
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
      id: fieldBase.id,
      position: fieldBase.position,
      name: fieldBase.name,
      type,
      presence,
      label,
      defaultType,
      defaultText,
      defaultNumber,
      defaultBoolean,
    } satisfies EmittedField
  })

  const enumVariantRows = fieldRows.flatMap((fieldRow) => enumVariantsByFieldId.get(fieldRow.id) ?? [])

  const stateRows = options.db
    .query(
      `SELECT id, position, name
       FROM states
       ORDER BY position`,
    )
    .all() as StateRow[]

  const transitionCommentRows = options.db
    .query(
      `SELECT id, stateId, position, text
       FROM transition_comments
       ORDER BY stateId, position`,
    )
    .all() as TransitionCommentRow[]

  const transitionRows = options.db
    .query(
      `SELECT id, stateId, targetStateId, position
       FROM transitions
       ORDER BY stateId, position`,
    )
    .all() as TransitionRow[]

  const conditionBases = options.db
    .query(
      `SELECT transitionId, position, fieldId
       FROM conditions
       ORDER BY transitionId, position`,
    )
    .all() as Array<{
      transitionId: number
      position: number
      fieldId: number
    }>

  const nullConditions = new Map(
    (
      options.db
        .query(
          `SELECT transitionId, position, value
           FROM null_conditions`,
        )
        .all() as Array<{ transitionId: number; position: number; value: number }>
    ).map((row) => [keyByProcessAndPosition(row.transitionId, row.position), Boolean(row.value)]),
  )

  const conditionRows = conditionBases.map((conditionBase) => {
    const key = keyByProcessAndPosition(conditionBase.transitionId, conditionBase.position)
    if (!nullConditions.has(key)) {
      throw new Error(`Condition ${conditionBase.transitionId}:${conditionBase.position} is missing its null_conditions subtype row`)
    }

    return {
      transitionId: conditionBase.transitionId,
      position: conditionBase.position,
      fieldId: conditionBase.fieldId,
      nullValue: Boolean(nullConditions.get(key)),
    } satisfies EmittedCondition
  })

  const processBases = options.db
    .query(
      `SELECT id, position, name, gapBefore, configMultiline
       FROM processes
       ORDER BY position`,
    )
    .all() as Array<{
      id: number
      position: number
      name: string
      gapBefore: number
      configMultiline: number | null
    }>

  const actionProcessIds = new Set<number>(
    (
      options.db
        .query(
          `SELECT processId
           FROM action_processes`,
        )
        .all() as Array<{ processId: number }>
    ).map((row) => row.processId),
  )

  const destroyProcessIds = new Set<number>(
    (
      options.db
        .query(
          `SELECT processId
           FROM destroy_processes`,
        )
        .all() as Array<{ processId: number }>
    ).map((row) => row.processId),
  )

  const processLabels = new Map(
    (
      options.db
        .query(
          `SELECT processId, position, value
           FROM process_labels`,
        )
        .all() as Array<{ processId: number; position: number; value: string }>
    ).map((row) => [row.processId, row]),
  )

  const processDescs = new Map(
    (
      options.db
        .query(
          `SELECT processId, position, value
           FROM process_descs`,
        )
        .all() as Array<{ processId: number; position: number; value: string }>
    ).map((row) => [row.processId, row]),
  )

  const processEnvLists = new Map(
    (
      options.db
        .query(
          `SELECT processId, position
           FROM process_env_lists`,
        )
        .all() as Array<{ processId: number; position: number }>
    ).map((row) => [row.processId, row.position]),
  )

  const processEnvRows = options.db
    .query(
      `SELECT processId, position, env
       FROM process_envs
       ORDER BY processId, position`,
    )
    .all() as ProcessEnvRow[]

  const actionHandlers = (
    options.db
      .query(
        `SELECT processId, position, code
         FROM process_actions`,
      )
      .all() as Array<{ processId: number; position: number; code: string }>
  ).map(
    (row) =>
      ({
        processId: row.processId,
        position: row.position,
        step: "action",
        code: row.code,
      }) satisfies EmittedProcessHandler,
  )

  const successHandlers = (
    options.db
      .query(
        `SELECT processId, position, code
         FROM process_successes`,
      )
      .all() as Array<{ processId: number; position: number; code: string }>
  ).map(
    (row) =>
      ({
        processId: row.processId,
        position: row.position,
        step: "success",
        code: row.code,
      }) satisfies EmittedProcessHandler,
  )

  const errorHandlers = (
    options.db
      .query(
        `SELECT processId, position, code
         FROM process_errors`,
      )
      .all() as Array<{ processId: number; position: number; code: string }>
  ).map(
    (row) =>
      ({
        processId: row.processId,
        position: row.position,
        step: "error",
        code: row.code,
      }) satisfies EmittedProcessHandler,
  )

  const beforeHandlers = (
    options.db
      .query(
        `SELECT processId, position, code
         FROM destroy_befores`,
      )
      .all() as Array<{ processId: number; position: number; code: string }>
  ).map(
    (row) =>
      ({
        processId: row.processId,
        position: row.position,
        step: "before",
        code: row.code,
      }) satisfies EmittedProcessHandler,
  )

  const processHandlerRows = [...actionHandlers, ...successHandlers, ...errorHandlers, ...beforeHandlers].sort((left, right) =>
    left.processId === right.processId ? left.position - right.position : left.processId - right.processId,
  )

  const processRows = processBases.map((processBase) => {
    const builder = pickSingle<ProcessBuilder>(
      [
        actionProcessIds.has(processBase.id) ? "process" : null,
        destroyProcessIds.has(processBase.id) ? "destroy" : null,
      ].filter(Boolean) as ProcessBuilder[],
      `Process ${processBase.name} must have exactly one builder subtype row`,
    )

    const labelRow = processLabels.get(processBase.id)
    const descRow = processDescs.get(processBase.id)

    return {
      id: processBase.id,
      position: processBase.position,
      name: processBase.name,
      builder,
      gapBefore: processBase.gapBefore,
      configMultiline: processBase.configMultiline === null ? null : Boolean(processBase.configMultiline),
      label: labelRow?.value ?? null,
      labelPosition: labelRow?.position ?? null,
      desc: descRow?.value ?? null,
      descPosition: descRow?.position ?? null,
      envPosition: processEnvLists.get(processBase.id) ?? null,
    } satisfies EmittedProcess
  })

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
  source += `\n${renderSectionCall("superposition", renderSuperpositionArgument(stateRows, transitionCommentRows, transitionRows, conditionRows, fieldRows))}`
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
