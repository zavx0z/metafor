/**
 * @typedef {import("./types").TagEndRegex} TagEndRegex
 * @typedef {import("./types/directives").DirectiveResult} DirectiveResult
 * @typedef {import("./types/directives").PartInfo} PartInfo
 * @typedef {import("./types/part").Part} Part
 * @typedef {import("./types/part").RootPart} RootPart
 * @typedef {import("./types/part").TemplatePart} TemplatePart
 *
 * @typedef {import("./types/html").CompiledTemplate} CompiledTemplate
 * @typedef {import("./types/html").CompiledTemplateResult} CompiledTemplateResult
 * @typedef {import("./types/html").DirectiveParent} DirectiveParent
 * @typedef {import("./types/html").Disconnectable} Disconnectable
 * @typedef {import("./types/html").EventListenerWithOptions} EventListenerWithOptions
 * @typedef {import("./types/html").RenderOptions} RenderOptions
 * @typedef {import("./types/html").ResultType} ResultType
 * @typedef {import("./types/html").UncompiledTemplateResult} UncompiledTemplateResult
 *
 * @typedef {import("./directive.js").Directive} Directive
 * @typedef {import("trusted-types/lib").TrustedHTML} TrustedHTML
 * @typedef {import("trusted-types/lib").TrustedTypesWindow} TrustedTypesWindow
 */
/**
 * @template {ResultType} T
 * @typedef {import("./types/html").TemplateResult<T>} TemplateResult
 */
export const DEV_MODE = true
// Позволяет минификаторам переименовывать ссылки на globalThis
export const global = globalThis
export const trustedTypes = /** @type { TrustedTypePolicyFactory} */ (/** @type {any} */ (global).trustedTypes)
/**
 * TrustedTypePolicy для HTML, которая объявляется с помощью функции тега шаблона html.
 *
 * Этот HTML является константой, написанной разработчиком, и парсится с помощью
 * innerHTML до того, как в него будут добавлены недоверенные выражения.
 * Поэтому он считается безопасным по построению.
 */
export const policy = trustedTypes ? trustedTypes.createPolicy("atom-html", {createHTML: s => s}) : undefined
/** @type {(_node: Node, _name: string, _type: "property" | "attribute") => (value: unknown) => unknown} */
export const noopSanitizer = (_node, _name, _type) => value => value
/** @type {(value: unknown) => boolean} */
export const isPrimitive = value => value === null || (typeof value != "object" && typeof value != "function")
/** @type {(value: unknown) => boolean} */
export const isArray = Array.isArray
/** @type {(value: unknown) => boolean} */
export const isIterable = value =>
  isArray(value) || typeof (/** @type {any} */ (value)?.[Symbol.iterator]) === "function"
/** Добавляется к имени атрибута, чтобы пометить атрибут как привязанный, чтобы мы могли легко его найти. */
export const boundAttributeSuffix = "$atom$"
/**
 * Этот маркер используется во многих синтаксических позициях в HTML, поэтому он должен быть
 * допустимым именем элемента и атрибута. Пока не поддерживаются динамические имена,
 * но это как минимум гарантирует, что дерево разбора ближе к намерению шаблона.
 */
export const marker = `atom$${Math.random().toFixed(9).slice(2)}$`
/** Строка, используемая для определения, является ли комментарий маркерным комментарием */
export const markerMatch = "?" + marker
/**
 * Текст, используемый для вставки маркерного узла комментария.
 * Мы используем синтаксис инструкции по обработке,
 * потому что он немного меньше, но парсится как узел комментария.
 */
export const nodeMarker = `<${markerMatch}>`
export const d = /** @type {Document} */ (
  global.document === undefined
    ? {
      createTreeWalker() {
        return {}
      }
    }
    : document
)
/** Создает динамический маркер. Мы никогда не будем искать их в DOM. */
export const createMarker = () => d.createComment("")
/** Типы TemplateResult */
export const HTML_RESULT = 1
export const SVG_RESULT = 2
export const MATHML_RESULT = 3
/** Типы TemplatePart (ВАЖНО: эти значения должны совпадать со значениями в PartType) */
export const ATTRIBUTE_PART = 1
export const CHILD_PART = 2
export const PROPERTY_PART = 3
export const BOOLEAN_ATTRIBUTE_PART = 4
export const EVENT_PART = 5
export const ELEMENT_PART = 6
export const COMMENT_PART = 7
export const SPACE_CHAR = `[ \t\n\f\r]`
export const ATTR_VALUE_CHAR = `[^ \t\n\f\r"'\`<>=]`
export const NAME_CHAR = `[^\\s"'>=/]`
/**
 * Конец текста это: `<` за которым следует:
 * - [начало комментария]
 * - или [тег]
 * - или [динамическая привязка тега]
 */
export const textEndRegex = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g
export const COMMENT_START = 1
export const TAG_NAME = 2
export const DYNAMIC_TAG_NAME = 3
export const commentEndRegex = /-->/g
/** Комментарии, которые не начинаются с <!--, например </{, могут заканчиваться одним символом `>` */
export const comment2EndRegex = />/g
export const tagEndRegex = new RegExp(
  `>|${SPACE_CHAR}(?:(${NAME_CHAR}+)(${SPACE_CHAR}*=${SPACE_CHAR}*(?:${ATTR_VALUE_CHAR}|("|')|))|$)`,
  "g"
)
export const ENTIRE_MATCH = 0
export const ATTRIBUTE_NAME = 1
export const SPACES_AND_EQUALS = 2
export const QUOTE_CHAR = 3
export const singleQuoteAttrEndRegex = /'/g
export const doubleQuoteAttrEndRegex = /"/g
/**
 * Соответствует необработанным текстовым элементам.
 * Комментарии не анализируются в необработанных текстовых элементах,
 * поэтому нам нужно искать в их текстовом контенте строки маркеров.
 */
export const rawTextElement = /^(?:script|style|textarea|title)$/i
/**
 * Сигнальное значение, которое указывает ChildPart полностью очистить свое содержимое.
 *
 * ```ts
 * const button = html`${
 *  user.isAdmin
 *    ? html`<button>DELETE</button>`
 *    : nothing
 * }`;
 * ```
 *
 * Рекомендуется использовать `nothing` вместо других ложных значений, так как это обеспечивает
 * согласованное поведение между различными контекстами привязки выражений.
 *
 * В дочерних выражениях `undefined`, `null`, `''` и `nothing` ведут себя одинаково
 * и не отрисовывают узлы. В выражениях атрибутов `nothing` _удаляет_ атрибут,
 * в то время как `undefined` и `null` отрисуют пустую строку. В выражениях свойств
 * `nothing` становится `undefined`.
 */
