/**
 * Реализация HTML
 * @module HTML
 */

// ВАЖНО: эти импорты должны быть только для типов
import type { Directive } from "./directive"
import type { DirectiveResult, PartInfo } from "./directive.t"
import {
  HTML_RESULT,
  SVG_RESULT,
  MATHML_RESULT,
  ATTRIBUTE_PART,
  CHILD_PART,
  PROPERTY_PART,
  BOOLEAN_ATTRIBUTE_PART,
  EVENT_PART,
  ELEMENT_PART,
  COMMENT_PART,
} from "./index.t"
import {
  type TemplateResult,
  type CompiledTemplateResult,
  type CompiledTemplate,
  type TemplatePart,
  type Part,
  type Disconnectable,
  type DirectiveParent,
  type HtmlUnstable,
  type SanitizerFactory,
  type ValueSanitizer,
  type RenderOptions,
  type EventListenerWithOptions,
  type RootPart,
  type TrustedHTML,
  type TrustedTypesWindow,
  type Primitive,
  type ResultType,
  type UncompiledTemplateResult,
} from "./index.t"
import {
  isHtmlDebugEnabled,
  addHtmlWarning,
  hasHtmlWarning,
  getHtmlPolyfillSupport,
  isHtmlDebugLogEventsEnabled,
  enableHtmlDebug,
} from "../../web/debug/config"
import type { ActorInternal } from "../index.t"

const ENABLE_EXTRA_SECURITY_HOOKS = true
const ENABLE_SHADYDOM_NOPATCH = true
const NODE_MODE = false

// Включаем отладку HTML
enableHtmlDebug()
const global = globalThis

/**
 * Содержит типы, которые являются частью нестабильного debug API.
 *
 * Всё в этом API нестабильно и может быть изменено или удалено в будущем,
 * даже в patch-версиях.
 */

/**
 * Удобно для визуализации и логирования того, что происходит в системе шаблонов.
 *
 * Не включается в production-сборки.
 */
const debugLogEvent = isHtmlDebugEnabled()
  ? (event: HtmlUnstable.DebugLog.Entry) => {
      const shouldEmit = isHtmlDebugLogEventsEnabled()
      if (!shouldEmit) {
        return
      }
      global.dispatchEvent(
        new CustomEvent<HtmlUnstable.DebugLog.Entry>("html-debug", {
          detail: event,
        })
      )
    }
  : undefined
// Используется для связывания beginRender и endRender при вложенных рендерах,
// когда из-за ошибок не вызывается endRender.
let debugLogRenderId = 0

let issueWarning: (code: string, warning: string) => void

if (isHtmlDebugEnabled()) {
  /**
   * Выдает предупреждение, если мы еще не выдали его, на основе `code` или
   * `warning`. Предупреждения отключаются автоматически только по `warning`;
   * отключение по `code` может быть выполнено пользователями.
   */
  issueWarning = (code: string, warning: string) => {
    warning += code ? ` См. https://metafor.space/msg/${code} для получения дополнительной информации.` : ""
    if (!hasHtmlWarning(warning) && !hasHtmlWarning(code)) {
      console.warn(warning)
      addHtmlWarning(warning)
    }
  }

  queueMicrotask(() => {
    issueWarning("dev-mode", `@metafor/html находится в режиме разработки. Не рекомендуется для продакшена!`)
  })
}

const wrap =
  ENABLE_SHADYDOM_NOPATCH && (global as any).ShadyDOM?.inUse && (global as any).ShadyDOM?.noPatch === true
    ? ((global as any).ShadyDOM!.wrap as <T extends Node>(node: T) => T)
    : <T extends Node>(node: T) => node

const trustedTypes = (global as unknown as TrustedTypesWindow).trustedTypes

/**
 * Наша политика TrustedType для HTML, которая объявляется с помощью функции
 * тега html.
 *
 * Этот HTML является константой, написанной разработчиком, и парсится с
 * помощью innerHTML перед тем, как в него будут включены недоверенные
 * выражения. Следовательно, он считается безопасным по конструкции.
 */
const policy = trustedTypes
  ? trustedTypes.createPolicy("html", {
      createHTML: (s) => s,
    })
  : undefined

/**
 * Используется для очистки любого значения перед его записью в DOM. Это может
 * использоваться для реализации политики безопасности, разрешающей и
 * запрещающей значения, чтобы предотвратить XSS-атаки.
 *
 * Один из способов использования этого обратного вызова - это проверка
 * атрибутов и свойств против списка высокорисковых полей, и требование,
 * чтобы значения, записываемые в такие поля, были экземплярами класса,
 * который считается безопасным по конструкции. Замыкание Safe HTML Types
 * является одной из реализаций этой техники (
 * https://github.com/google/safe-html-types/blob/master/doc/safehtml-types.md).
 * Полифилл TrustedTypes в режиме API-только может также использоваться в
 * качестве основы для этой техники (https://github.com/WICG/trusted-types).
 *
 * @param node Узел HTML (обычно либо узел #text, либо элемент), который
 *     записывается в. Обратите внимание, что это всего лишь пример узла,
 *     запись может происходить против другого экземпляра того же класса узла.
 * @param name Имя атрибута или свойства (например, 'href').
 * @param type Указывает, будет ли запись, которая собирается выполниться,
 *     к свойству или узлу.
 * @return Функция, которая будет очищать этот класс записей.
 */

const identityFunction: ValueSanitizer = (value: unknown) => value
const noopSanitizer: SanitizerFactory = (_node: Node, _name: string, _type: "property" | "attribute") =>
  identityFunction

/** Устанавливает глобальный фабрик очистки. */
const setSanitizer = (newSanitizer: SanitizerFactory) => {
  if (!ENABLE_EXTRA_SECURITY_HOOKS) {
    return
  }
  if (sanitizerFactoryInternal !== noopSanitizer) {
    throw new Error(
      `Попытка перезаписать существующую политику безопасности @metafor/html.` +
        ` setSanitizeDOMValueFactory должен быть вызван не более одного раза.`
    )
  }
  sanitizerFactoryInternal = newSanitizer
}

/**
 * Используется только в внутренних тестах, не является частью публичного API.
 */
const _testOnlyClearSanitizerFactoryDoNotCallOrElse = () => {
  sanitizerFactoryInternal = noopSanitizer
}

const createSanitizer: SanitizerFactory = (node, name, type) => {
  return sanitizerFactoryInternal(node, name, type)
}

// Добавляется к имени атрибута, чтобы отметить атрибут как связанный, чтобы
// мы могли его легко найти.
const boundAttributeSuffix = "$html$"

// Этот маркер используется в множестве синтаксических позициях в HTML, поэтому
// он должен быть допустимым именем элемента и атрибута. Мы не поддерживаем
// динамические имена (еще), но это по крайней мере гарантирует, что дерево
// разбора ближе к намерению шаблона.
const marker = `html$${Math.random().toFixed(9).slice(2)}$`

// Строка, используемая для определения того, является ли комментарий маркерным
// комментарием.
const markerMatch = "?" + marker

// Текст, используемый для вставки узла маркерного комментария. Мы используем
// синтаксис обработки инструкций, потому что он немного меньше, но парсится
// как узел комментария.
const nodeMarker = `<${markerMatch}>`

const d =
  NODE_MODE && global.document === undefined
    ? ({
        createTreeWalker() {
          return {}
        },
      } as unknown as Document)
    : document

// Создает динамический маркер. Мы никогда не должны искать эти узлы в DOM.
const createMarker = () => d.createComment("")

// https://tc39.github.io/ecma262/#sec-typeof-operator
const isPrimitive = (value: unknown): value is Primitive =>
  value === null || (typeof value != "object" && typeof value != "function")
const isArray = Array.isArray
const isIterable = (value: unknown): value is Iterable<unknown> =>
  isArray(value) ||
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeof (value as any)?.[Symbol.iterator] === "function"

const SPACE_CHAR = `[ \t\n\f\r]`
const ATTR_VALUE_CHAR = `[^ \t\n\f\r"'\`<>=]`
const NAME_CHAR = `[^\\s"'>=/]`

// Эти регулярные выражения представляют пять состояний сканера HTML шаблона,
// которые мы заботимся. Они соответствуют концу состояния, которое они
// называют. В зависимости от совпадения мы переходим в новое состояние.
// Если совпадения нет, мы остаемся в том же состоянии.
// Обратите внимание, что регулярные выражения являются состоятельными.
// Мы используем lastIndex и синхронизируем его через несколько регулярных
// выражений, используемых. Помимо пяти регулярных выражений ниже, мы также
// динамически создаем регулярное выражение для поиска соответствующих
// закрывающих тегов для необработанных текстовых элементов.

/**
 * Конец текста: `<` за которым следует:
 *   (начало комментария) или (тег) или (динамическое связывание тега)
 */
const textEndRegex = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g
const COMMENT_START = 1
const TAG_NAME = 2
const DYNAMIC_TAG_NAME = 3

