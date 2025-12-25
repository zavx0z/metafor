import "@metafor/meta"
import { Atom } from "@metafor/atom"
import { threadLog } from "@metafor/inspect/web/logger"
import { meta } from "./nodes/nodes.js"
import { load } from "@metafor/virtual"

const destroyVirtual = await load({ src: "../virtual/dist/worker.js", debug: true })

class WebComponent extends HTMLElement {
  /** @type {Atom|null} */
  builder = null

  constructor() {
    super()
  }

  initializeAtom() {
    const src = this.getAttribute("src")
    this.builder = Atom.fromSchema({ meta, core: { child: [{ tag: "meta-for", type: "meta", string: { src } }] } })
  }

  async connectedCallback() {
    const log = this.hasAttribute("log")
    log && (await threadLog())

    this.initializeAtom()
  }
  disconnectedCallback() {
    destroyVirtual()
  }
}

if (!customElements.get("meta-for")) customElements.define("meta-for", WebComponent)
