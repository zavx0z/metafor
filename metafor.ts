import "@metafor/meta"
import { Atom } from "@metafor/atom"
import { threadLog } from "@metafor/inspect/web/logger"
// import { load } from "@metafor/virtual"
// const destroyVirtual = await load({ src: "./infra/virtual/dist/worker.js", debug: true })
await import("@metafor/inspect/web/debugger")

export async function load(src: string) {
  const [author, name] = src.split("/")
  if (!author || !name) {
    console.error(`src не соответствует формату "author/name"`)
    return
  }
  const data = await fetch(`/${src}/${name}.json`)
  const schema = await data.json()
  return schema
}

class WebComponent extends HTMLElement {
  builder: Atom | null = null

  constructor() {
    super()
  }

  async initializeAtom() {
    const src: string | null = this.getAttribute("src")
    if (!src) {
      console.error(`src не определен`)
      return
    }

    const schema = await load(src)
    this.builder = Atom.fromSchema({ meta: schema })
  }

  async connectedCallback() {
    const log = this.hasAttribute("log")
    log && (await threadLog())

    this.initializeAtom()
  }
  disconnectedCallback() {
    // destroyVirtual()
  }
}

if (!customElements.get("meta-for")) customElements.define("meta-for", WebComponent)