export const nothing = Symbol.for("nothing")
/** Символ, который сигнализирует, что значение было обработано директивой и не должно быть записано в DOM. */
export const noChange = Symbol.for("noChange")
/**
 * Кэш подготовленных шаблонов, ключей по массиву TemplateStringsArray и не учитывая конкретный тег шаблона.
 * Это означает, что теги шаблонов не могут быть динамическими - они должны быть статическими и равными html, svg, или attr.
 * Это ограничение упрощает поиск в кэше, который находится на горячем пути рендеринга.
 *
 * @type {WeakMap<TemplateStringsArray, import("./html.js").Template>}
 */
export const templateCache = new WeakMap()
export const walker = d.createTreeWalker(d, 129 /* NodeFilter.SHOW_{ELEMENT|COMMENT} */)

/**
 *
 * @param {TemplateStringsArray} tsa
 * @param {string} stringFromTSA
 * @returns {TrustedHTML}
 */
export function trustFromTemplateString(tsa, stringFromTSA) {
  // Проверка безопасности для предотвращения подмены результатов шаблонов.
  // В будущем мы сможем заменить это на Array.isTemplateObject,
  // хотя нам может потребоваться выполнить эту проверку внутри функций html и svg,
  // поскольку предварительно скомпилированные шаблоны поступают не как
  // объекты TemplateStringArray.
  if (!isArray(tsa) || !tsa.hasOwnProperty("raw")) {
    let message = "invalid template strings array"
    if (DEV_MODE) {
      message = `
          Внутренняя ошибка: ожидалось, что строки шаблона будут массивом с полем 'raw'.
          Вызов функций html или svg как обычных функций фактически эквивалентен вызову unsafeHtml
          и может привести к серьезным проблемам безопасности, например, к XSS-атакам.
        `
        .trim()
        .replace(/\n */g, "\n")
    }
    throw new Error(message)
  }
  // @ts-ignore
  return policy !== undefined ? policy.createHTML(stringFromTSA) : stringFromTSA
}

/**
 * @param {import("./html.js").ChildPart | import("./html.js").AttributePart | import("./html.js").ElementPart} part - Часть
 * @param {unknown} value - Значение
 * @param {DirectiveParent} [parent=part] - Родитель
 * @param {number} [attributeIndex] - Индекс атрибута
 * @returns {unknown}
 */
export function resolveDirective(part, value, parent = /** @type {DirectiveParent} */ (part), attributeIndex) {
  // Выходим раньше, если значение явно noChange, это означает, что любая вложенная директива остается прикрепленной и не выполняется.
  if (value === noChange) return value
  let currentDirective = attributeIndex !== undefined ? parent.__directives?.[attributeIndex] : parent.__directive

  const nextDirectiveConstructor = /** @type {import("./types/directives").DirectiveClass | undefined} */ (
    isPrimitive(value) ? undefined : /** @type {DirectiveResult} */ (value)["_$atomDirective$"]
  )

  if (currentDirective?.constructor !== nextDirectiveConstructor) {
    // @ts-ignore (async directive)
    currentDirective && currentDirective["_$notifyDirectiveConnectionChanged"]?.(false)
    if (nextDirectiveConstructor === undefined) currentDirective = undefined
    else {
      currentDirective = new nextDirectiveConstructor(/** @type {PartInfo} */ (part))
      currentDirective._$initialize(part, parent, attributeIndex)
    }
    if (attributeIndex !== undefined) {
      ;(parent.__directives ??= [])[attributeIndex] = currentDirective
    } else parent.__directive = currentDirective
  }
  if (currentDirective !== undefined)
    value = resolveDirective(
      part,
      currentDirective._$resolve(part, /** @type {DirectiveResult} */ (value).values),
      currentDirective,
      attributeIndex
    )
  return value
}

/**
 * Возвращает HTML-строку для заданного массива строк шаблона и типа результата (HTML или SVG),
 * а также имена чувствительных к регистру привязанных атрибутов в порядке шаблона.
 * HTML содержит маркеры комментариев, обозначающие `ChildPart`s
 * и суффиксы на привязанных атрибутах, обозначающие `AttributeParts`.
 *
 * @param {TemplateStringsArray} strings - Массив строк шаблона
 * @param {ResultType} type - HTML или SVG
 * @return {[TrustedHTML, string[]]} Массив, содержащий `[html, attrNames]` (массив, возвращенный для краткости,
 *     чтобы избежать полей объектов, так как этот код используется с неминифицированным SSR
 *     кодом)
 */
