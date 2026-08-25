import {join} from "node:path"
import {createStorybookPage, type StorybookPage} from "@ui/storybook/server"
import {GRAPH_STORIES} from "./stories.ts"

/** Static-build prefix; локальная лаборатория использует пустой public base. */
export type GraphStorybookPageOptions = Readonly<{
  publicBasePath?: string
}>

/** Создаёт mountable Quantum Graph page на инфраструктуре `@ui/storybook`. */
export function createGraphStorybookPage(
  options: GraphStorybookPageOptions = {},
): StorybookPage {
  const page = createStorybookPage({
    id: "graph",
    mountPath: "/graph",
    packageName: "Quantum · лаборатория Graph",
    entrypoint: join(import.meta.dir, "entry.ts"),
    stylePath: join(import.meta.dir, "style.css"),
    body: {kind: "canvas", canvasId: "quantum-storybook-canvas"},
    routeTree: GRAPH_STORIES.routeTree,
    ...(options.publicBasePath === undefined ? {} : {publicBasePath: options.publicBasePath}),
  })
  return russianPage(page)
}

function russianPage(page: StorybookPage): StorybookPage {
  return Object.freeze({
    id: page.id,
    mountPath: page.mountPath,
    deepRoutes: page.deepRoutes,
    routeTree: page.routeTree,
    assetBasePath: page.assetBasePath,
    get diagnostics() {
      return page.diagnostics
    },
    owns(pathname: string) {
      return page.owns(pathname)
    },
    matches(pathname: string) {
      return page.matches(pathname)
    },
    async routeResponse(pathname: string) {
      return translate(await page.routeResponse(pathname))
    },
    async htmlResponse() {
      return (await translate(await page.htmlResponse()))!
    },
    assetResponse(pathname: string) {
      return page.assetResponse(pathname)
    },
  })
}

async function translate(response: Response | null): Promise<Response | null> {
  if (response === null || !response.headers.get("content-type")?.startsWith("text/html")) return response
  const html = await response.text()
  return new Response(html
    .replace(">Built for MetaFor<", ">Создано для MetaFor<")
    .replace("reusable WebGPU UI", "инфраструктура Storybook из zavx0z/ui"), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
}