const commentEndRegex = /-->/g
/**
 * Комментарии, которые не начинаются с <!--, как </{, могут заканчиваться
 * одним `>`
 */
const comment2EndRegex = />/g

/**
 * Регулярное выражение tagEnd соответствует позиции "внутри открывающего"
 * синтаксиса тега. Оно либо соответствует `>`, либо последовательности,
 * похожей на атрибут, либо концу строки после пробела (позиция конца
 * имени атрибута).
 *
 * См. атрибуты в спецификации HTML:
 * https://www.w3.org/TR/html5/syntax.html#elements-attributes
 *
 * " \t\n\f\r" - это HTML-символы пробелов:
 * https://infra.spec.whatwg.org/#ascii-whitespace
 *
 * Таким образом, атрибут:
 *  * Имя: любой символ, кроме символа пробела, ("), ('), ">",
 *    "=", или "/". Обратите внимание: это отличается от спецификации HTML,
 *    которая также исключает управляющие символы.
 *  * За которым следует ноль или более пробельных символов
 *  * За которым следует "="
 *  * За которым следует ноль или более пробельных символов
 *  * За которым следует:
 *    * Любой символ, кроме пробела, ('), ("), "<", ">", "=", (`), или
 *    * (") затем любой не-("), или
 *    * (') затем любой не-(')
 */
const tagEndRegex = new RegExp(
  `>|${SPACE_CHAR}(?:(${NAME_CHAR}+)(${SPACE_CHAR}*=${SPACE_CHAR}*(?:${ATTR_VALUE_CHAR}|("|')|))|$)`,
  "g"
)
const ENTIRE_MATCH = 0
const ATTRIBUTE_NAME = 1
const SPACES_AND_EQUALS = 2
const QUOTE_CHAR = 3

const singleQuoteAttrEndRegex = /'/g
const doubleQuoteAttrEndRegex = /"/g
/**
 * Соответствует необработанным текстовым элементам.
 *
 * Комментарии не парсятся внутри необработанных текстовых элементов, поэтому
 * нам нужно искать в их текстовом содержимом строки маркеров.
 */
const rawTextElement = /^(?:script|style|textarea|title)$/i

/** Типы TemplateResult */
// Важно: эти должны соответствовать значениям в PartType

// Кэш для обработанных meta- шаблонов
const metaTemplateCache = new WeakMap<
  TemplateStringsArray,
  {
    processedStrings: TemplateStringsArray
    metaIndices: Set<number>
  }
>()

/**
 * Генерирует функцию тега, которая возвращает TemplateResult с заданным
 * типом результата.
 */
const tag =
  <T extends ResultType>(type: T) =>
  (strings: TemplateStringsArray, ...values: unknown[]): TemplateResult<T> => {
    // Предупреждает о последовательностях escape-последовательностей восьмеричного
    // кода в шаблонах
    // Мы делаем это здесь, а не в рендере, чтобы предупреждение было ближе к
    // определению шаблона.
    if (isHtmlDebugEnabled() && strings.some((s) => s === undefined)) {
      console.warn(
        "Некоторые строковые шаблоны undefined.\n" +
          "Это, вероятно, вызвано нелегальными последовательностями escape-последовательностей восьмеричного кода."
      )
    }
    if (isHtmlDebugEnabled()) {
      // Импорт static-html.js вызывает циклическую зависимость, которую g3 не
      // обрабатывает. Вместо этого мы знаем, что статические значения должны
      // иметь поле `_$htmlStatic$`.
      if (values.some((val) => (val as { _$htmlStatic$: unknown })?.["_$htmlStatic$"])) {
        issueWarning(
          "",
          `Статические значения 'literal' или 'unsafeStatic' не могут использоваться в нестатических шаблонах.\n` +
            `Пожалуйста, используйте статическую функцию 'html' для тега, чтобы увидеть https://metafor.dev/docs/templates/expressions/#static-expressions`
        )
      }
    }

    // Обрабатываем meta- теги (динамические имена тегов вида <meta-${hash}>)
    const hasMetaTags = strings.some((str) => str.includes("meta-"))
    if (hasMetaTags) {
      let cached = metaTemplateCache.get(strings)

      if (!cached) {
        const resultStrings: string[] = []
        const metaIndices = new Set<number>()
        let stripNextLeadingGt = false
        let pendingMetaPrefix: string | null = null

        for (let index = 0; index < strings.length; index++) {
          let str = strings[index]!
          let injectedFromPending = false
          if (pendingMetaPrefix) {
            // Перенос ранее собранного `<meta-<hash>` в начало текущего сегмента
            str = pendingMetaPrefix + str
            pendingMetaPrefix = null
            injectedFromPending = true
          }
          if (stripNextLeadingGt && str.startsWith(">")) {
            str = str.slice(1)
            stripNextLeadingGt = false
          }

          const inject = (token: string) => {
            const pos = str.lastIndexOf(token)
            if (pos === -1 || index >= values.length) return false
            const before = str.slice(0, pos)
            const after = str.slice(pos + token.length)
            let joined = before + token + String(values[index]) + after
            const next = strings[index + 1] ?? ""
            if (next.startsWith(">")) {
              // Случай без атрибутов: переносим '>' в текущую строку
              joined += ">"
              stripNextLeadingGt = true
            } else if (token === "<meta-" && next && !next.startsWith(">")) {
              // Случай с атрибутами: переносим `<meta-` + hash к следующему сегменту,
              // чтобы meta-<hash> оказался в strings[index+1]
              resultStrings.push(before)
              pendingMetaPrefix = `<meta-${String(values[index])}${after}`
              metaIndices.add(index)
              return true
            } else if (next && !/^\s|^>|^\/>/.test(next)) {
              // Защита от склейки имени тега с атрибутом без пробела
              if (!/\s$/.test(joined)) joined += " "
            }
            resultStrings.push(joined)
            metaIndices.add(index)
            return true
          }

          if (!injectedFromPending && (inject("</meta-") || inject("<meta-"))) {
            // инъекция выполнена
          } else {
            resultStrings.push(str)
          }
        }

        const processedStrings = Object.assign([...resultStrings], {
          raw: resultStrings.slice(),
        }) as TemplateStringsArray
        cached = { processedStrings, metaIndices }
        metaTemplateCache.set(strings, cached)
      }

      // Формируем values, исключая встроенные в строки
      const resultValues: unknown[] = []
      for (let i = 0; i < values.length; i++) {
        if (!cached.metaIndices.has(i)) {
          resultValues.push(values[i])
        }
      }

      return {
        ["_$htmlType$"]: type,
        strings: cached.processedStrings,
        values: resultValues,
      }
    }

    return {
      // Это свойство должно оставаться неминифицированным.
      ["_$htmlType$"]: type,
      strings,
      values,
    }
  }

/**
 * Интерпретирует литеральный шаблон как HTML-шаблон, который может эффективно
 * рендериться и обновляться в контейнере.
 *
 * ```ts
 * const header = (title: string) => html`<h1>${title}</h1>`;
 * ```
 *
 * Тег `html` возвращает описание DOM для рендеринга как значение. Он
 * ленивый, что означает, что работа не выполняется, пока шаблон не будет
 * отрендерен. При рендеринге, если шаблон приходит из того же выражения,
 * что и ранее отрендеренный результат, он эффективно обновляется вместо
 * замены.
 */
export const html = tag(HTML_RESULT)

/**
 * Интерпретирует литеральный шаблон как фрагмент SVG, который может эффективно
 * рендериться и обновляться в контейнере.
 *
 * ```ts
 * const rect = svg`<rect width="10" height="10"></rect>`;
 *
 * const myImage = html`
 *   <svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
 *     ${rect}
 *   </svg>`;
 * ```
 *
 * Тег `svg` *функция тега* должна использоваться только для фрагментов SVG,
 * или элементов, которые будут содержаться **внутри** HTML-элемента `<svg>`.
 * Общая ошибка заключается в том, что `<svg>` *элемент* помещается в шаблон,
 * отмеченный тегом `svg`. Элемент `<svg>` является HTML-элементом и должен
 * использоваться в шаблоне, отмеченном функцией {@linkcode html} тега.
 *
 * В использовании LitElement это недопустимо возвращать фрагмент SVG из
 * метода `render()`, так как фрагмент SVG будет содержаться в теневом корне
 * элемента и, следовательно, не будет правильно содержаться в HTML-элементе
 * `<svg>`.
 */
export const svg = tag(SVG_RESULT)

/**
 * Интерпретирует литеральный шаблон как фрагмент MathML, который может эффективно
 * рендериться и обновляться в контейнере.
 *
 * ```ts
 * const num = mathml`<mn>1</mn>`;
 *
 * const eq = html`
 *   <math>
 *     ${num}
 *   </math>`;
 * ```
 *
 * Тег `mathml` *функция тега* должна использоваться только для фрагментов
 * MathML, или элементов, которые будут содержаться **внутри** HTML-элемента
 * `<math>`. Общая ошибка заключается в том, что `<math>` *элемент* помещается
 * в шаблон, отмеченный тегом `mathml`. Элемент `<math>` является HTML-элементом
 * и должен использоваться в шаблоне, отмеченном функцией {@linkcode html} тега.
 *
 * В использовании LitElement это недопустимо возвращать фрагмент MathML из
 * метода `render()`, так как фрагмент MathML будет содержаться в теневом корне
 * элемента и, следовательно, не будет правильно содержаться в HTML-элементе
 * `<math>`.
 */