export const getTemplateHtml = (strings, type) => {
  // Вставляем маркеры в HTML-шаблон для представления позиции привязок.
  // Следующий код сканирует строки шаблона, чтобы определить синтаксическую позицию привязок.
  // Они могут находиться в текстовой позиции:
  // - где мы вставляем HTML-комментарий
  // - в позиции значения атрибута
  // - где мы вставляем строку-сигнализатор и переписываем имя атрибута
  // - или внутри тега, где мы вставляем строку-сигнализатор
  const l = strings.length - 1
  // Массив, содержащий имена чувствительных к регистру привязанных атрибутов в порядке их частей.
  // ElementParts также отражаются в этом массиве как undefined, а не как строка,
  // чтобы отличать от привязки атрибутов.
  /** @type {Array<string>} */
  const attrNames = []
  let html = type === SVG_RESULT ? "<svg>" : type === MATHML_RESULT ? "<math>" : ""
  // Когда мы внутри тега raw text (не в его текстовом содержимом),
  // regex будет все еще tagRegex, чтобы мы могли найти атрибуты,
  // но перейдет к этому regex, когда тег закончится.
  let rawTextEndRegex
  // Текущее состояние парсинга, представленное ссылкой на один из regex
  let regex = textEndRegex

  for (let i = 0; i < l; i++) {
    const s = strings[i]
    // Индекс конца последнего имени атрибута. Когда это положительно в конце строки,
    // это означает, что мы находимся в позиции значения атрибута и нужно переписать имя атрибута.
    // Мы также используем специальное значение -2, чтобы указать, что мы встретили конец строки
    // в позиции атрибута.
    let attrNameEndIndex = -1
    let attrName = ""
    let lastIndex = 0
    let match
    // Условия в этом цикле обрабатывают текущее состояние парсинга
    // и присваивания переменной `regex` являются переходами состояния.
    while (lastIndex < s.length) {
      // Убедитесь, что мы начинаем поиск с того места, где мы остановились
      regex.lastIndex = lastIndex
      match = regex.exec(s)
      if (match === null) break
      lastIndex = regex.lastIndex
      if (regex === textEndRegex) {
        if (match[COMMENT_START] === "!--") {
          regex = commentEndRegex
        } else if (match[COMMENT_START] !== undefined) {
          regex = comment2EndRegex // Мы начали странный комментарий, например </{
        } else if (match[TAG_NAME] !== undefined) {
          if (rawTextElement.test(match[TAG_NAME])) {
            // Записываем, если мы встречаем элемент raw-text. Мы перейдем к этому regex в конце тега.
            rawTextEndRegex = new RegExp(`</${match[TAG_NAME]}`, "g")
          }
          regex = tagEndRegex
        } else if (match[DYNAMIC_TAG_NAME] !== undefined) {
          if (DEV_MODE)
            throw new Error(
              "Привязки в именах тегов не поддерживаются. Пожалуйста, используйте статические шаблоны вместо этого."
            )
          regex = tagEndRegex
        }
      } else if (regex === tagEndRegex) {
        if (match[ENTIRE_MATCH] === ">") {
          // Конец тега. Если мы начали элемент raw-text, используем этот regex
          regex = rawTextEndRegex ?? textEndRegex
          // Возможно, мы заканчиваем значение атрибута без кавычек,
          // поэтому убедимся, что очищаем все ожидающие attrNameEndIndex
          attrNameEndIndex = -1
        } else if (match[ATTRIBUTE_NAME] === undefined) {
          // Позиция атрибута
          attrNameEndIndex = -2
        } else {
          attrNameEndIndex = regex.lastIndex - match[SPACES_AND_EQUALS].length
          attrName = match[ATTRIBUTE_NAME]
          regex =
            match[QUOTE_CHAR] === undefined
              ? tagEndRegex
              : match[QUOTE_CHAR] === '"'
                ? doubleQuoteAttrEndRegex
                : singleQuoteAttrEndRegex
        }
      } else if (regex === doubleQuoteAttrEndRegex || regex === singleQuoteAttrEndRegex) regex = tagEndRegex
      else if (regex === commentEndRegex || regex === comment2EndRegex) regex = textEndRegex
      else {
        // Не один из пяти состояний regex, поэтому это должен быть динамически созданный regex raw-text
        // и мы находимся в конце этого элемента.
        regex = tagEndRegex
        rawTextEndRegex = undefined
      }
    }

    if (DEV_MODE) {
      // Если мы имеем attrNameEndIndex, который указывает, что мы должны
      // переписать имя атрибута, убедитесь, что мы находимся в допустимой позиции атрибута -
      // либо в теге, либо в квалифицированном значении атрибута.
      console.assert(
        attrNameEndIndex === -1 ||
        regex === tagEndRegex ||
        regex === singleQuoteAttrEndRegex ||
        regex === doubleQuoteAttrEndRegex,
        "unexpected parse state B"
      )
    }

    // У нас есть четыре случая:
    //  1. Мы находимся в позиции текста и не в элементе raw-text
    //     (regex === textEndRegex): вставляем маркер комментария.
    //  2. У нас есть неотрицательный attrNameEndIndex, что означает, что нам нужно
    //     переписать имя атрибута, чтобы добавить суффикс связанного атрибута.
    //  3. Мы находимся не в первой привязке в атрибуте с несколькими привязками,
    //     используем простой маркер.
    //  4. Мы где-то еще внутри тега. Если мы находимся в позиции имени атрибута
    //     (attrNameEndIndex === -2), добавляем последовательный суффикс для
    //     генерации уникального имени атрибута.

    // Обнаруживаем привязку рядом с самозакрывающимся концом тега и вставляем пробел, чтобы отделить маркер от конца тега:
    const end = regex === tagEndRegex && strings[i + 1].startsWith("/>") ? " " : ""
    html +=
      regex === textEndRegex
        ? s + nodeMarker
        : attrNameEndIndex >= 0
          ? (attrNames.push(attrName), s.slice(0, attrNameEndIndex) + boundAttributeSuffix + s.slice(attrNameEndIndex)) +
          marker +
          end
          : s + marker + (attrNameEndIndex === -2 ? i : end)
  }

  const htmlResult =
    html + (strings[l] || "<?>") + (type === SVG_RESULT ? "</svg>" : type === MATHML_RESULT ? "</math>" : "")
  // Возвращается как массив для краткости
  return [trustFromTemplateString(strings, htmlResult), attrNames]
}
let sanitizerFactoryInternal = noopSanitizer

/**
 * Устанавливает глобально фабрику санитизации.
 * @param {SanitizerFactory} newSanitizer
 */
const setSanitizer = newSanitizer => {
  if (sanitizerFactoryInternal !== noopSanitizer) {
    throw new Error(
      "Попытка перезаписать существующую политику безопасности @quantum/html. setSanitizeDOMValueFactory должен быть вызван не более одного раза."
    )
  }
  sanitizerFactoryInternal = newSanitizer
}
/** @type {(_node: Node, _name: string, _type: "property" | "attribute") => (value: unknown) => unknown} */
const createSanitizer = (node, name, type) => sanitizerFactoryInternal(node, name, type)

/** @type {import("./html.type.ts").TagFunction} */
const tag = type => (strings, ...values) => ({_$atomType$: type, strings, values}) // prettier-ignore
/**@type {import("./html.type.ts").HTML} */
export const html = tag(HTML_RESULT)
/**@type {import("./html.type.ts").SVGElement} */
export const svg = tag(SVG_RESULT)
/**@type {import("./html.type.ts").MathML} */
export const mathml = tag(MATHML_RESULT)

export class Template {
  /** @type {HTMLTemplateElement} */ el
  /** @type {Array<TemplatePart>} */ parts = []

