import type { PartAttrMeta } from "./meta.t"
import { processBasicAttributes, processSemanticAttributes, processTemplateLiteralAttribute } from "../parser"
import { createNode } from "."
import type { ParseContext } from "../parser.t"
import type { NodeMeta } from "./meta.t"

/**
 * Валидирует src атрибут в meta узлах.
 * src должен быть hub-адресом вида owner/path (например, zavx0z/git).
 *
 * @param src - Значение src атрибута
 * @param path - Путь узла для сообщения об ошибке
 * @throws Error если src невалиден
 */
function validateSrc(src: string, path: string): void {
  // Hub-адрес: owner/path (минимум один слэш, нет ведущих ./ или ../)
  const hubAddressRegex = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_/-]+$/
  if (!hubAddressRegex.test(src)) {
    throw new Error(
      `Невалидный src в meta узле "${path}": "${src}". ` +
        `src должен быть hub-адресом вида owner/path (например, zavx0z/git).`,
    )
  }
}

/** Создает NodeMeta из PartMeta. */
export const createNodeDataMeta = (
  node: PartAttrMeta,
  context: ParseContext = { pathStack: [], level: 0 },
): NodeMeta => {
  const processed = processTemplateLiteralAttribute(node.tag, context)
  let result: NodeMeta = {
    tag: processed || node.tag,
    type: "meta",
    ...processBasicAttributes(node, context),
    ...(node.child && { child: node.child.map((child) => createNode(child, context)) }),
  }

  // Валидируем src атрибут если присутствует
  const srcPath = [...context.pathStack, "src"].join("/")
  const srcValue = result.string?.src
  if (srcValue !== undefined && srcValue !== null && typeof srcValue === "string") {
    validateSrc(srcValue, srcPath)
  }

  // Обрабатываем семантические атрибуты
  if ("mass" in node && node.mass) {
    result.mass = processSemanticAttributes(node.mass, context) || node.mass
  }
  if ("fields" in node && node.fields) {
    result.fields = processSemanticAttributes(node.fields, context) || node.fields
  }
  return result
}