export const mathml = tag(MATHML_RESULT)

/**
 * Значение-отправка, которое сигнализирует о том, что значение было обработано
 * директивой и не должно записываться в DOM.
 */
export const noChange = Symbol.for("html-noChange")

/**
 * Значение-отправка, которое сигнализирует о том, что ChildPart должен полностью
 * очистить свой контент.
 *
 * ```ts
 * const button = html`${
 *  user.isAdmin
 *    ? html`<button>DELETE</button>`
 *    : nothing
 * }`;
 * ```
 *
 * Предпочитайте использование `nothing` вместо других ложных значений, так как
 * это обеспечивает последовательное поведение между различными контекстами
 * связывания выражений.
 *
 * В выражениях child `undefined`, `null`, `''`, и `nothing` все ведут себя
 * одинаково и не рендерят узлы. В атрибутных выражениях `nothing` _удаляет_
 * атрибут, в то время как `undefined` и `null` будут рендерить пустую строку.
 * В свойственных выражениях `nothing` становится `undefined`.
 */
export const nothing = Symbol.for("html-nothing")

/**
 * Кэш подготовленных шаблонов, ключами которого являются TemplateStringsArray
 * и _не_ учитывается конкретный тег шаблона, который использовался. Это
 * означает, что теги шаблонов не могут быть динамическими - они должны быть
 * статическими и быть одним из html, svg, или attr. Это ограничение
 * упрощает поиск в кэше, который является горячим путем для рендеринга.
 */
const templateCache = new WeakMap<TemplateStringsArray, Template>()

const walker = d.createTreeWalker(d, 129 /* NodeFilter.SHOW_{ELEMENT|COMMENT} */)

let sanitizerFactoryInternal: SanitizerFactory = noopSanitizer

//
// Классы только ниже, объявления константных переменных только выше...
//
// Объединение объявлений переменных и классов улучшает минификацию.
// Интерфейсы и псевдонимы типов могут быть перемешаны свободно.
//

// Тип для классов, которые имеют поле `_directive` или `_directives[]`,
// используемое `resolveDirective`

function trustFromTemplateString(tsa: TemplateStringsArray, stringFromTSA: string): TrustedHTML {
  // Проверка безопасности для предотвращения подделки результатов шаблона Lit.
  // В будущем мы можем заменить это на Array.isTemplateObject, хотя нам
  // может потребоваться сделать эту проверку внутри функций html и svg,
  // потому что предварительно скомпилированные шаблоны не поступают в виде
  // объектов TemplateStringArray.
  if (!isArray(tsa) || !tsa.hasOwnProperty("raw")) {
    let message = "invalid template strings array"
    if (isHtmlDebugEnabled()) {
      message = `
          Internal Error: expected template strings to be an array
          with a 'raw' field. Faking a template strings array by
          calling html or svg like an ordinary function is effectively
          the same as calling unsafeHtml and can lead to major security
          issues, e.g. opening your code up to XSS attacks.
          If you're using the html or svg tagged template functions normally
          and still seeing this error, please file a bug at
          https://github.com/zavx0z/metafor/issues/new?template=bug_report.md
          and include information about your build tooling, if any.
        `
        .trim()
        .replace(/\n */g, "\n")
    }
    throw new Error(message)
  }
  return policy !== undefined ? policy.createHTML(stringFromTSA) : (stringFromTSA as unknown as TrustedHTML)
}

/**
 * Возвращает HTML-строку для заданного TemplateStringsArray и типа результата
 * (HTML или SVG), вместе с чувствительными к регистру именами атрибутов,
 * связанных с шаблоном в порядке. HTML содержит маркеры комментариев,
 * обозначающие `ChildPart`s, и суффиксы на связанных атрибутах, обозначающие
 * `AttributeParts`.
 *
 * @param strings массив строковых шаблонов
 * @param type HTML или SVG
 * @return Массив, содержащий `[html, attrNames]` (возвращается для краткости,
 *     чтобы избежать полей объекта, так как этот код используется в
 *     неминифицированном коде SSR)
 */
const getTemplateHtml = (strings: TemplateStringsArray, type: ResultType): [TrustedHTML, Array<string>] => {
  // Вставляет маркеры в HTML-шаблон, чтобы представить позицию связывания.
  // Следующий код сканирует строки шаблона, чтобы определить синтаксическую
  // позицию связывания. Они могут находиться в текстовой позиции, где
  // мы вставляем HTML-комментарий, позицию значения атрибута, где мы
  // вставляем строку-отправку и переписываем имя атрибута, или внутри
  // тега, где мы вставляем строку-отправку.
  const l = strings.length - 1
  // Хранит чувствительные к регистру имена атрибутов, связанных с частями,
  // в порядке их частей. Элементы также отражены в этом массиве как undefined
  // вместо строки, чтобы дистанцировать от связывания атрибутов.
  const attrNames: Array<string> = []
  let html = type === SVG_RESULT ? "<svg>" : type === MATHML_RESULT ? "<math>" : ""

  // Когда мы внутри необработанного текстового тега (не его текстовое содержимое),
  // регулярное выражение все еще будет tagRegex, поэтому мы можем найти
  // атрибуты, но переключится на это регулярное выражение, когда тег
  // завершится.
  let rawTextEndRegex: RegExp | undefined

  // Текущее состояние парсинга, представленное ссылкой на одно из регулярных
  // выражений
  let regex = textEndRegex

  for (let i = 0; i < l; i++) {
    const s = strings[i]!
    // Индекс конца последнего имени атрибута. Когда это положительно в конце
    // строки, это означает, что мы находимся в позиции значения атрибута
    // и нам нужно переписать имя атрибута.
    // Мы также используем специальное значение -2, чтобы указать, что мы
    // встретили конец строки в позиции имени атрибута.
    let attrNameEndIndex = -1
    let attrName: string | undefined
    let lastIndex = 0
    let match!: RegExpExecArray | null

    // Условия в этом цикле обрабатывают текущее состояние парсинга, и
    // присваивания переменной `regex` являются переходами состояния.
    while (lastIndex < s.length) {
      // Убедимся, что мы начинаем поиск с того места, где мы остановились
      // ранее
      regex.lastIndex = lastIndex
      match = regex.exec(s)
      if (match === null) {
        break
      }
      lastIndex = regex.lastIndex
      if (regex === textEndRegex) {
        if (match[COMMENT_START] === "!--") {
          regex = commentEndRegex
        } else if (match[COMMENT_START] !== undefined) {
          // Мы начали странный комментарий, например </{
          regex = comment2EndRegex
        } else if (match[TAG_NAME] !== undefined) {
          if (rawTextElement.test(match[TAG_NAME])) {
            // Записываем, если мы встречаем необработанный текстовый элемент.
            // Мы переключимся на это регулярное выражение в конце тега.
            rawTextEndRegex = new RegExp(`</${match[TAG_NAME]}`, "g")
          }
          regex = tagEndRegex
        } else if (match[DYNAMIC_TAG_NAME] !== undefined) {
          if (isHtmlDebugEnabled()) {
            throw new Error(
              "Связывания в именах тегов не поддерживаются. Пожалуйста, используйте статические шаблоны вместо этого. " +
                "См. https://lit.dev/docs/templates/expressions/#static-expressions"
            )
          }
          regex = tagEndRegex
        }
      } else if (regex === tagEndRegex) {
        if (match[ENTIRE_MATCH] === ">") {
          // Конец тега. Если мы начали необработанный текстовый элемент,
          // используем это регулярное выражение
          regex = rawTextEndRegex ?? textEndRegex
          // Мы можем заканчивать необученное значение атрибута, поэтому
          // убедитесь, что мы очищаем любой pending attrNameEndIndex
          attrNameEndIndex = -1
        } else if (match[ATTRIBUTE_NAME] === undefined) {
          // Позиция имени атрибута
          attrNameEndIndex = -2
        } else {
          attrNameEndIndex = regex.lastIndex - match[SPACES_AND_EQUALS]!.length
          attrName = match[ATTRIBUTE_NAME]
          regex =
            match[QUOTE_CHAR] === undefined
              ? tagEndRegex
              : match[QUOTE_CHAR] === '"'
              ? doubleQuoteAttrEndRegex
              : singleQuoteAttrEndRegex
        }
      } else if (regex === doubleQuoteAttrEndRegex || regex === singleQuoteAttrEndRegex) {
        regex = tagEndRegex
      } else if (regex === commentEndRegex || regex === comment2EndRegex) {
        regex = textEndRegex
      } else {
        // Не одно из пяти состояний регулярных выражений, поэтому оно должно
        // быть динамически созданным регулярным выражением необработанного
        // текстового элемента, и мы находимся в конце этого элемента.
        regex = tagEndRegex
        rawTextEndRegex = undefined
      }
    }

    if (isHtmlDebugEnabled()) {
      // Если у нас есть attrNameEndIndex, который указывает на то, что
      // нам нужно переписать имя атрибута, утверждаем, что мы находимся
      // в допустимой позиции атрибута - либо в теге, либо в необученном
      // значении атрибута.
      console.assert(
        attrNameEndIndex === -1 ||
          regex === tagEndRegex ||
          regex === singleQuoteAttrEndRegex ||
          regex === doubleQuoteAttrEndRegex,
        "unexpected parse state B"
      )
    }

    // У нас есть четыре случая:
    //  1. Мы находимся в текстовой позиции, и не в необработанном текстовом
    //     элементе (regex === textEndRegex): вставляем маркер комментария.
    //  2. У нас есть неотрицательный attrNameEndIndex, что означает, что
    //     нам нужно переписать имя атрибута, чтобы добавить суффикс имени
    //     связанного атрибута.
    //  3. Мы находимся в первой связывающей части многосвязного атрибута,
    //     используем простой маркер.
    //  4. Мы находимся где-то внутри тега. Если мы находимся в позиции
    //     имени атрибута (attrNameEndIndex === -2), добавляем последовательный
    //     суффикс, чтобы сгенерировать уникальное имя атрибута.

    // Обнаруживаем связывание рядом с концом самозакрывающегося тега и
    // вставляем пробел, чтобы отделить маркер от конца тега:
    const end = regex === tagEndRegex && strings[i + 1]!.startsWith("/>") ? " " : ""
    html +=
      regex === textEndRegex
        ? s + nodeMarker
        : attrNameEndIndex >= 0
        ? (attrNames.push(attrName!), s.slice(0, attrNameEndIndex) + boundAttributeSuffix + s.slice(attrNameEndIndex)) +
          marker +
          end
        : s + marker + (attrNameEndIndex === -2 ? i : end)
  }

  const htmlResult: string | TrustedHTML =
    html + (strings[l] || "<?>") + (type === SVG_RESULT ? "</svg>" : type === MATHML_RESULT ? "</math>" : "")

  // Возвращается как массив для краткости
  return [trustFromTemplateString(strings, htmlResult as string), attrNames]
}

