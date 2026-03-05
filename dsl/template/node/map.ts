import type { PartAttrMap } from "./map.t"
import type { ParseContext, ParseResult } from "../parser.t"
import { createNode } from "."
import type { NodeMap, TokenMapClose, TokenMapOpen } from "./map.t"
// Паттерны для парсинга map выражений
const MAP_PATTERN = /(\w+(?:\.\w+)*)\.map\(([^)]*)\)/

export const parseMap = (mapText: string, context: ParseContext = { pathStack: [], level: 0 }): ParseResult => {
  // Ищем паттерн: identifier.identifier.map((params) => html`)
  const mapMatch = mapText.match(MAP_PATTERN)

  if (!mapMatch) {
    return { path: "" }
  }

  const dataPath = mapMatch[1] || ""
  const paramsText = mapMatch[2] || ""

  // Парсим параметры map-функции
  const { params, isDestructured } = extractMapParams(paramsText.replace(/^\(|\)$/g, ""))

  // Определяем тип пути и создаем соответствующий контекст
  let targetPath: string

  if (dataPath.includes(".") && context.mapParams && context.mapParams.length > 0) {
    // Относительный путь в контексте map
    const parts = dataPath.split(".")
    const relativePath = parts[parts.length - 1] || ""
    targetPath = `[item]/${relativePath}`
  } else if (
    !dataPath.includes(".") &&
    (context.currentPath?.includes("[item]") || (context.mapParams && context.mapParams.length > 0))
  ) {
    // Вложенный map в контексте map
    targetPath = `[item]/${dataPath}`
  } else {
    // Абсолютный путь
    targetPath = `/${dataPath.replace(/\./g, "/")}`
  }

  /**
   * Создает новый контекст парсера для map операций.
   */
  const createNewParseContext = (
    path: string,
    params: string[],
    isDestructured: boolean,
    context: ParseContext
  ): ParseContext => {
    const newParseMapContext = {
      path,
      params,
      isDestructured,
      level: context.level + 1,
    }

    return {
      ...context,
      currentPath: path,
      pathStack: [...context.pathStack, path],
      mapParams: params,
      level: context.level + 1,
      mapContextStack: [...(context.mapContextStack || []), newParseMapContext],
    }
  }

  const newContext = createNewParseContext(targetPath, params, isDestructured, context)

  return {
    path: targetPath,
    context: newContext,
    metadata: { params },
  }
}
/**
 * Создает NodeMap из обычного PartMap.
 */
// ============================================================================
// NODE CREATION FACTORIES
// ============================================================================

export const createNodeDataMap = (node: PartAttrMap, context: ParseContext = { pathStack: [], level: 0 }): NodeMap => {
  const mapData = parseMap(node.text, context)

  return {
    type: "map",
    data: Array.isArray(mapData.path) ? mapData.path[0] || "" : mapData.path,
    child: node.child ? node.child.map((child: any) => createNode(child, mapData.context || context)) : [],
  }
} // ============================================================================
// ПОИСК ТОКЕНОВ
// ============================================================================

export const findMapOpen = (expr: string): [number, TokenMapOpen] | undefined => {
  const mapOpenRegex = /\$\{([a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*\.map\([^)]*\))/g
  let match
  while ((match = mapOpenRegex.exec(expr)) !== null) {
    return [match.index, { kind: "map-open", sig: match[1]! }]
  }
}

export const findMapClose = (expr: string): [number, TokenMapClose] | undefined => {
  const mapCloseRegex = /`?\)\}/g
  let closeMatch
  while ((closeMatch = mapCloseRegex.exec(expr)) !== null) {
    return [closeMatch.index, { kind: "map-close" }]
  }
} // ============================================================================
// EXPRESSION PARSERS
// ============================================================================
/**
 * Парсит параметры map-функции.
 */

export const extractMapParams = (paramsText: string): { params: string[]; isDestructured: boolean } => {
  const cleanParams = paramsText.replace(/\s+/g, "").trim()
  if (!cleanParams) return { params: [], isDestructured: false }

  const destructureMatch = cleanParams.match(/\{([^}]+)\}/)
  const isDestructured = !!destructureMatch
  const params = destructureMatch?.[1]
    ? destructureMatch[1].split(",").map((p) => p.trim())
    : cleanParams.split(",").map((p) => p.trim())

  return { params, isDestructured }
}