  /**
   * @param {UncompiledTemplateResult} params - Массив строк шаблона
   * @param {RenderOptions} [options = {}] - Опции рендеринга
   */
  constructor({strings, ["_$atomType$"]: type}, options = {}) {
    /** @type {Node | null} */ let node
    let nodeIndex = 0
    let attrNameIndex = 0
    const partCount = strings.length - 1
    const parts = this.parts

    // Создаем элемент шаблона
    const [html, attrNames] = getTemplateHtml(strings, type)
    this.el = Template.createElement(html, options)
    walker.currentNode = this.el.content

    // Переместить SVG или MathML узлы в корне шаблона
    if (type === SVG_RESULT || type === MATHML_RESULT) {
      const wrapper = /** @type {Element} */ (this.el.content.firstChild)
      wrapper.replaceWith(...Array.from(wrapper.childNodes))
    }

    // Поиск маркеров привязки и создание TemplateParts
    while ((node = walker.nextNode()) !== null && parts.length < partCount) {
      if (node.nodeType === 1) {
        const element = /** @type {Element} */ (node)
        if (DEV_MODE) {
          const tag = element.localName
          /**
           * Предупреждает, если в элементе `<textarea>` присутствует выражение.
           * Выбрасывает исключение для элемента `<template>`, так как привязки
           * внутри него не поддерживаются.
           *
           * Проверка выполняется путём поиска в `innerHTML` специального маркера,
           * указывающего на наличие привязки. Таким образом удаётся отследить случаи,
           * когда выражения внутри `<textarea>` превращаются в текстовые узлы.
           */
          if (/^(?:textarea|template)$/i.test(tag) && element.innerHTML.includes(marker)) {
            const m = `Выражения не поддерживаются внутри элементов \`${tag}\`. `
            if (tag === "template") throw new Error(m)
          }
        }
        // TODO : для попыток динамических имен тегов мы не увеличиваем bindingIndex, и оно будет на 1 больше в элементе и на 2 больше после него.
        if (element.hasAttributes()) {
          for (const name of element.getAttributeNames()) {
            if (name.endsWith(boundAttributeSuffix)) {
              const realName = attrNames[attrNameIndex++]
              const value = /**@type {string} */ (element.getAttribute(name))
              const statics = value.split(marker)
              const m = /** @type {RegExpExecArray} */ (/([.?@])?(.*)/.exec(realName))
              parts.push({
                type: ATTRIBUTE_PART,
                index: nodeIndex,
                name: m[2],
                strings: statics,
                ctor:
                  m[1] === "."
                    ? PropertyPart
                    : m[1] === "?"
                      ? BooleanAttributePart
                      : m[1] === "@"
                        ? EventPart
                        : AttributePart
              })
              element.removeAttribute(name)
            } else if (name.startsWith(marker)) {
              parts.push({type: ELEMENT_PART, index: nodeIndex})
              element.removeAttribute(name)
            }
          }
        }
        // TODO: сравнить производительность регулярного выражения с проверкой каждого из 3 имен элементов с неформатированным текстом.
        if (rawTextElement.test(element.tagName)) {
          // Для элементов с неформатированным текстом нам нужно разбить текст на
          // маркеры, создать текстовый узел для каждого сегмента и создать
          // TemplatePart для каждого маркера.
          const strings = /** @type {string[]} */ (element.textContent?.split(marker))
          const lastIndex = strings.length - 1
          if (lastIndex > 0) {
            element.textContent = trustedTypes
              ? /** @type {string} */ (/** @type {any} */ (trustedTypes).emptyScript)
              : ""
            // Создаем новый текстовый узел для каждого литерального сегмента
            // Эти узлы также используются как маркеры для узлов части
            // Мы не можем использовать пустые текстовые узлы как маркеры, потому что они
            // нормализуются при клонировании в IE (может упроститься, когда
            // IE больше не поддерживается)
            for (let i = 0; i < lastIndex; i++) {
              element.append(strings[i], createMarker())
              // Переходим через узел маркера, который мы только что добавили
              walker.nextNode()
              parts.push({type: CHILD_PART, index: ++nodeIndex})
            }
            // Обратите внимание, что этот маркер добавляется после текущего узла walker,
            // он будет пройден во внешнем цикле (и пропущен), поэтому
            // мы не нужно корректировать nodeIndex здесь
            element.append(strings[lastIndex], createMarker())
          }
        }
      } else if (node.nodeType === 8) {
        const comment = /** @type {Comment} */ (node)
        const data = comment.data
        if (data === markerMatch) {
          parts.push({type: CHILD_PART, index: nodeIndex})
        } else {
          let i = -1
          while ((i = data.indexOf(marker, i + 1)) !== -1) {
            // Узел комментария содержит маркер привязки внутри, создаем неактивную часть. Привязка не будет работать, но последующие привязки будут
            parts.push({type: COMMENT_PART, index: nodeIndex})
            // Переходим к концу совпадения
            i += marker.length - 1
          }
        }
      }
      nodeIndex++
    }

    if (DEV_MODE) {
      // Если в теге был повторяющийся атрибут, то когда тег
      // разбирается в элемент, атрибут дедуплицируется. Мы можем обнаружить
      // это несоответствие, если не использовали точно каждое имя атрибута
      // при подготовке шаблона. Это работает, потому что `attrNames` создается
      // из строки шаблона, а `attrNameIndex` получается при обработке
      // результирующего DOM.
      if (attrNames.length !== attrNameIndex) {
        throw new Error(
          `Обнаружены повторяющиеся привязки атрибутов. Это происходит, если в вашем шаблоне ` +
          `есть повторяющиеся атрибуты в теге элемента. Например, ` +
          `"<input ?disabled=\${true} ?disabled=\${false}>" содержит ` +
          `повторяющийся атрибут "disabled". Ошибка обнаружена в ` +
          `следующем шаблоне: \n` +
          "`" +
          strings.join("${...}") +
          "`"
        )
      }
    }
  }

  /**
   * Переопределяется через `HtmlPolyfillSupport` для предоставления платформенной поддержки.
   * @param {TrustedHTML} html - HTML
   * @param {RenderOptions} _options - Опции рендеринга
   * @returns {HTMLTemplateElement}
   */
  static createElement(html, _options) {
    const el = d.createElement("template")
    el.innerHTML = /** @type {string} */ (/** @type {unknown} */ (html))
    return el
  }
}

/** Обновляемый экземпляр шаблона. Хранит ссылки на части, используемые для обновления экземпляра шаблона. */
export class TemplateInstance {
  /** @type {Array<ChildPart | AttributePart | ElementPart>} */ _$parts = []
  /** @type {Set<Disconnectable>|undefined} */ _$disconnectableChildren = undefined

  /**
   * @param {Template} template - Шаблон
   * @param {ChildPart} parent - Родитель
   */
  constructor(template, parent) {
    this._$template = template
    this._$parent = parent
  }

  /** Вызывается ChildPart parentNode getter */
  get parentNode() {
    return this._$parent.parentNode
  }

  get _$isConnected() {
    return this._$parent._$isConnected
  }

  /**
   * Этот метод отделен от конструктора, потому что нам нужно вернуть DocumentFragment и мы не хотим хранить его с полем экземпляра.
   * @param {RenderOptions} options - Опции рендеринга
   * @returns {DocumentFragment}
   */
  _clone(options) {
    const {el: {content}, parts} = this._$template // prettier-ignore
    const fragment = (options?.creationScope ?? d).importNode(content, true)
    walker.currentNode = fragment

    let node = /** @type {Node} */ (walker.nextNode())
    let nodeIndex = 0
    let partIndex = 0
    let templatePart = parts[0]

    while (templatePart !== undefined) {
      if (nodeIndex === templatePart.index) {
        let part
        if (templatePart.type === CHILD_PART) {
          part = new ChildPart(/** @type {ChildNode} */ (node), node.nextSibling, this, options)
        } else if (templatePart.type === ATTRIBUTE_PART) {
          part = new templatePart.ctor(
            /** @type {HTMLElement} */ (node),
            templatePart.name,
            templatePart.strings,
            /** @type {DirectiveParent} */ (this),
            options
          )
        } else if (templatePart.type === ELEMENT_PART) {
          part = new ElementPart(/** @type {HTMLElement} */ (node), /** @type {Disconnectable} */ (this), options)
        }
        this._$parts.push(/** @type {ChildPart | AttributePart | ElementPart} */ (part))
        templatePart = parts[++partIndex]
      }
      if (nodeIndex !== templatePart?.index) {
        node = /** @type {Node} */ (walker.nextNode())
        nodeIndex++
      }
    }
    // Нам нужно установить currentNode от cloned tree, чтобы мы не держали его,
    // даже если дерево отсоединено и должно быть освобождено.
    walker.currentNode = d
    return /** @type {DocumentFragment} */ (fragment)
  }