/** @internal */
export type { Template }

class Template {
  /** @internal */
  el!: HTMLTemplateElement

  parts: Array<TemplatePart> = []

  constructor({ strings, ["_$htmlType$"]: type }: UncompiledTemplateResult, options?: RenderOptions) {
    let node: Node | null
    let nodeIndex = 0
    let attrNameIndex = 0
    const partCount = strings.length - 1
    const parts = this.parts

    // Создаем элемент шаблона
    const [html, attrNames] = getTemplateHtml(strings, type)
    this.el = Template.createElement(html, options)
    walker.currentNode = this.el.content

    // Переродитель SVG или MathML узлы в корневой узел шаблона
    if (type === SVG_RESULT || type === MATHML_RESULT) {
      const wrapper = this.el.content.firstChild!
      wrapper.replaceWith(...Array.from(wrapper.childNodes))
    }

    // Обходим шаблон, чтобы найти маркеры связывания и создать TemplateParts
    while ((node = walker.nextNode()) !== null && parts.length < partCount) {
      if (node.nodeType === 1) {
        if (isHtmlDebugEnabled()) {
          const tag = (node as Element).localName
          // Предупреждаем, если `textarea` включает выражение и выбрасываем,
          // если `template` это делает, так как это не поддерживается.
          // Мы делаем это, проверяя innerHTML на что-то, похожее на маркер.
          // Это ловит случаи, когда маркеры превращаются в текстовые узлы.
          if (/^(?:textarea|template)$/i!.test(tag) && (node as Element).innerHTML.includes(marker)) {
            const m =
              `Выражения не поддерживаются внутри \`${tag}\` ` +
              `элементов. См. https://metafor.dev/msg/expression-in-${tag} для получения дополнительной информации.`
            if (tag === "template") {
              throw new Error(m)
            } else issueWarning("", m)
          }
        }
        // TODO (justinfagnani): для попыток динамических имен тегов мы не
        // увеличиваем bindingIndex, и оно будет на 1 в элементе и на 2 после
        // него.
        if ((node as Element).hasAttributes()) {
          for (const name of (node as Element).getAttributeNames()) {
            if (name.endsWith(boundAttributeSuffix)) {
              const realName = attrNames[attrNameIndex++]
              const value = (node as Element).getAttribute(name)!
              const statics = value.split(marker)
              if (realName === "context" || realName === "core") {
                parts.push({
                  type: ATTRIBUTE_PART,
                  index: nodeIndex,
                  name: realName,
                  strings: statics,
                  ctor: PropertyPart,
                })
              } else {
                const m = /([.?@])?(.*)/.exec(realName!)!
                parts.push({
                  type: ATTRIBUTE_PART,
                  index: nodeIndex,
                  name: m[2]!,
                  strings: statics,
                  ctor:
                    m[1] === "."
                      ? PropertyPart
                      : m[1] === "?"
                      ? BooleanAttributePart
                      : m[1] === "@"
                      ? EventPart
                      : AttributePart,
                })
              }
              ;(node as Element).removeAttribute(name)
            } else if (name.startsWith(marker)) {
              // Не создаём ElementPart для meta-* элементов, чтобы не потреблять индекс значения
              const el = node as Element
              if (!el.localName.startsWith("meta-")) {
                parts.push({
                  type: ELEMENT_PART,
                  index: nodeIndex,
                })
              }
              el.removeAttribute(name)
            }
          }
        }
        // TODO (justinfagnani): сравните производительность регулярного выражения
        // с тестированием каждого из 3 имен необработанных текстовых элементов.
        if (rawTextElement.test((node as Element).tagName)) {
          // Для необработанных текстовых элементов нам нужно разбить их
          // текстовое содержимое на маркеры, создать Text узел для каждого
          // сегмента, и создать TemplatePart для каждого маркера.
          const strings = (node as Element).textContent!.split(marker)
          const lastIndex = strings.length - 1
          if (lastIndex > 0) {
            ;(node as Element).textContent = trustedTypes ? (trustedTypes.emptyScript as unknown as "") : ""
            // Генерируем новый Text узел для каждого литерального сегмента
            // Эти узлы также используются как маркеры для частей Child
            for (let i = 0; i < lastIndex; i++) {
              ;(node as Element).append(strings[i]!, createMarker())
              // Проходим мимо узла маркера, который мы только что добавили
              walker.nextNode()
              parts.push({ type: CHILD_PART, index: ++nodeIndex })
            }
            // Обратите внимание, что этот маркер добавляется после текущего
            // узла walker, поэтому он будет пройден в внешнем цикле (и
            // игнорируется), поэтому нам не нужно корректировать nodeIndex здесь
            ;(node as Element).append(strings[lastIndex]!, createMarker())
          }
        }
      } else if (node.nodeType === 8) {
        const data = (node as Comment).data
        // Пропускаем маркер прямо перед meta-* элементом, чтобы не сдвигать индексы values
        try {
          const ns = (node as Comment).nextSibling as Element | null
          if (ns && ns.nodeType === 1 && (ns as Element).localName?.startsWith("meta-")) {
            nodeIndex++
            continue
          }
        } catch {}
        if (data === markerMatch) {
          parts.push({ type: CHILD_PART, index: nodeIndex })
        } else {
          let i = -1
          while ((i = (node as Comment).data.indexOf(marker, i + 1)) !== -1) {
            // Узел комментария имеет маркер связывания внутри, создаем
            // неактивную часть
            // Связывание не будет работать, но последующие связывания будут
            parts.push({ type: COMMENT_PART, index: nodeIndex })
            // Переходим к концу совпадения
            i += marker.length - 1
          }
        }
      }
      nodeIndex++
    }

    if (isHtmlDebugEnabled()) {
      // Если на теге был дублирующий атрибут, то когда тег парсится в
      // элемент, атрибут дедуплицируется. Мы можем обнаружить это
      // несоответствие, если мы не точно потребили все имена атрибутов при
      // подготовке шаблона. Это работает, потому что `attrNames` строится
      // из строковых шаблонов шаблона и `attrNameIndex` приходит от обработки
      // результирующего DOM.
      if (attrNames.length !== attrNameIndex) {
        throw new Error(
          `Обнаружен дублирующий атрибут связывания. Это происходит, если ваш шаблон ` +
            `имеет дублирующие атрибуты на элементном теге. Например ` +
            `"<input ?disabled=\${true} ?disabled=\${false}>" содержит ` +
            `дублирующий атрибут "disabled". Ошибка была обнаружена в ` +
            `следующем шаблоне: \n` +
            "`" +
            strings.join("${...}") +
            "`"
        )
      }
    }

    // Мы могли бы установить walker.currentNode на другой узел здесь, чтобы
    // избежать утечки памяти, но каждый раз, когда мы подготавливаем шаблон,
    // мы сразу же его рендерим и переиспользуем walker в new TemplateInstance._clone().
    debugLogEvent &&
      debugLogEvent({
        kind: "template prep",
        template: this,
        clonableTemplate: this.el,
        parts: this.parts,
        strings,
      })
  }

