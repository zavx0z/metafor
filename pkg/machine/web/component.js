import {html as q_html, render} from "../../html/html.js"
/**
 * @template {import("../types/core").CoreObj} I
 * @template {import("../types/context").ContextDefinition} C
 * @template {string} S
 * @param {import("../types/view").ComponentParams<I, C, S>} params
 */
export default ({view, atom}) => {
  customElements.define(
    atom.id,
    class extends HTMLElement {
      constructor() {
        super()
        if (view.isolated) {
          this.shadow = this.attachShadow({mode: "open"})
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
          }
        })
      }

      connectedCallback() {
        const updateView = () => {
          const result = view.render({
            update: context => atom._updateExternal({context, srcName: "component", funcName: "handler"}),
            context: atom.context,
            state: atom.state,
            core: atom.core,
            html: q_html
          })
          render(result, this.shadow ?? this)
        }
        atom.component = this.shadow?.host ?? this

        atom.onUpdate(updateView)
        atom.onCollapse(updateView) // TODO: оптимизировать обновление
        updateView()

        view.mount?.({component: /** @type {HTMLElement} */ (this.shadow?.host ?? this), core: atom.core})
      }

      disconnectedCallback() {
        view.unmount?.({component: /** @type {HTMLElement} */ (this.shadow?.host ?? this), core: atom.core})
        // atom.destroy()
      }
    }
  )
}