  /** @param {Array<unknown>} values - Значения */
  _update(values) {
    let i = 0
    for (const part of this._$parts) {
      if (part !== undefined) {
        if (/** @type {AttributePart} */ (/** @type {unknown} */ (part)).strings !== undefined) {
          /** @type {AttributePart} */ part._$setValue(
            values,
            /** @type {AttributePart} */ (/** @type {unknown} */ (part)),
            i
          )
          // Количество значений, которые потребляет часть, равно part.strings.length - 1
          // поскольку значения находятся между шаблонами. Мы увеличиваем i на 1
          // позже в цикле, поэтому увеличиваем его на part.strings.length - 2 здесь
          i += /** @type {AttributePart} */ (/** @type {unknown} */ (part)).strings.length - 2
        } else part._$setValue(values[i])
      }
      i++
    }
  }
}

export class ChildPart {
  type = CHILD_PART
  // _$parent?: Disconnectable
  // _$disconnectableChildren?: Set<Disconnectable>
  // _$isConnected: boolean

  /** @type {unknown} */ _$committedValue = nothing
  /** @type {ValueSanitizer | undefined} */ _textSanitizer
  /** @type {Disconnectable | undefined} */ _$parent
  /** @type {Set<Disconnectable>|undefined} */ _$disconnectableChildren = undefined
  /** @type {((isConnected: boolean, removeFromParent?: boolean, from?: number) => void )| undefined} */ _$notifyConnectionChanged =
    undefined
  /** @type {((parent: Disconnectable) => void )| undefined} */ _$reparentDisconnectables = undefined

  /**
   * ChildParts, которые не находятся на верхнем уровне, всегда создаются с родителем;
   * только RootChildNode 's не будут, поэтому они возвращают локальное состояние isConnected
   * @type {boolean}
   */
  get _$isConnected() {
    return this._$parent?._$isConnected ?? this.__isConnected
  }

  /**
   * @param {ChildNode} startNode - Начальный узел
   * @param {ChildNode | null} endNode - Конечный узел
   * @param {TemplateInstance | ChildPart | undefined} parent - Родитель
   * @param {RenderOptions} options - Опции рендеринга
   */
  constructor(startNode, endNode, parent, options = {}) {
    this._$startNode = startNode
    this._$endNode = endNode
    this._$parent = parent
    this.options = options
    // Обратите внимание, что __isConnected используется только для RootParts (т.е. Когда нет _$parent);
    // значение для не корневых частей не важно, но проверка наличия родителя потребовала бы больше кода
    this.__isConnected = options?.isConnected ?? true
  }

  /**
   * Родительский узел, в который часть рендерит свое содержимое.
   *
   * Содержимое ChildPart состоит из диапазона смежных дочерних узлов
   * `.parentNode`, возможно ограниченных 'маркерными узлами' (`.startNode` и
   * `.endNode`).
   *
   * - Если и `.startNode`, и `.endNode` не равны null, то содержимое части
   * состоит из всех узлов между `.startNode` и `.endNode`, не включая их.
   *
   * - Если `.startNode` не равен null, но `.endNode` равен null, то содержимое
   * части состоит из всех узлов после `.startNode`, включая последний дочерний
   * узел `.parentNode`. Если `.endNode` не равен null, то `.startNode` всегда
   * будет не равен null.
   *
   * - Если и `.endNode`, и `.startNode` равны null, то содержимое части
   * состоит из всех дочерних узлов `.parentNode`.
   *
   * @returns {Node}
   */
  get parentNode() {
    let parentNode = /** @type {Node} */ (this._$startNode.parentNode)
    const parent = this._$parent
    if (parent !== undefined && parentNode?.nodeType === 11 /* Node.DOCUMENT_FRAGMENT */) {
      // Если parentNode является DocumentFragment, это может быть потому, что DOM все еще
      // находится в клонированном фрагменте во время начального рендеринга; если это так,
      // получаем реальный parentNode, в который будет помещена часть, спрашивая у родителя.
      parentNode = /** @type {ChildPart | TemplateInstance} */ (parent).parentNode
    }
    return parentNode
  }

  /**
   * Маркерный узел, ведущий часть, если таковые имеются. См. `.parentNode` для более подробной информации.
   *
   * @returns {Node | null}
   */
  get startNode() {
    return this._$startNode
  }

  /**
   * Маркерный узел, завершающий часть, если таковые имеются. См. `.parentNode` для более подробной информации.
   *
   * @returns {Node | null}
   */
  get endNode() {
    return this._$endNode
  }

  /**
   * @param {unknown} value - Значение
   * @param {DirectiveParent} directiveParent - Родитель директивы
   */
  _$setValue(value, directiveParent = /** @type {DirectiveParent} */ (this)) {
    if (DEV_MODE && this.parentNode === null) {
      throw new Error(
        `Этот \`ChildPart\` не имеет \`parentNode\` и поэтому не может принять значение. 
        Это, скорее всего, означает, что элемент, содержащий часть, 
        был изменен не поддерживаемым способом вне контроля QuantumAtom, 
        так что маркерные узлы части были выброшены из DOM. 
        Например, установка элемента \`innerHTML\` или \`textContent\` может сделать это.`
      )
    }
    value = resolveDirective(this, value, directiveParent)
    if (isPrimitive(value)) {
      // Не рендерящиеся дочерние значения. Важно, чтобы они не рендерили
      // пустые текстовые узлы во избежание проблем с предотвращением
      // содержимого <slot> по умолчанию.
      if (value === nothing || value == null || value === "") {
        if (this._$committedValue !== nothing) this._$clear()
        this._$committedValue = nothing
      } else if (value !== this._$committedValue && value !== noChange) {
        this._commitText(value)
      }
    } else if (/** @type {TemplateResult<any>} */ (value)["_$atomType$"] !== undefined) {
      this._commitTemplateResult(/** @type {TemplateResult<any>} */ (value))
    } else if (/** @type {Node} */ (value).nodeType !== undefined) {
      if (DEV_MODE && this.options?.host === value) {
        this._commitText(
          `[вероятная ошибка: шаблон отрисовал свой host внутри себя ` +
          `(обычно возникает при написании \${this} в шаблоне)]`
        )
        console.warn(
          `Attempted to render the template host`,
          value,
          `внутри себя. Это почти всегда ошибка, и в режиме разработки `,
          `мы отображаем предупреждающий текст. Однако в продакшене мы `,
          `отрисуем его, что обычно приводит к ошибке, а иногда `,
          `к исчезновению элемента из DOM.`
        )
        return
      }
      this._commitNode(/** @type {Node} */ (value))
    } else if (isIterable(value)) {
      this._commitIterable(/** @type {Iterable<unknown>} */ (value))
    } else {
      // Запасной вариант, отрисует строковое представление
      this._commitText(value)
    }
  }