  // Переопределяется через `htmlPolyfillSupport` для поддержки платформы.
  /** @nocollapse */
  static createElement(html: TrustedHTML, _options?: RenderOptions) {
    const el = d.createElement("template")
    el.innerHTML = html as unknown as string
    return el
  }
}

function resolveDirective(
  part: ChildPart | AttributePart | ElementPart,
  value: unknown,
  parent: DirectiveParent = part,
  attributeIndex?: number
): unknown {
  // Ранняя отмена, если значение явно noChange. Обратите внимание, это
  // означает, что любая вложенная директива все еще прикреплена и не запускается.
  if (value === noChange) {
    return value
  }
  let currentDirective =
    attributeIndex !== undefined
      ? (parent as AttributePart).__directives?.[attributeIndex]
      : (parent as ChildPart | ElementPart | Directive).__directive
  const nextDirectiveConstructor = isPrimitive(value) ? undefined : (value as DirectiveResult)["_$htmlDirective$"]
  if (currentDirective?.constructor !== nextDirectiveConstructor) {
    currentDirective?.["_$notifyDirectiveConnectionChanged"]?.(false)
    if (nextDirectiveConstructor === undefined) {
      currentDirective = undefined
    } else {
      currentDirective = new nextDirectiveConstructor(part as PartInfo) as Directive
      currentDirective._$initialize(part, parent, attributeIndex)
    }
    if (attributeIndex !== undefined) {
      ;((parent as AttributePart).__directives ??= [])[attributeIndex] = currentDirective
    } else {
      ;(parent as any).__directive = currentDirective
    }
  }
  if (currentDirective !== undefined) {
    value = resolveDirective(
      part,
      currentDirective._$resolve(part, (value as DirectiveResult).values),
      currentDirective,
      attributeIndex
    )
  }
  return value
}

export type { TemplateInstance }

/**
 * Обновляемый экземпляр шаблона. Хранит ссылки на части, используемые для
 * обновления экземпляра шаблона.
 */
class TemplateInstance implements Disconnectable {
  _$template: Template
  _$parts: Array<Part | undefined> = []

  /** @internal */
  _$parent: ChildPart
  /** @internal */
  _$disconnectableChildren?: Set<Disconnectable> = undefined

  constructor(template: Template, parent: ChildPart) {
    this._$template = template
    this._$parent = parent
  }

  // Вызывается родительским узлом ChildPart get parentNode
  get parentNode() {
    return this._$parent.parentNode
  }

  // См. комментарий в интерфейсе Disconnectable для объяснения, почему это геттер
  get _$isConnected() {
    return this._$parent._$isConnected
  }

  // Этот метод отделен от конструктора, потому что нам нужно вернуть
  // DocumentFragment, и мы не хотим держать его с экземпляром поля.
  _clone(options: RenderOptions | undefined) {
    const {
      el: { content },
      parts: parts,
    } = this._$template
    const fragment = (options?.creationScope ?? d).importNode(content, true)
    walker.currentNode = fragment

    let node = walker.nextNode()!
    let nodeIndex = 0
    let partIndex = 0
    let templatePart = parts[0]

    while (templatePart !== undefined) {
      if (nodeIndex === templatePart.index) {
        let part: Part | undefined
        if (templatePart.type === CHILD_PART) {
          part = new ChildPart(node as HTMLElement, node.nextSibling, this, options)
        } else if (templatePart.type === ATTRIBUTE_PART) {
          part = new templatePart.ctor(node as HTMLElement, templatePart.name, templatePart.strings, this, options)
        } else if (templatePart.type === ELEMENT_PART) {
          part = new ElementPart(node as HTMLElement, this, options)
        }
        this._$parts.push(part)
        templatePart = parts[++partIndex]
      }
      if (nodeIndex !== templatePart?.index) {
        node = walker.nextNode()!
        nodeIndex++
      }
    }
    // Нам нужно установить currentNode откуда-нибудь, чтобы избежать утечки
    // дерева, даже если дерево отсоединено и должно быть освобождено.
    walker.currentNode = d
    return fragment
  }

  _update(values: Array<unknown>) {
    let i = 0
    for (const part of this._$parts) {
      if (part !== undefined) {
        debugLogEvent &&
          debugLogEvent({
            kind: "set part",
            part,
            value: values[i],
            valueIndex: i,
            values,
            templateInstance: this,
          })
        if ((part as AttributePart).strings !== undefined) {
          ;(part as AttributePart)._$setValue(values, part as AttributePart, i)
          // Количество значений, которые потребляет часть, равно
          // part.strings.length - 1, так как значения находятся между
          // промежутками шаблона. Мы увеличиваем i на 1 позже в цикле,
          // поэтому увеличиваем его на part.strings.length - 2 здесь
          i += (part as AttributePart).strings!.length - 2
        } else {
          part._$setValue(values[i])
        }
      }
      i++
    }
  }
}

/* Части */
/**
 * TemplatePart представляет динамическую часть в шаблоне, перед его
 * инстанцированием. Когда шаблон инстанцируется, части создаются из
 * TemplateParts.
 */
export type { ChildPart }

class ChildPart implements Disconnectable {
  readonly type = CHILD_PART
  readonly options: RenderOptions | undefined
  _$committedValue: unknown = nothing
  /** @internal */
  __directive?: Directive
  /** @internal */
  _$startNode: ChildNode
  /** @internal */
  _$endNode: ChildNode | null
  private _textSanitizer: ValueSanitizer | undefined
  /** @internal */
  _$parent: Disconnectable | undefined
  /**
   * Состояние подключения для RootParts только (т.е. ChildPart без
   * _$parent, возвращаемого из верхнеуровневого `render`). Это поле
   * используется в противном случае. Намерение стало бы яснее, если бы мы
   * сделали `RootPart` подклассом `ChildPart` с этим полем (и
   * другой _$isConnected getter), но подкласс вызывал проблемы с производительностью,
   * возможно, из-за того, что вызовы сайтов стали полиморфными.
   * @internal
   */
  __isConnected: boolean

  // См. комментарий в интерфейсе Disconnectable для объяснения, почему это
  // геттер
  get _$isConnected() {
    // ChildParts, которые не находятся в корне, всегда создаются с родителем;
    // только RootChildNode's нет, поэтому они возвращают локальное состояние
    // isConnected
    return this._$parent?._$isConnected ?? this.__isConnected
  }

  // Следующие поля будут добавлены на ChildParts по требованию AsyncDirective
  /** @internal */
  _$disconnectableChildren?: Set<Disconnectable> = undefined

  /** @internal */
  _$notifyConnectionChanged?(isConnected: boolean, removeFromParent?: boolean, from?: number): void

  /** @internal */
  _$reparentDisconnectables?(parent: Disconnectable): void

  constructor(
    startNode: ChildNode,
    endNode: ChildNode | null,
    parent: TemplateInstance | ChildPart | undefined,
    options: RenderOptions | undefined
  ) {
    this._$startNode = startNode
    this._$endNode = endNode
    this._$parent = parent
    this.options = options
    // Обратите внимание, что __isConnected доступен только на RootParts (т.е.
    // когда _$parent отсутствует); значение на некорневой части равно "не
    // важно", но проверка на родителя была бы больше кода
    this.__isConnected = options?.isConnected ?? true
    if (ENABLE_EXTRA_SECURITY_HOOKS) {
      // Явно инициализируем для согласованной формы класса.
      this._textSanitizer = undefined
    }
  }

  /**
   * Родительский узел, в который часть рендерит свой контент.
   *
   * Содержимое ChildPart состоит из диапазона смежных дочерних узлов
   * `.parentNode`, возможно, ограниченных 'маркерными узлами' (`.startNode`
   * и `.endNode`).
   *
   * - Если и `.startNode`, и `.endNode` не равны null, то содержимое
   * части состоит из всех братьев между `.startNode` и `.endNode`,
   * исключая.
   *
   * - Если `.startNode` не равен null, но `.endNode` равен null, то
   * содержимое части состоит из всех братьев, следующих за `.startNode`,
   * до и включая последнего ребенка `.parentNode`. Если `.endNode` не
   * равен null, то `.startNode` всегда будет не равен null.
   *
   * - Если и `.endNode`, и `.startNode` равны null, то содержимое
   * части состоит из всех дочерних узлов `.parentNode`.
   */
  get parentNode(): Node {
    let parentNode: Node = wrap(this._$startNode).parentNode!
    const parent = this._$parent
    if (parent !== undefined && parentNode?.nodeType === 11 /* Node.DOCUMENT_FRAGMENT */) {
      // Если parentNode является DocumentFragment, это может быть потому,
      // что DOM все еще находится в клонированном фрагменте во время
      // начального рендеринга; если так, получаем реального parentNode,
      // который часть будет закоммичена в.
      parentNode = (parent as ChildPart | TemplateInstance).parentNode
    }
    return parentNode
  }

