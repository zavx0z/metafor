import type { ConditionSchema } from "./index.t.ts"
import { extractTemplateContent, findClosingBrace } from "./utils.ts"

export interface ConditionalInfo {
  placeholder: string
  condition: ConditionSchema
  trueTemplate: string
  falseTemplate?: string
  type: "ternary" | "and" | "or"
}

export function buildFalseCondition(base: ConditionSchema): ConditionSchema {
  return base.eq !== undefined && base.eq !== true ? { ...base, notEq: base.eq } : { ...base, eq: false }
}

type ComparisonOp = "===" | "!==" | ">" | ">=" | "<" | "<="

function parseComparisonExpression(expr: string): {
  left: { src: "context" | "core" | "item"; key: string }
  op: ComparisonOp | undefined
  right: string | number | { src: "context" | "core" | "item"; key: string } | undefined
} | null {
  const trimmed = expr.trim()
  const re =
    /^(?:\s*)((?:context|core|item)\.(\w+))(?:\s*(===|!==|>=|<=|>|<)\s*(?:"([^"]*)"|'([^']*)'|(\d+(?:\.\d+)?)|((?:context|core|item)\.(\w+))))?\s*$/
  const m = trimmed.match(re)
  if (!m) return null
  const leftSrcKey = m[1]!
  const leftSrc = leftSrcKey.split(".")[0] as "context" | "core" | "item"
  const leftKey = leftSrcKey.split(".")[1]!
  const op = (m[3] as ComparisonOp | undefined) || undefined
  let right: string | number | { src: "context" | "core" | "item"; key: string } | undefined
  if (op) {
    if (m[4] !== undefined) right = m[4]!
    else if (m[5] !== undefined) right = m[5]!
    else if (m[6] !== undefined) right = Number(m[6]!)
    else if (m[7] !== undefined) {
      const ref = m[7]!
      right = { src: ref.split(".")[0] as any, key: ref.split(".")[1]! }
    }
  }
  return { left: { src: leftSrc, key: leftKey }, op: op ?? undefined, right: right ?? undefined }
}

function buildTrueCondFromComparison(
  parsed: NonNullable<ReturnType<typeof parseComparisonExpression>>
): ConditionSchema {
  const { left, op, right } = parsed
  if (!op) {
    return { src: left.src, key: left.key, eq: true }
  }
  switch (op) {
    case "===":
      return { src: left.src, key: left.key, eq: right as any }
    case "!==":
      return { src: left.src, key: left.key, notEq: right as any }
    case ">":
      return { src: left.src, key: left.key, gt: right as number | any }
    case ">=":
      return { src: left.src, key: left.key, gte: right as number | any }
    case "<":
      return { src: left.src, key: left.key, lt: right as number | any }
    case "<=":
      return { src: left.src, key: left.key, lte: right as number | any }
  }
}

function buildFalseCondFromComparison(
  parsed: NonNullable<ReturnType<typeof parseComparisonExpression>>
): ConditionSchema {
  const { left, op, right } = parsed
  if (!op) {
    return { src: left.src, key: left.key, eq: false }
  }
  switch (op) {
    case "===":
      return { src: left.src, key: left.key, notEq: right as any }
    case "!==":
      return { src: left.src, key: left.key, eq: right as any }
    case ">":
      return { src: left.src, key: left.key, lte: right as number | any }
    case ">=":
      return { src: left.src, key: left.key, lt: right as number | any }
    case "<":
      return { src: left.src, key: left.key, gte: right as number | any }
    case "<=":
      return { src: left.src, key: left.key, gt: right as number | any }
  }
}

export function parseConditionalBlocks(htmlString: string, conditionalInfo: ConditionalInfo[]): string {
  let processedHtml = htmlString

  processedHtml = parseConditionalBlocksSmart(processedHtml, conditionalInfo)

  const andPattern = /\$\{((?:context|core|item)\.(?:\w+))\s*&&\s*html`([^`]*)`\}/g
  let match
  while ((match = andPattern.exec(htmlString)) !== null) {
    const [fullMatch, conditionExpr, template] = match
    if (!conditionExpr || !template) continue
    const conditionParts = conditionExpr.split(".")
    if (conditionParts.length >= 2) {
      const src = conditionParts[0] as "context" | "core" | "item"
      const key = conditionParts[1]
      if (!key) continue
      const placeholder = `CONDITIONAL_${conditionalInfo.length}`
      const condition: ConditionSchema = { src, key, eq: true }
      conditionalInfo.push({ placeholder, condition, trueTemplate: template, type: "and" })
      processedHtml = processedHtml.replace(fullMatch, placeholder)
    }
  }

  const orPattern = /\$\{((?:context|core|item)\.(?:\w+))\s*\|\|\s*html`([^`]*)`\}/g
  match = null
  while ((match = orPattern.exec(htmlString)) !== null) {
    const [fullMatch, conditionExpr, template] = match
    if (!conditionExpr || !template) continue
    const conditionParts = conditionExpr.split(".")
    if (conditionParts.length >= 2) {
      const src = conditionParts[0] as "context" | "core" | "item"
      const key = conditionParts[1]
      if (!key) continue
      const placeholder = `CONDITIONAL_${conditionalInfo.length}`
      const condition: ConditionSchema = { src, key, eq: null }
      conditionalInfo.push({ placeholder, condition, trueTemplate: template, type: "or" })
      processedHtml = processedHtml.replace(fullMatch, placeholder)
    }
  }

  return processedHtml
}