  /**
   * @private
   * @template {Node} T
   * @param {T} node - Узел
   * @returns {T}
   */
  _insert(node) {
    return /** @type {any} */ (this._$startNode.parentNode).insertBefore(node, this._$endNode)
  }

  /**
   * @private
   * @param {Node} value - Узел
   */
  _commitNode(value) {
    if (this._$committedValue !== value) {
      this._$clear()
      if (sanitizerFactoryInternal !== noopSanitizer) {
        const parentNodeName = this._$startNode.parentNode?.nodeName
        if (parentNodeName === "STYLE" || parentNodeName === "SCRIPT") {
          let message = "Forbidden"
          if (DEV_MODE) {
            if (parentNodeName === "STYLE") {
              message =
                `@quantum/html не поддерживает привязку внутри узлов style. ` +
                `Это риск безопасности, так как атаки с внедрением стилей могут ` +
                `похищать данные и подделывать пользовательский интерфейс. ` +
                `Вместо этого используйте литералы css\`...\` ` +
                `для составления стилей и выполняйте динамическую стилизацию с помощью ` +
                `пользовательских свойств css, ::parts, <slot>, ` +
                `и путем изменения DOM, а не таблиц стилей.`
            } else {
              message =
                `@quantum/html не поддерживает привязку внутри узлов script. ` +
                `Это риск безопасности, так как это может позволить выполнение ` +
                `произвольного кода.`
            }
          }
          throw new Error(message)
        }
      }
      this._$committedValue = this._insert(value)
    }
  }

  /**
   * @private
   * @param {unknown} value - Значение
   */
  _commitText(value) {
    // Если зафиксированное значение является примитивом, это означает, что мы вызвали _commitText
    // при предыдущем рендеринге, и мы знаем, что this._$startNode.nextSibling является
    // текстовым узлом. Теперь мы можем просто заменить текстовое содержимое (.data) узла.
    if (this._$committedValue !== nothing && isPrimitive(this._$committedValue)) {
      const node = /** @type {Text} */ (this._$startNode.nextSibling)
      if (this._textSanitizer === undefined) {
        this._textSanitizer = createSanitizer(node, "data", "property")
      }
      value = this._textSanitizer(value)
      node.data = /** @type {string} */ (value)
    } else {
      const textNode = d.createTextNode("")
      this._commitNode(textNode)
      // При установке текстового содержимого с точки зрения безопасности очень важно,
      // каким является родительский элемент. Например, <style> и <script> требуют
      // осторожного обращения, в то время как <span> - нет. Поэтому сначала нам нужно
      // поместить текстовый узел в документ, а затем выполнить санитизацию его содержимого.
      if (this._textSanitizer === undefined) this._textSanitizer = createSanitizer(textNode, "data", "property")
      value = this._textSanitizer(value)
      textNode.data = /** @type {string} */ (value)
    }
    this._$committedValue = value
  }

  /**
   * @private
   * @param {TemplateResult<any> | CompiledTemplateResult} result - Шаблон или скомпилированный шаблон
   */
  _commitTemplateResult(result) {
    const {values, ["_$atomType$"]: type} = result
    // Если $atomType$ является числом, result является простым TemplateResult и мы получаем
    // шаблон из кэша шаблонов. Если нет, result является CompiledTemplateResult и _$atomType$
    // является CompiledTemplate, и нам нужно создать <template> элемент в первый раз, когда мы его видим.
    let template
    if (typeof type === "number") {
      template = this._$getTemplate(/** @type {UncompiledTemplateResult} */ (result))
    } else {
      const html = trustFromTemplateString(type.h, type.h[0])
      if (type.el === undefined) {
        type.el = Template.createElement(html, this.options)
      }
      template = type
    }
    if (/** @type {TemplateInstance} */ (this._$committedValue)?._$template === template) {
      /** @type {TemplateInstance} */ (this._$committedValue)._update(values) // prettier-ignore
    } else {
      const instance = new TemplateInstance(template, this)
      const fragment = instance._clone(this.options)
      instance._update(values)
      this._commitNode(fragment)
      this._$committedValue = instance
    }
  }

  /**
   * Переопределяется через `HtmlPolyfillSupport` для обеспечения платформенной поддержки.
   * @internal
   * @param {UncompiledTemplateResult} result - Нескомпилированный шаблон
   * @returns {Template}
   */
  _$getTemplate(result) {
    let template = templateCache.get(result.strings)
    if (template === undefined) templateCache.set(result.strings, (template = new Template(result)))
    return template
  }

  /**
   * @private
   * @param {Iterable<unknown>} value - Итерируемый объект
   */
  _commitIterable(value) {
    // Для Iterable, мы создаем новый InstancePart для каждого элемента, затем устанавливаем его
    // значение в элемент. Это немного избыточно для каждого элемента в Iterable, но это позволяет нам легко и эффективно рекурсировать и обновлять массивы
    // TemplateResults, которые часто возвращаются из выражений, таких как:
    // array.map((i) => html`${i}`), путем повторного использования существующих TemplateInstances.

    // Если value является массивом, то предыдущий рендеринг был Iterable, и value будет содержать ChildParts из предыдущего рендеринга.
    // Если value не является массивом, очистите эту часть и создайте новый массив для ChildParts.
    if (!isArray(this._$committedValue)) {
      this._$committedValue = []
      this._$clear()
    }

    // Позволяет нам отслеживать, сколько элементов мы отметили, чтобы мы могли очистить остальные элементы из предыдущего рендеринга
    const itemParts = /** @type {ChildPart[]} */ (this._$committedValue)
    let partIndex = 0
    let itemPart

    for (const item of value) {
      if (partIndex === itemParts.length) {
        // Если нет существующего элемента, создайте новый
        // TODO: проверить производительность, влияние всегда создания двух частей
        // вместо использования одного и того же элемента между узлами
        itemParts.push(
          (itemPart = new ChildPart(this._insert(createMarker()), this._insert(createMarker()), this, this.options))
        )
      } // Переиспользуем существующий элемент
      else itemPart = itemParts[partIndex]

      itemPart._$setValue(item)
      partIndex++
    }

    if (partIndex < itemParts.length) {
      // itemParts всегда имеют конечные узлы
      this._$clear(itemPart && itemPart._$endNode && itemPart._$endNode.nextSibling, partIndex)
      // Усекаем массив частей, чтобы _value отражал текущее состояние
      itemParts.length = partIndex
    }
  }