  /**
   * Начальный маркерный узел ChildPart, если таковой имеется. См.
   * `.parentNode` для получения дополнительной информации.
   */
  get startNode(): Node | null {
    return this._$startNode
  }

  /**
   * Конечный маркерный узел ChildPart, если таковой имеется. См.
   * `.parentNode` для получения дополнительной информации.
   */
  get endNode(): Node | null {
    return this._$endNode
  }

  _$setValue(value: unknown, directiveParent: DirectiveParent = this): void {
    if (isHtmlDebugEnabled() && this.parentNode === null) {
      throw new Error(
        `Этот \`ChildPart\` не имеет \`parentNode\` и поэтому не может принять значение. Это, вероятно, означает, что элемент, содержащий часть, был изменен неподдерживаемым способом вне контроля Lit, что привело к тому, что маркерные узлы части были выброшены из DOM. Например, установка \`innerHTML\` или \`textContent\` может сделать это.`
      )
    }
    value = resolveDirective(this, value, directiveParent)
    if (isPrimitive(value)) {
      // Нерендеримые значения дочерних частей. Важно, чтобы эти не
      // рендерили пустые текстовые узлы, чтобы избежать проблем с
      // предотвращением стандартного содержимого `<slot>` fallback.
      if (value === nothing || value == null || value === "") {
        if (this._$committedValue !== nothing) {
          debugLogEvent &&
            debugLogEvent({
              kind: "commit nothing to child",
              start: this._$startNode,
              end: this._$endNode,
              parent: this._$parent,
              options: this.options,
            })
          this._$clear()
        }
        this._$committedValue = nothing
      } else if (value !== this._$committedValue && value !== noChange) {
        this._commitText(value)
      }
    } else if ((value as TemplateResult)["_$htmlType$"] !== undefined) {
      this._commitTemplateResult(value as TemplateResult)
    } else if ((value as Node).nodeType !== undefined) {
      if (isHtmlDebugEnabled() && this.options?.host === value) {
        this._commitText(
          `[probable mistake: rendered a template's host in itself ` +
            `(commonly caused by writing \${this} in a template]`
        )
        console.warn(
          `Попытка отрендерить хост шаблона`,
          value,
          `внутри себя. Это почти всегда ошибка, и в режиме разработки `,
          `мы рендерим некоторый предупреждающий текст. В продакшене `,
          `мы его рендерим, что обычно приводит к ошибке, и иногда `,
          `к элементу исчезает из DOM.`
        )
        return
      }
      this._commitNode(value as Node)
    } else if (isIterable(value)) {
      this._commitIterable(value)
    } else {
      // Fallback, будет рендерить строковое представление
      this._commitText(value)
    }
  }

  private _insert<T extends Node>(node: T) {
    return wrap(wrap(this._$startNode).parentNode!).insertBefore(node, this._$endNode)
  }

  private _commitNode(value: Node): void {
    if (this._$committedValue !== value) {
      this._$clear()
      if (ENABLE_EXTRA_SECURITY_HOOKS && sanitizerFactoryInternal !== noopSanitizer) {
        const parentNodeName = this._$startNode.parentNode?.nodeName
        if (parentNodeName === "STYLE" || parentNodeName === "SCRIPT") {
          let message = "Запрещено"
          if (isHtmlDebugEnabled()) {
            if (parentNodeName === "STYLE") {
              message =
                `@metafor/html не поддерживает связывание внутри узлов стиля. ` +
                `Это представляет собой угрозу безопасности, так как инъекция
                стилей может ` +
                `экстрагировать данные и подделывать интерфейсы. ` +
                `Рассмотрите вместо этого использование литералов css\`...\` ` +
                `для составления стилей, и динамическое стилирование с ` +
                `пользовательскими свойствами CSS, ::parts, <slot>s, ` +
                `и путем мутации DOM, а не стилеток.`
            } else {
              message =
                `@metafor/html не поддерживает связывание внутри узлов скрипта. ` +
                `Это представляет собой угрозу безопасности, так как оно могло
                позволить выполнение произвольного кода.`
            }
          }
          throw new Error(message)
        }
      }
      debugLogEvent &&
        debugLogEvent({
          kind: "commit node",
          start: this._$startNode,
          parent: this._$parent,
          value: value,
          options: this.options,
        })
      this._$committedValue = this._insert(value)
    }
  }

  private _commitText(value: unknown): void {
    // Если закоммиченное значение является примитивом, это означает, что
    // мы вызвали _commitText на предыдущем рендере, и мы знаем, что
    // this._$startNode.nextSibling является текстовым узлом. Мы можем
    // теперь просто заменить содержимое узла (.data).
    if (this._$committedValue !== nothing && isPrimitive(this._$committedValue)) {
      const node = wrap(this._$startNode).nextSibling as Text
      if (ENABLE_EXTRA_SECURITY_HOOKS) {
        if (this._textSanitizer === undefined) {
          this._textSanitizer = createSanitizer(node, "data", "property")
        }
        value = this._textSanitizer(value)
      }
      debugLogEvent &&
        debugLogEvent({
          kind: "commit text",
          node,
          value,
          options: this.options,
        })
      ;(node as Text).data = value as string
    } else {
      if (ENABLE_EXTRA_SECURITY_HOOKS) {
        const textNode = d.createTextNode("")
        this._commitNode(textNode)
        // При установке текстового содержимого важно, что родитель
        // важен. Например, <style> и <script> требуют особой осторожности,
        // в то время как <span> нет. Поэтому сначала нам нужно поместить
        // текстовый узел в документ, а затем мы можем очистить его содержимое.
        if (this._textSanitizer === undefined) {
          this._textSanitizer = createSanitizer(textNode, "data", "property")
        }
        value = this._textSanitizer(value)
        debugLogEvent &&
          debugLogEvent({
            kind: "commit text",
            node: textNode,
            value,
            options: this.options,
          })
        textNode.data = value as string
      } else {
        this._commitNode(d.createTextNode(value as string))
        debugLogEvent &&
          debugLogEvent({
            kind: "commit text",
            node: wrap(this._$startNode).nextSibling as Text,
            value,
            options: this.options,
          })
      }
    }
    this._$committedValue = value
  }

  private _commitTemplateResult(result: TemplateResult | CompiledTemplateResult): void {
    // Это свойство должно оставаться неминифицированным.
    const { values, ["_$htmlType$"]: type } = result
    // Если $htmlType$ является числом, result является простым TemplateResult,
    // и мы получаем шаблон из кэша шаблонов. Если нет, result является
    // CompiledTemplateResult, _$htmlType$ является CompiledTemplate, и нам
    // нужно создать элемент <template>, который мы впервые видим.
    const template: Template | CompiledTemplate =
      typeof type === "number"
        ? this._$getTemplate(result as UncompiledTemplateResult)
        : (type.el === undefined &&
            (type.el = Template.createElement(trustFromTemplateString(type.h, type.h[0]!), this.options)),
          type)

    if ((this._$committedValue as TemplateInstance)?._$template === template) {
      debugLogEvent &&
        debugLogEvent({
          kind: "template updating",
          template,
          instance: this._$committedValue as TemplateInstance,
          parts: (this._$committedValue as TemplateInstance)._$parts,
          options: this.options,
          values,
        })
      ;(this._$committedValue as TemplateInstance)._update(values)
    } else {
      const instance = new TemplateInstance(template as Template, this)
      const fragment = instance._clone(this.options)
      debugLogEvent &&
        debugLogEvent({
          kind: "template instantiated",
          template,
          instance,
          parts: instance._$parts,
          options: this.options,
          fragment,
          values,
        })
      instance._update(values)
      debugLogEvent &&
        debugLogEvent({
          kind: "template instantiated and updated",
          template,
          instance,
          parts: instance._$parts,
          options: this.options,
          fragment,
          values,
        })
      this._commitNode(fragment)
      this._$committedValue = instance
    }
  }

  // Переопределяется через `htmlPolyfillSupport` для поддержки платформы.
  /** @internal */
  _$getTemplate(result: UncompiledTemplateResult) {
    let template = templateCache.get(result.strings)
    if (template === undefined) {
      templateCache.set(result.strings, (template = new Template(result)))
    }
    return template
  }

