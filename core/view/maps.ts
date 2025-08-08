/** Типы TemplateResult */
// Важно: эти должны соответствовать значениям в PartType

import type { Template } from "./html"

// Кэш для обработанных meta- шаблонов
export const metaTemplateCache = new WeakMap<
  TemplateStringsArray,
  {
    processedStrings: TemplateStringsArray
    metaIndices: Set<number>
  }
>()

/**
 * Кэш подготовленных шаблонов, ключами которого являются TemplateStringsArray
 * и _не_ учитывается конкретный тег шаблона, который использовался. Это
 * означает, что теги шаблонов не могут быть динамическими - они должны быть
 * статическими и быть одним из html, svg, или attr. Это ограничение
 * упрощает поиск в кэше, который является горячим путем для рендеринга.
 */
export const templateCache = new WeakMap<TemplateStringsArray, Template>()