  /**
   * Удаляет узлы, содержащиеся в этой части, из DOM.
   * @param {ChildNode | null} start - Начальный узел, с которого начинается очистка, для очистки подмножества DOM части (используется при усечении итерируемых объектов).
   * @param {number} [from] - Когда указан `start`, индекс в итерируемом объекте, с которого удаляются ChildParts, используется для отключения директив в этих частях.
   */
  _$clear(start = this._$startNode.nextSibling, from) {
    this._$notifyConnectionChanged?.(false, true, from)
    while (start && start !== this._$endNode) {
      const n = start.nextSibling
      start.remove()
      start = n
    }
  }

  /**
   * Реализация `isConnected` для RootPart. Обратите внимание, что этот метод
   * должен вызываться только для `RootPart` (объект `ChildPart`, возвращаемый из
   * вызова `render()` верхнего уровня). Он не имеет эффекта для не-корневых ChildParts.
   *
   * @param {boolean} isConnected - Устанавливаемое значение
   * @internal
   */
  setConnected(isConnected) {
    if (this._$parent === undefined) {
      this.__isConnected = isConnected
      this._$notifyConnectionChanged?.(isConnected)
    } else if (DEV_MODE) {
      throw new Error("part.setConnected() может быть вызван только для RootPart, возвращенного из render().")
    }
  }
}

export class AttributePart {
  type = ATTRIBUTE_PART
  /** @type {HTMLElement} */ element
  /** @type {string} */ name
  /** @type {RenderOptions | undefined} */ options
  /** Если этот атрибут часть представляет собой интерполяцию, это содержит статические строки интерполяции.
   * Для однозначных, полных привязок это undefined.
   * @type {ReadonlyArray<string> | undefined} */
  strings
  /** @type {unknown | Array<unknown>} */ _$committedValue = nothing
  /** @type {Set<Disconnectable> | undefined} */ _$disconnectableChildren
  /** @type {ValueSanitizer | undefined} */ _sanitizer
  /** @type {Disconnectable} */ _$parent

  get tagName() {
    return this.element.tagName
  }

  get _$isConnected() {
    return this._$parent._$isConnected
  }

  /**
   * @param {HTMLElement} element - Элемент
   * @param {string} name - Имя
   * @param {ReadonlyArray<string>} strings - Строки
   * @param {Disconnectable} parent - Родитель
   * @param {RenderOptions | undefined} options - Опции
   */
  constructor(element, name, strings, parent, options) {
    this.element = element
    this.name = name
    this._$parent = parent
    this.options = options
    if (strings.length > 2 || strings[0] !== "" || strings[1] !== "") {
      this._$committedValue = new Array(strings.length - 1).fill(new String())
      this.strings = strings
    } else this._$committedValue = nothing
  }

  /**
   * Устанавливает значение этой части путем разрешения значения из возможно нескольких
   * значений и статических строк и фиксирует его в DOM.
   * Если эта часть однозначная, `this._strings` будет undefined, и метод
   * будет вызван с одним аргументом значения. Если эта часть
   * многозначная, `this._strings` будет определен, и метод вызывается
   * с массивом значений владеющего TemplateInstance части и смещением
   * в массиве значений, с которого следует читать значения.
   * Метод перегружен таким образом, чтобы исключить короткоживущие срезы массива
   * значений экземпляра шаблона и обеспечить быстрый путь для однозначных
   * частей.
   *
   * @param {unknown | Array<unknown>} value - Значение части или массив значений для многозначных частей
   * @param {DirectiveParent} directiveParent - Экземпляр директивы, которая вызывает этот метод
   * @param {number} [valueIndex=0] - индекс для начала чтения значений. `undefined` для однозначных частей
   * @param {boolean} [noCommit] - заставляет часть не фиксировать свое значение в DOM. Используется
   *   при гидратации для подготовки частей атрибутов с их первым отрендеренным значением,
   *   но не устанавливает атрибут, а в SSR для no-op DOM операции и
   *   захвата значения для сериализации.
   */
  _$setValue(value, directiveParent = this, valueIndex = 0, noCommit) {
    const strings = this.strings
    // Изменилось ли какое-либо из значений, для проверки на "грязность"
    let change = false
    if (strings === undefined) {
      // Однозначное значение
      value = resolveDirective(this, value, directiveParent, 0)
      change = !isPrimitive(value) || (value !== this._$committedValue && value !== noChange)
      if (change) this._$committedValue = value
    } else {
      /** Многозначное значение */
      const values = /** @type {Array<unknown>} */ (value)
      value = strings[0]

      let i, v
      for (i = 0; i < strings.length - 1; i++) {
        v = resolveDirective(this, values[valueIndex + i], directiveParent, i)

        if (v === noChange)
          // Если пользовательский предоставленный значение `noChange`, используйте предыдущее значение
          v = /** @type {Array<unknown>} */ (this._$committedValue)[i]
        change ||= !isPrimitive(v) || v !== /** @type {Array<unknown>} */ (this._$committedValue)[i]
        if (v === nothing) {
          value = nothing
        } else if (value !== nothing) {
          value += (v ?? "") + strings[i + 1]
        }
        // Мы всегда записываем каждое значение, даже если оно `nothing`, для будущего обнаружения изменений.
        /** @type {Array<unknown>} */ (this._$committedValue)[i] = v // prettier-ignore
      }
    }
    if (change && !noCommit) {
      this._commitValue(value)
    }
  }

  /**
   * @internal
   * @param {unknown} value - Значение
   */
  _commitValue(value) {
    if (value === nothing) {
      /** @type {Element} */ this.element.removeAttribute(this.name)
    } else {
      if (this._sanitizer === undefined)
        this._sanitizer = sanitizerFactoryInternal(this.element, this.name, "attribute")
      value = this._sanitizer(value ?? "")
      this.element.setAttribute(this.name, /** @type {string} */ (value))
    }
  }
}

export class PropertyPart extends AttributePart {
  /**
   * @readonly
   * @type {typeof PROPERTY_PART}
   */
  type = PROPERTY_PART

