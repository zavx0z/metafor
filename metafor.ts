/**
 * Загружает схему Meta по hub-адресу.
 *
 * Хаб — это каноническая адресация meta-сущности вида `owner/path`,
 * которая резолвится в `owner/path/meta.json`.
 *
 * @param src Hub-адрес вида `owner/path`
 * @returns Распарсенная схема или undefined при ошибке
 */
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
  private src: string | null = null

  constructor() {
    super()
  }

  async initializeAtom() {
    if (!this.src) {
      console.error(`src не определен`)
      return
    }

    const schema = await load(this.src)
    // TODO: Инициализация атома после подключения @metafor/atom
    console.log("Schema loaded:", schema)
  }

  async connectedCallback() {
    this.src = this.getAttribute("src")
    // TODO: Подключить threadLog после подключения @metafor/inspect
    // const log = this.hasAttribute("log")
    // log && (await threadLog())

    this.initializeAtom()
  }
  disconnectedCallback() {
    // cleanup
  }
}

if (!customElements.get("meta-for")) customElements.define("meta-for", WebComponent)
