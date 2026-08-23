import type { PartAttrMeta } from "@metafor/template/types/node/meta"
import { processBasicAttributes, processSemanticAttributes, processTemplateLiteralAttribute } from "../parser.ts"
import { createNode } from "./index.ts"
import type { ParseContext } from "@metafor/template/types/parser"
import type { NodeMeta } from "@metafor/template/types/node/meta"

const processRuntimeBinding = (
  source: string,
  domain: "mass" | "energy",
  context: ParseContext,
): NonNullable<NodeMeta[typeof domain]> =>
  source.trim() === domain
    ? {data: `/${domain}`}
    : processSemanticAttributes(source, context) || source

/**
 * Валидирует src атрибут в meta узлах.
 * src должен адресовать независимый peer Meta-репозиторий:
 * owner/repository.
 *
 * @param src - Значение src атрибута
 * @param path - Путь узла для сообщения об ошибке
 * @throws Error если src невалиден
 */
function validateSrc(src: string, path: string): void {
  const segments = src.split("/")
  const segment = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/
  const valid = segments.length === 2 &&
    segments.every((value) => segment.test(value))
  if (!valid) {
    throw new Error(
      `Невалидный src в meta узле "${path}": "${src}". ` +
        "Ожидается owner/repository.",
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
        "meta-узел должен иметь src вида owner/repository.",
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
    result.mass = processRuntimeBinding(node.mass, "mass", context)
  }
  if ("energy" in node && node.energy) {
    result.energy = processRuntimeBinding(node.energy, "energy", context)
  }
  if ("fields" in node && node.fields) {
    result.fields = processSemanticAttributes(node.fields, context) || node.fields
  }
  return result
}