  /**
   * @internal
   * @param {unknown} value - Значение
   */
  _commitValue(value) {
    if (this._sanitizer === undefined) this._sanitizer = sanitizerFactoryInternal(this.element, this.name, "property")
    value = this._sanitizer(value)
    // @ts-ignore
    this.element[this.name] = value === nothing ? undefined : value
  }
}

export class BooleanAttributePart extends AttributePart {
  /**
   * @readonly
   * @type {typeof BOOLEAN_ATTRIBUTE_PART}
   */
  type = BOOLEAN_ATTRIBUTE_PART

  /**
   * @internal
   * @param {unknown} value - Значение
   */
  _commitValue(value) {
    this.element.toggleAttribute(this.name, !!value && value !== nothing)
  }
}

/**
 * Управляет слушателем событий через add/removeEventListener.
 *
 * Эта часть работает, добавляя себя в качестве слушателя событий элемента,
 * а затем делегируя переданному значению. Это уменьшает количество вызовов
 * add/removeEventListener, если слушатель часто меняется, например, когда
 * встроенная функция используется как слушатель.
 *
 * Поскольку параметры события передаются при добавлении слушателей, мы должны
 * добавлять и удалять часть как слушателя при изменении параметров события.
 */
export class EventPart extends AttributePart {
  /** @type {typeof EVENT_PART} */ type = EVENT_PART

  /**
   * @param {HTMLElement} element - Элемент
   * @param {string} name - Имя
   * @param {ReadonlyArray<string>} strings - Строки
   * @param {Disconnectable} parent - Родитель
   * @param {RenderOptions | undefined} options - Опции
   */
  constructor(element, name, strings, parent, options) {
    super(element, name, strings, parent, options)

    if (DEV_MODE && this.strings !== undefined) {
      throw new Error(
        `Элемент \`<${element.localName}>\` имеет слушатель \`@${name}=...\` с ` +
        "некорректным содержимым. Слушатели событий в шаблонах должны иметь ровно " +
        "одно выражение без окружающего текста."
      )
    }
  }

  /**
   * EventPart не использует базовую реализацию _$setValue/_resolveValue, так как проверка изменений более сложная.
   * @internal
   * @param {unknown} newListener - Новое значение
   * @param {DirectiveParent} directiveParent - Родитель
   */
  _$setValue(newListener, directiveParent = this) {
    newListener = resolveDirective(this, newListener, directiveParent, 0) ?? nothing
    if (newListener === noChange) return
    const oldListener = this._$committedValue
    // Если новое значение равно nothing или изменились какие-либо параметры, нужно удалить часть как слушателя.
    const shouldRemoveListener =
      (newListener === nothing && oldListener !== nothing) ||
      /**@type {EventListenerWithOptions} */ (newListener).capture !==
      /**@type {EventListenerWithOptions} */ (oldListener).capture ||
      /**@type {EventListenerWithOptions} */ (newListener).once !==
      /**@type {EventListenerWithOptions} */ (oldListener).once ||
      /**@type {EventListenerWithOptions} */ (newListener).passive !==
      /**@type {EventListenerWithOptions} */ (oldListener).passive

    // Если новое значение не равно nothing и мы удалили слушателя, нам нужно добавить часть как слушателя.
    const shouldAddListener = newListener !== nothing && (oldListener === nothing || shouldRemoveListener)
    if (shouldRemoveListener) {
      // @ts-ignore
      this.element.removeEventListener(this.name, this, oldListener)
    }
    if (shouldAddListener) {
      // Внимание: IE11 и Chrome 41 не любят использовать слушатель в качестве
      // объекта options. Нужно разобраться, как решить это в IE11 - возможно,
      // пропатчить addEventListener?
      // @ts-ignore
      this.element.addEventListener(this.name, this, newListener)
    }
    this._$committedValue = newListener
  }

  /** @param {Event} event - Событие */
  handleEvent(event) {
    if (typeof this._$committedValue === "function") {
      this._$committedValue.call(this.options?.host ?? this.element, event)
      // @ts-ignore
    } else this._$committedValue.handleEvent(event)
  }
}

export class ElementPart {
  type = ELEMENT_PART
  /** @type {undefined} */ _$committedValue
  /** @type {Disconnectable | undefined} */ _$parent
  /** @type {Set<Disconnectable> | undefined} */ _$disconnectableChildren = undefined
  /** @type {RenderOptions | undefined} */ options

  /**
   * @param {Element} element - Элемент
   * @param {Disconnectable} parent - Родитель
   * @param {RenderOptions | undefined} options - Опции
   */
  constructor(element, parent, options) {
    this.element = element
    this._$parent = parent
    this.options = options
  }

  get _$isConnected() {
    return this._$parent?._$isConnected
  }

  /** @param {unknown} value */
  _$setValue(value) {
    resolveDirective(this, value)
  }
}

/**
 * Отображает значение @quantum/html TemplateResult, в контейнере.
 *
 * Этот пример отображает текст "Привет, Атом!" внутри тега параграфа,
 * добавляя его в контейнер `document.body`.
 *
 * ```js
 * import {html, render} from '@quantum/html';
 *
 * const name = "Атом";
 * render(html`<p>Привет, ${name}!</p>`, document.body);
 * ```
 *
 * @param {unknown} value - Любое [отображаемое значение].
 * Обычно {@linkcode TemplateResult}, созданное путем вычисления тега шаблона
 * как {@linkcode html} или {@linkcode svg}.
 * @param {HTMLElement|DocumentFragment} container - DOM-контейнер для отображения.
 * Первый рендеринг добавит отображаемое значение в контейнер,
 * а последующие рендеры будут эффективно обновлять отображаемое значение,
 * если тот же тип результата был ранее отображен там.
 * @param {RenderOptions} options - См. документацию {@linkcode RenderOptions} для параметров.
 */
export const render = (value, container, options = {}) => {
  // TODO: Выдать более понятное сообщение об ошибке, чем Uncaught TypeError: Cannot read properties of null (reading '_$atomPart$') которое выглядит как внутренняя ошибка @quantum.
  if (container == null) throw new TypeError(`Контейнер для рендеринга не может быть ${container}`)
  const partOwnerNode = /** @type {any} */ (options?.renderBefore ?? container)
  let part = /** @type {any} */ (partOwnerNode)["_$atomPart$"]
  if (part === undefined) {
    const endNode = options?.renderBefore ?? null
    partOwnerNode["_$atomPart$"] = part = new ChildPart(
      container.insertBefore(createMarker(), endNode),
      endNode,
      undefined,
      options ?? {}
    )
  }
  part._$setValue(value)
  return part
}

render.setSanitizer = setSanitizer
render.createSanitizer = createSanitizer
/** Используется только во внутренних тестах, не является частью публичного API. */
render._testOnlyClearSanitizerFactoryDoNotCallOrElse = () => (sanitizerFactoryInternal = noopSanitizer)
