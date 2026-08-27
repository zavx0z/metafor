import {
  CustomEvent,
  type Document,
  type HTMLButtonElement,
} from "@zavx0z/dom"
import type {StorybookDomStorySource} from "@zavx0z/storybook/stories"
import {STORYBOOK_DOM_WORKBENCH_EVENTS} from "@zavx0z/storybook/workbench"
import type {GraphDomStory} from "./dom-story.ts"

export type GraphOverviewItem = Readonly<{
  route: string
  label: string
  detail: string
}>

export type GraphOverviewInput = Readonly<{
  route: string
  title: string
  summary: string
  items: readonly GraphOverviewItem[]
}>

/** Creates a real overview presentation without mounting its first leaf. */
export function createGraphOverview(
  document: Document,
  input: GraphOverviewInput,
): GraphDomStory {
  const root = document.createElement("section")
  const heading = document.createElement("h2")
  const summary = document.createElement("p")
  const list = document.createElement("ul")
  const listeners: {button: HTMLButtonElement; listener(): void}[] = []
  root.className = "graph-overview"
  root.setAttribute("data-route", input.route)
  heading.className = "graph-overview__title"
  summary.className = "graph-overview__summary"
  list.className = "graph-overview__items"
  heading.append(input.title)
  summary.append(input.summary)

  for (const item of input.items) {
    const row = document.createElement("li")
    const button = document.createElement("button")
    const detail = document.createElement("span")
    row.className = "graph-overview__item"
    button.className = "graph-overview__link"
    button.setAttribute("type", "button")
    button.setAttribute("data-route", item.route)
    button.append(item.label)
    detail.className = "graph-overview__detail"
    detail.append(item.detail)
    const listener = (): void => {
      button.dispatchEvent(new CustomEvent(STORYBOOK_DOM_WORKBENCH_EVENTS.navigate, {
        bubbles: true,
        detail: Object.freeze({route: item.route}),
      }))
    }
    button.addEventListener("click", listener)
    listeners.push({button, listener})
    row.append(button, detail)
    list.appendChild(row)
  }
  root.append(heading, summary, list)

  const source: StorybookDomStorySource = Object.freeze({
    html: `<section class="graph-overview" data-route=${JSON.stringify(input.route)}>
  <h2>${input.title}</h2>
  <p>${input.summary}</p>
  <ul>${input.items.map((item) => `\n    <li><button data-route="${item.route}">${item.label}</button></li>`).join("")}\n  </ul>
</section>`,
    css: graphOverviewCss,
    typescript: [
      'import {createDocument} from "@zavx0z/dom"',
      "",
      "const document = createDocument()",
      'const overview = document.createElement("section")',
      `overview.setAttribute("data-route", ${JSON.stringify(input.route)})`,
      `const routes = ${JSON.stringify(input.items.map(({route}) => route))}`,
      "document.appendChild(overview)",
    ].join("\n"),
  })
  let disposed = false
  return Object.freeze({
    element: root,
    args: Object.freeze({}),
    source,
    dispose() {
      if (disposed) return
      disposed = true
      for (const {button, listener} of listeners) button.removeEventListener("click", listener)
    },
  })
}

export const graphOverviewCss = String.raw`
.graph-overview {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 720px;
  max-width: 100%;
  min-height: 320px;
  gap: 12px;
  padding: 24px;
  border: 1px solid #454a52;
  border-radius: 8px;
  background: #1d2229;
  color: #e4e7eb;
}

.graph-overview__title { display: block; color: #7edcec; font-size: 18px; }
.graph-overview__summary { display: block; color: #b9c0c8; font-size: 13px; }
.graph-overview__items { display: flex; flex-direction: column; gap: 8px; }
.graph-overview__item { display: flex; flex-direction: column; gap: 4px; padding: 10px; background: #252c35; }
.graph-overview__link { display: block; width: 100%; padding: 7px 9px; background: #33485f; color: #ffffff; text-align: left; }
.graph-overview__detail { display: block; color: #aab4bf; font-size: 12px; }
`