  private _commitIterable(value: Iterable<unknown>): void {
    // Для Iterable мы создаем новый InstancePart для каждого элемента, затем
    // устанавливаем его значение на элемент. Это немного избыточно для
    // каждого элемента в Iterable, но это позволяет нам легко и эффективно
    // обновлять массивы TemplateResults, которые будут часто возвращаться
    // из выражений, таких как: array.map((i) => html`${i}`), путем
    // повторного использования существующих TemplateInstances.

    // Если value является массивом, то предыдущий рендер был iterable,
    // и value будет содержать ChildParts из предыдущего рендера. Если value
    // не является массивом, очищаем эту часть и создаем новый массив для
    // ChildParts.
    if (!isArray(this._$committedValue)) {
      this._$committedValue = []
      this._$clear()
    }

    // Позволяет нам отслеживать, сколько элементов мы оттискали, чтобы
    // очистить лишние элементы из предыдущего рендера
    const itemParts = this._$committedValue as ChildPart[]
    let partIndex = 0
    let itemPart: ChildPart | undefined

    for (const item of value) {
      if (partIndex === itemParts.length) {
        // Если нет существующей части, создаем новую
        // TODO (justinfagnani): протестируйте влияние на производительность
        // всегда создания двух частей вместо совместного использования частей
        // между узлами
        itemParts.push(
          (itemPart = new ChildPart(this._insert(createMarker()), this._insert(createMarker()), this, this.options))
        )
      } else {
        // Переиспользуем существующую часть
        itemPart = itemParts[partIndex]
      }
      itemPart!._$setValue(item)
      partIndex++
    }

    if (partIndex < itemParts.length) {
      // itemParts всегда имеют endNodes
      this._$clear(itemPart && wrap(itemPart._$endNode!).nextSibling, partIndex)
      // Усекаем массив частей, чтобы _value отражал текущее состояние
      itemParts.length = partIndex
    }
  }

  /**
   * Удаляет узлы, содержащиеся в этой части из DOM.
   *
   * @param start Начальный узел для очистки от, для очистки подмножества
   *     DOM этой части (используется при усечении итераций)
   * @param from Когда `start` указан, индекс в итерируемом элементе, из
   *     которого удаляются ChildParts, используется для отсоединения
   *     директив в этих частях.
   *
   * @internal
   */
  _$clear(start: ChildNode | null = wrap(this._$startNode).nextSibling, from?: number) {
    this._$notifyConnectionChanged?.(false, true, from)
    while (start !== this._$endNode) {
      // Неравенство нулевого утверждения безопасно, потому что если
      // _$startNode.nextSibling равен null, то _$endNode также равен null,
      // и мы бы не ввели этот цикл.
      const n = wrap(start!).nextSibling
      wrap(start!).remove()
      start = n
    }
  }

  /**
   * Реализация RootPart's `isConnected`. Обратите внимание, что этот метод
   * должен вызываться только на `RootPart`s (часть `ChildPart`, возвращаемая
   * из вызова `render()` на верхнем уровне). Он не действует на некорневые
   * ChildParts.
   * @param isConnected Устанавливает ли
   * @internal
   */
  setConnected(isConnected: boolean) {
    if (this._$parent === undefined) {
      this.__isConnected = isConnected
      this._$notifyConnectionChanged?.(isConnected)
    } else if (isHtmlDebugEnabled()) {
      throw new Error("part.setConnected() может быть вызван только на RootPart, возвращаемом из render().")
    }
  }
}

export class AttributePart implements Disconnectable {
  readonly type: typeof ATTRIBUTE_PART | typeof PROPERTY_PART | typeof BOOLEAN_ATTRIBUTE_PART | typeof EVENT_PART =
    ATTRIBUTE_PART
  readonly element: HTMLElement
  readonly name: string
  readonly options: RenderOptions | undefined

  /**
   * Если этот атрибутный часть представляет интерполяцию, это содержит
   * статические строки интерполяции. Для однозначных связываний это
   * undefined.
   */
  readonly strings?: ReadonlyArray<string>
  /** @internal */
  _$committedValue: unknown | Array<unknown> = nothing
  /** @internal */
  __directives?: Array<Directive | undefined>
  /** @internal */
  _$parent: Disconnectable
  /** @internal */
  _$disconnectableChildren?: Set<Disconnectable> = undefined

  protected _sanitizer: ValueSanitizer | undefined

  get tagName() {
    return this.element.tagName
  }

  // См. комментарий в интерфейсе Disconnectable для объяснения, почему это геттер
  get _$isConnected() {
    return this._$parent._$isConnected
  }

  constructor(
    element: HTMLElement,
    name: string,
    strings: ReadonlyArray<string>,
    parent: Disconnectable,
    options: RenderOptions | undefined
  ) {
    this.element = element
    this.name = name
    this._$parent = parent
    this.options = options
    if (strings.length > 2 || strings[0] !== "" || strings[1] !== "") {
      this._$committedValue = new Array(strings.length - 1).fill(new String())
      this.strings = strings
    } else {
      this._$committedValue = nothing
    }
    if (ENABLE_EXTRA_SECURITY_HOOKS) {
      this._sanitizer = undefined
    }
  }

  /**
   * Устанавливает значение этой части, разрешая значение из возможных
   * значений и статических строк и коммитит его в DOM.
   * Если эта часть однозначная, `this._strings` будет undefined, и метод
   * будет вызываться с одним значением аргументом. Если эта часть
   * многозначная, метод вызывается с массивом значений части, и
   * смещением в массив значений, с которого должны читаться значения.
   * Этот метод перегружен таким образом, чтобы избежать временных срезов
   * значений экземпляра шаблона в массиве, и позволить быстрому пути для
   * однозначных частей.
   *
   * @param value Значение части, или массив значений для многозначных частей
   * @param valueIndex индекс для чтения значений. `undefined` для
   *   однозначных частей
   * @param noCommit вызывает часть, чтобы она не коммитила свое значение в DOM.
   *   Используется в гидратации для первоначального значения атрибута,
   *   но не устанавливает атрибут, и в SSR для отключения операции DOM и
   *   захвата значения для сериализации.
   *
   * @internal
   */
  _$setValue(
    value: unknown | Array<unknown>,
    directiveParent: DirectiveParent = this,
    valueIndex?: number,
    noCommit?: boolean
  ) {
    const strings = this.strings

    // Указывает, изменилось ли какое-либо значение, для проверки грязных
    let change = false

    if (strings === undefined) {
      // Случай однозначного связывания
      value = resolveDirective(this, value, directiveParent, 0)
      change = !isPrimitive(value) || (value !== this._$committedValue && value !== noChange)
      if (change) {
        this._$committedValue = value
      }
    } else {
      // Случай интерполяции
      const values = value as Array<unknown>
      value = strings[0]

      let i, v
      for (i = 0; i < strings.length - 1; i++) {
        v = resolveDirective(this, values[valueIndex! + i], directiveParent, i)

        if (v === noChange) {
          // Если предоставленное пользователем значение равно `noChange`, используем предыдущее значение
          v = (this._$committedValue as Array<unknown>)[i]
        }
        change ||= !isPrimitive(v) || v !== (this._$committedValue as Array<unknown>)[i]
        if (v === nothing) {
          value = nothing
        } else if (value !== nothing) {
          value += (v ?? "") + strings[i + 1]!
        }
        // Мы всегда записываем каждое значение, даже если одно из них равно `nothing`, для будущей проверки изменений.
        ;(this._$committedValue as Array<unknown>)[i] = v
      }
    }
    if (change && !noCommit) {
      this._commitValue(value)
    }
  }

  /** @internal */
  _commitValue(value: unknown) {
    if (value === nothing) {
      ;(wrap(this.element) as Element).removeAttribute(this.name)
    } else {
      if (ENABLE_EXTRA_SECURITY_HOOKS) {
        if (this._sanitizer === undefined) {
          this._sanitizer = sanitizerFactoryInternal(this.element, this.name, "attribute")
        }
        value = this._sanitizer(value ?? "")
      }
      debugLogEvent &&
        debugLogEvent({
          kind: "commit attribute",
          element: this.element,
          name: this.name,
          value,
          options: this.options,
        })
      ;(wrap(this.element) as Element).setAttribute(this.name, (value ?? "") as string)
    }
  }
}

export type { PropertyPart }

class PropertyPart extends AttributePart {
  override readonly type = PROPERTY_PART

  /** @internal */
  override _commitValue(value: unknown) {
    if (ENABLE_EXTRA_SECURITY_HOOKS) {
      if (this._sanitizer === undefined) this._sanitizer = sanitizerFactoryInternal(this.element, this.name, "property")
      value = this._sanitizer(value)
    }
    debugLogEvent &&
      debugLogEvent({
        kind: "commit property",
        element: this.element,
        name: this.name,
        value,
        options: this.options,
      })
    if (this.name === "context" && value) {
      try {
        ;(this.element as ActorInternal).update(value)
      } catch (e) {
        const tag = this.element.tagName.toLowerCase()
        throw new Error(`meta-компонент ${tag} не создан`)
      }
    } else if (this.name === "core" && value) {
      ;(this.element as ActorInternal).__updCore(value)
    } else;
    ;(this.element as any)[this.name] = value === nothing ? undefined : value
  }
}

