import { html as q_html, render } from "/html.js"

/**
 * Преобразует строку из camelCase в kebab-case
 * @param {string} str - Строка в формате camelCase
 * @return {string} Строка в формате kebab-case
 */
const camelToKebab = (str) => {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
}

/**
 * @template {import("../types/core.js").CoreObj} I
 * @template {import("../types/context.js").ContextDefinition} C
 * @template {string} S
 * @param {import("../types/view.js").ComponentParams<I, C, S>} params
 */
export default ({ view, atom }) => {
  const atomContextKeys = Object.keys(atom.context).map(camelToKebab)

  // Создаем карту соответствия между kebab-case и camelCase ключами
  /** @type {Record<string, string>} */
  const kebabToCamelMap = Object.keys(atom.context).reduce((map, key) => {
    map[camelToKebab(key)] = key
    return map
  }, /** @type {Record<string, string>} */ ({}))

  customElements.define(
    "metafor-" + atom.id,
    class extends HTMLElement {
      constructor() {
        super()
        if (view.isolated) {
          this.shadow = this.attachShadow({ mode: "open" })
        }
        view.style?.({
          css: (strings, ...values) => {
            const sheet = new CSSStyleSheet()
            const result = strings.reduce((acc, str, i) => acc + str + (values[i] || ""), "")
            sheet.replaceSync(result)
            if (this.shadow) {
              this.shadow.adoptedStyleSheets.push(sheet)
            } else {
              document.adoptedStyleSheets.push(sheet)
            }
            return sheet
          },
        })
      }

      connectedCallback() {
        const updateView = () => {
          const result = view.render({
            update: (context) => atom._updateExternal({ context, srcName: "component", funcName: "handler" }),
            context: atom.context,
            state: atom.state,
            core: atom.core,
            html: q_html,
          })
          render(result, this.shadow ?? this)
        }
        atom.component = this.shadow?.host ?? this

        atom.onUpdate(updateView)
        atom.onTransition(updateView) // TODO: оптимизировать обновление
        updateView()

        view.onMount?.({ component: /** @type {HTMLElement} */ (this.shadow?.host ?? this), core: atom.core })
      }

      disconnectedCallback() {
        view.onDestroy?.({ component: /** @type {HTMLElement} */ (this.shadow?.host ?? this), core: atom.core })
        // atom.destroy()
      }

      static get observedAttributes() {
        return atomContextKeys
      }
      /** @param {string} name @param {string} oldValue @param {string} newValue */
      attributeChangedCallback(name, oldValue, newValue) {
        // Преобразуем kebab-case обратно в camelCase для обновления контекста
        const camelCaseName = kebabToCamelMap[name]
        // console.log(JSON.stringify({
        //   name,
        //   camelCaseName,
        //   newValue,
        //   oldValue,
        //   atomContextKeys,
        // }, null, 2))
        if (camelCaseName) {
          const propType = atom.types[camelCaseName].type
          if (propType === "boolean") {
            // @ts-ignore - Принудительное приведение типа для boolean атрибута
            atom.update({ [camelCaseName]: newValue !== null })
          }
        }
      }
    }
  )
}
