import type { PartAttrMeta } from "@metafor/types/template/node/meta"
import { processBasicAttributes, processSemanticAttributes, processTemplateLiteralAttribute } from "../parser.ts"
import { createNode } from "./index.ts"
import type { ParseContext } from "@metafor/types/template/parser"
import type { NodeMeta } from "@metafor/types/template/node/meta"

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
  const basicAttrs = processBasicAttributes(node, context)
  
  // Извлекаем src из string и перемещаем на верхний уровень
  const src = basicAttrs.string?.src ?? node.src
  if (basicAttrs.string?.src) {
    delete basicAttrs.string.src
    // Если string стал пустым, удаляем его
    if (Object.keys(basicAttrs.string).length === 0) {
      delete basicAttrs.string
    }
  }

  // Валидируем наличие src атрибута
  const srcPath = [...context.pathStack, "src"].join("/")
  if (src === undefined || src === null || src === "") {
    throw new Error(
      `Отсутствует обязательный атрибут src в meta узле "${srcPath}". ` +
        `meta-узел должен иметь атрибут src с hub-адресом вида owner/path.`,
    )
  }

  // Валидируем формат src атрибута
  if (typeof src === "string") {
    validateSrc(src, srcPath)
  }

  let result: NodeMeta = {
    src,
    ...basicAttrs,
    tag: node.tag,
    type: "meta",
    ...(node.child && { child: node.child.map((child) => createNode(child, context)) }),
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
