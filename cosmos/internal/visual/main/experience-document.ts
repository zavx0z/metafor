import {
  createDocument,
  type Document,
  type HTMLDivElement,
  type HTMLElement,
  type Node,
} from "@zavx0z/dom"

export type MainExperienceDocument = Readonly<{
  document: Document
  root: HTMLElement
  surface: HTMLDivElement
  mountOverlay(node: Node): void
}>

/** Creates the one semantic Document shared by the main plane and HUD overlay. */
export function createMainExperienceDocument(): MainExperienceDocument {
  const document = createDocument()
  const root = document.createElement("main")
  const surface = document.createElement("div")
  root.id = "main-experience"
  root.appendChild(surface)
  document.appendChild(root)

  return Object.freeze({
    document,
    root,
    surface,
    mountOverlay(node) {
      if (node.ownerDocument !== document) {
        throw new Error("Visual Experience overlay root belongs to another Document")
      }
      root.appendChild(node)
    },
  })
}