export function parseConditionalBlocksRecursively(htmlString: string, conditionalInfo: ConditionalInfo[]): string {
  let processedHtml = htmlString
  let hasChanges = true
  let maxIterations = 10
  let iteration = 0
  while (hasChanges && iteration < maxIterations) {
    const beforeLength = processedHtml.length
    const beforeConditionalCount = conditionalInfo.length
    processedHtml = parseConditionalBlocks(processedHtml, conditionalInfo)
    for (let i = beforeConditionalCount; i < conditionalInfo.length; i++) {
      const item = conditionalInfo[i]
      if (item && item.trueTemplate) {
        item.trueTemplate = parseConditionalBlocks(item.trueTemplate, conditionalInfo)
      }
      if (item && item.falseTemplate) {
        item.falseTemplate = parseConditionalBlocks(item.falseTemplate, conditionalInfo)
      }
    }
    hasChanges = processedHtml.length !== beforeLength || conditionalInfo.length !== beforeConditionalCount
    iteration++
  }
  if (iteration >= maxIterations) {
    console.warn("Достигнут максимум итераций при рекурсивной обработке условных блоков")
  }
  return processedHtml
}

export function parseConditionalBlocksSmart(htmlString: string, conditionalInfo: ConditionalInfo[]): string {
  let processedHtml = htmlString
  const conditionalStartPattern = /\$\{\s*([^?]+?)\s*\?\s*/g
  let match
  while ((match = conditionalStartPattern.exec(htmlString)) !== null) {
    const [startMatch, conditionExpr] = match
    const startIndex = match.index
    const afterStart = startIndex + startMatch.length
    const htmlTemplateStart = htmlString.indexOf("html`", afterStart)
    if (htmlTemplateStart === -1) continue
    const trueContent = extractTemplateContent(htmlString, htmlTemplateStart + 5)
    if (trueContent === null) continue
    const afterTrueTemplate = htmlTemplateStart + 5 + trueContent.length + 1
    const colonIndex = htmlString.indexOf(":", afterTrueTemplate)
    if (colonIndex === -1) continue
    const htmlTemplateStart2 = htmlString.indexOf("html`", colonIndex)
    if (htmlTemplateStart2 === -1) continue
    const falseContent = extractTemplateContent(htmlString, htmlTemplateStart2 + 5)
    if (falseContent === null) continue
    const afterFalseTemplate = htmlTemplateStart2 + 5 + falseContent.length + 1
    const closingBrace = findClosingBrace(htmlString, startIndex)
    if (closingBrace === -1) continue
    const fullMatch = htmlString.substring(startIndex, closingBrace + 1)
    if (!conditionExpr) continue
    const parsed = parseComparisonExpression(conditionExpr)
    if (!parsed) continue
    const placeholder = `CONDITIONAL_${conditionalInfo.length}`
    const condition = buildTrueCondFromComparison(parsed)
    conditionalInfo.push({
      placeholder,
      condition,
      trueTemplate: trueContent,
      falseTemplate: falseContent,
      type: "ternary",
    })
    processedHtml = processedHtml.replace(fullMatch, placeholder)
  }
  return processedHtml
}

export function parseConditionalBlocksForArray(htmlString: string, conditionalInfo: ConditionalInfo[]): string {
  let processedHtml = htmlString
  const ternaryPattern = /\$\{\s*([^?]+?)\s*\?\s*html`([^`]*)`\s*:\s*html`([^`]*)`\}/g
  let match
  while ((match = ternaryPattern.exec(htmlString)) !== null) {
    const [fullMatch, conditionExpr, trueTemplate, falseTemplate] = match
    if (!conditionExpr) continue
    const parsed = parseComparisonExpression(conditionExpr)
    if (!parsed) continue
    const placeholder = `CONDITIONAL_${conditionalInfo.length}`
    const condition = buildTrueCondFromComparison(parsed)
    conditionalInfo.push({
      placeholder,
      condition,
      trueTemplate: trueTemplate || "",
      falseTemplate: falseTemplate || "",
      type: "ternary",
    })
    processedHtml = processedHtml.replace(fullMatch, placeholder)
  }
  const andPattern = /\$\{((\w+)\.(\w+))\s*&&\s*html`([^`]*)`\}/g
  while ((match = andPattern.exec(htmlString)) !== null) {
    const [fullMatch, conditionExpr, _varName, key, template] = match
    if (!conditionExpr || !template || !key) continue
    const placeholder = `CONDITIONAL_${conditionalInfo.length}`
    const condition: ConditionSchema = { src: "item", key, eq: true }
    conditionalInfo.push({ placeholder, condition, trueTemplate: template, type: "and" })
    processedHtml = processedHtml.replace(fullMatch, placeholder)
  }
  const orPattern = /\$\{((\w+)\.(\w+))\s*\|\|\s*html`([^`]*)`\}/g
  while ((match = orPattern.exec(htmlString)) !== null) {
    const [fullMatch, conditionExpr, _varName, key, template] = match
    if (!conditionExpr || !template || !key) continue
    const placeholder = `CONDITIONAL_${conditionalInfo.length}`
    const condition: ConditionSchema = { src: "item", key, eq: null }
    conditionalInfo.push({ placeholder, condition, trueTemplate: template, type: "or" })
    processedHtml = processedHtml.replace(fullMatch, placeholder)
  }
  return processedHtml
}