export type { BooleanAttributePart }

class BooleanAttributePart extends AttributePart {
  override readonly type = BOOLEAN_ATTRIBUTE_PART

  /** @internal */
  override _commitValue(value: unknown) {
    debugLogEvent &&
      debugLogEvent({
        kind: "commit boolean attribute",
        element: this.element,
        name: this.name,
        value: !!(value && value !== nothing),
        options: this.options,
      })
    ;(wrap(this.element) as Element).toggleAttribute(this.name, !!value && value !== nothing)
  }
}

/**
 * Атрибутный часть, который управляет слушателем события через add/removeEventListener.
 *
 * Эта часть работает, добавляя себя в качестве слушателя события на элемент,
 * а затем делегируя значение, переданное ей. Это уменьшает количество вызовов
 * add/removeEventListener, если слушатель часто меняется, например, когда
 * используется встроенная функция в качестве слушателя.
 *
 * Поскольку опции слушателя передаются при добавлении слушателей, мы должны
 * быть осторожны, чтобы добавлять и удалять часть как слушателя, когда
 * опции слушателя меняются.
 */
export type { EventPart }

class EventPart extends AttributePart {
  override readonly type = EVENT_PART

  constructor(
    element: HTMLElement,
    name: string,
    strings: ReadonlyArray<string>,
    parent: Disconnectable,
    options: RenderOptions | undefined
  ) {
    super(element, name, strings, parent, options)

    if (isHtmlDebugEnabled() && this.strings !== undefined) {
      throw new Error(
        `У \`<${element.localName}>\` есть \`@${name}=...\` слушатель с ` +
          "недопустимым содержимым. Слушатели событий в шаблонах должны иметь " +
          "точно одно выражение и не должно быть окружающего текста."
      )
    }
  }

  // EventPart не использует базовую реализацию _$setValue/_resolveValue,
  // так как проверка грязных значений более сложная
  /** @internal */
  override _$setValue(newListener: unknown, directiveParent: DirectiveParent = this) {
    newListener = resolveDirective(this, newListener, directiveParent, 0) ?? nothing
    if (newListener === noChange) {
      return
    }
    const oldListener = this._$committedValue

    // Если новое значение равно `nothing` или изменились какие-либо опции,
    // нам нужно удалить часть как слушателя.
    const shouldRemoveListener =
      (newListener === nothing && oldListener !== nothing) ||
      (newListener as EventListenerWithOptions).capture !== (oldListener as EventListenerWithOptions).capture ||
      (newListener as EventListenerWithOptions).once !== (oldListener as EventListenerWithOptions).once ||
      (newListener as EventListenerWithOptions).passive !== (oldListener as EventListenerWithOptions).passive

    // Если новое значение не равно `nothing`, и мы удалили слушателя, нам
    // нужно добавить часть как слушателя.
    const shouldAddListener = newListener !== nothing && (oldListener === nothing || shouldRemoveListener)

    debugLogEvent &&
      debugLogEvent({
        kind: "commit event listener",
        element: this.element,
        name: this.name,
        value: newListener,
        options: this.options,
        removeListener: shouldRemoveListener,
        addListener: shouldAddListener,
        oldListener,
      })
    if (shouldRemoveListener) {
      this.element.removeEventListener(this.name, this, oldListener as EventListenerWithOptions)
    }
    if (shouldAddListener) {
      this.element.addEventListener(this.name, this, newListener as EventListenerWithOptions)
    }
    this._$committedValue = newListener
  }

  handleEvent(event: Event) {
    if (typeof this._$committedValue === "function") {
      this._$committedValue.call(this.options?.host ?? this.element, event)
    } else {
      ;(this._$committedValue as EventListenerObject).handleEvent(event)
    }
  }
}

export type { ElementPart }

class ElementPart implements Disconnectable {
  readonly type = ELEMENT_PART

  /** @internal */
  __directive?: Directive

  // Это для того, чтобы каждая часть имела _$committedValue
  _$committedValue: undefined

  /** @internal */
  _$parent!: Disconnectable

  /** @internal */
  _$disconnectableChildren?: Set<Disconnectable> = undefined

  options: RenderOptions | undefined

  constructor(public element: Element, parent: Disconnectable, options: RenderOptions | undefined) {
    this._$parent = parent
    this.options = options
  }

  // См. комментарий в интерфейсе Disconnectable для объяснения, почему это геттер
  get _$isConnected() {
    return this._$parent._$isConnected
  }

  _$setValue(value: unknown): void {
    debugLogEvent &&
      debugLogEvent({
        kind: "commit to element binding",
        element: this.element,
        value,
        options: this.options,
      })
    resolveDirective(this, value)
  }
}

/**
 * ЭТОТ ОБЪЕКТ НЕ ДОЛЖЕН ЛИЧАТЬСЯ ПОЛЬЗОВАТЕЛЯМИ.
 *
 * Приватные экспорты для использования другими пакетами, не предназначенными
 * для использования пользователями.
 *
 * Мы сейчас не делаем склеивание сборки html-ssr. Чтобы сохранить несколько
 * (в противном случае приватных) верхнеуровневых экспортов, которые
 * замаскированы в клиентском коде, мы экспортируем объект _$LH, содержащий
 * эти члены (или вспомогательные методы для доступа к приватным полям этих
 * членов), и затем переэкспортируем их для использования в html-ssr. Это
 * делает html-ssr независимо от того, используется ли клиентский код в режиме
 * `dev` или `prod`.
 *
 * Это имеет уникальное имя, чтобы дистанцировать его от приватных экспортов
 * в html-element, которые переэкспортируют все html.
 *
 * @private
 */
export const _$LH = {
  // Используется в html-ssr
  _boundAttributeSuffix: boundAttributeSuffix,
  _marker: marker,
  _markerMatch: markerMatch,
  _HTML_RESULT: HTML_RESULT,
  _getTemplateHtml: getTemplateHtml,
  // Используется в тестах и private-ssr-support
  _TemplateInstance: TemplateInstance,
  _isIterable: isIterable,
  _resolveDirective: resolveDirective,
  _ChildPart: ChildPart,
  _AttributePart: AttributePart,
  _BooleanAttributePart: BooleanAttributePart,
  _EventPart: EventPart,
  _PropertyPart: PropertyPart,
  _ElementPart: ElementPart,
}

// Применяем полифилы, если они доступны
const polyfillSupport = getHtmlPolyfillSupport()
if (polyfillSupport) {
  polyfillSupport(Template, ChildPart)
}

/**
 * Рендерит значение, обычно TemplateResult, в контейнер.
 *
 * Этот пример рендерит текст "Hello, zavx0z!" внутри тега параграфа, добавляя
 * его в контейнер `document.body`.
 *
 * ```js
 * import {html, render} from 'html';
 *
 * const name = "zavx0z";
 * render(html`<p>Hello, ${name}!</p>`, document.body);
 * ```
 *
 * @param value Любое рендеримое значение обычно TemplateResult,
 *   созданный путем оценки тега шаблона, такого как {@linkcode html} или {@linkcode svg}.
 * @param container DOM-контейнер для рендеринга. Первый рендер будет
 *   добавлять отрендеренное значение в контейнер, и последующие рендеры
 *   будут эффективно обновлять отрендеренное значение, если тот же тип
 *   результата был ранее отрендерен в этом месте.
 * @param options См. {@linkcode RenderOptions} для документации по опциям.
 */
export const render = (
  value: unknown,
  container: HTMLElement | DocumentFragment,
  options?: RenderOptions
): RootPart => {
  if (isHtmlDebugEnabled() && container == null) {
    // Даем более понятное сообщение об ошибке, чем
    // Uncaught TypeError: Cannot read properties of null (reading '_$htmlPart$')
    // которое читается как внутренняя ошибка.
    throw new TypeError(`Контейнер для рендеринга не может быть ${container}`)
  }
  const renderId = isHtmlDebugEnabled() ? debugLogRenderId++ : 0
  const partOwnerNode = options?.renderBefore ?? container
  let part: ChildPart = (partOwnerNode as any)["_$htmlPart$"]

  debugLogEvent && debugLogEvent({ kind: "begin render", id: renderId, value, container, options, part })

  if (part === undefined) {
    const endNode = options?.renderBefore ?? null
    ;(partOwnerNode as any)["_$htmlPart$"] = part = new ChildPart(
      container.insertBefore(createMarker(), endNode),
      endNode,
      undefined,
      options ?? {}
    )
  }
  part._$setValue(value)
  debugLogEvent && debugLogEvent({ kind: "end render", id: renderId, value, container, options, part })
  return part as RootPart
}

if (ENABLE_EXTRA_SECURITY_HOOKS) {
  render.setSanitizer = setSanitizer
  render.createSanitizer = createSanitizer
  if (isHtmlDebugEnabled())
    render._testOnlyClearSanitizerFactoryDoNotCallOrElse = _testOnlyClearSanitizerFactoryDoNotCallOrElse
}
