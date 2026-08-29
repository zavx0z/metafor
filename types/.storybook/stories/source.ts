import {checkboxCss, checkboxStyles} from "@ui/components/checkbox"
import {codeEditorStyles} from "@ui/components/code-editor"
import {enumInputCss, enumInputStyles} from "@ui/components/enum-input"
import {listCss, listStyles} from "@ui/components/list"
import {paneCss, paneStyles} from "@ui/components/pane"
import {resolveWidgetColors, rgba8ToColor, uiTheme} from "@ui/components/theme"

export type GraphDomStorySource = Readonly<{
  html: string
  css: string
  typescript: string
}>

export function graphJsonStorySource(input: Readonly<{
  id: string
  title: string
  control?: Readonly<{kind: "boolean" | "select"; label: string}>
  typescript: string
}>): GraphDomStorySource {
  const control = input.control === undefined
    ? ""
    : input.control.kind === "boolean"
      ? `\n  <label class="graph-json__control"><span>${input.control.label}</span><input ${checkboxStyles.root.attributeName} class="graph-json__control-input" type="checkbox" aria-checked="false"></label>`
      : `\n  <label class="graph-json__control"><span>${input.control.label}</span><select ${enumInputStyles.root.attributeName} class="graph-json__control-input"></select></label>`
  return Object.freeze({
    html: `<section class="graph-json" data-story="${input.id}">
  <h2 class="graph-json__title">${input.title}</h2>${control}
  <section ${codeEditorStyles.root.attributeName} role="region" aria-label="${input.title}" data-language-id="json" data-path="${input.id}.json"></section>
</section>`,
    css: graphDomStoryCss,
    typescript: input.typescript,
  })
}

export function graphNodeTreeStorySource(input: Readonly<{
  incremented: boolean
  revision: number
  topologyRevision: number
  frames: number
  nodes: number
  links: number
}>): GraphDomStorySource {
  return Object.freeze({
    html: `<section class="graph-node-tree" data-projection="graph-live">
  <header><h2>Graph · NodeTree projection</h2></header>
  <label><input ${checkboxStyles.root.attributeName} class="graph-node-tree__control-input" type="checkbox" aria-checked="${String(input.incremented)}" data-control-key="incremented"> Изменить runtime count</label>
  <dl data-revision="${input.revision}" data-topology-revision="${input.topologyRevision}">
    <dt>Frames</dt><dd>${input.frames}</dd>
    <dt>Nodes</dt><dd>${input.nodes}</dd>
    <dt>Links</dt><dd>${input.links}</dd>
  </dl>
  <div class="graph-node-tree__frames"></div>
  <ul ${listStyles.root.attributeName} class="graph-node-tree__links"></ul>
</section>`,
    css: graphDomStoryCss,
    typescript: [
      'import {createDocument} from "@zavx0z/dom"',
      'import {createGraphNodeTree, reconcileGraphNodeTree} from "@metafor/node-tree/graph"',
      'import {Checkbox} from "@ui/components/checkbox"',
      'import {createRoot} from "@zavx0z/react"',
      "",
      "const document = createDocument()",
      "const tree = createGraphNodeTree(graph)",
      `reconcileGraphNodeTree(tree, nextGraph) // runtime count = ${input.incremented ? 1 : 0}`,
      "const snapshot = tree.snapshot()",
      'const root = document.createElement("section")',
      'root.className = "graph-node-tree"',
      'createRoot(control).render(<Checkbox checked={false} />)',
      "for (const frame of snapshot.frames) {",
      '  const section = document.createElement("section")',
      '  section.setAttribute("data-frame-id", frame.id)',
      "  root.appendChild(section)",
      "}",
      "document.appendChild(root)",
    ].join("\n"),
  })
}

const graphBoxColors = resolveWidgetColors("box")
const graphSelectedColors = resolveWidgetColors("regular", {selected: true})

const graphDomConsumerCss = String.raw`
.graph-json {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  gap: 4px;
  padding: 6px;
}

.graph-json__title { display: block; color: ${rgba8ToColor(graphBoxColors.text)}; font-size: 13px; line-height: 18px; }
.graph-json__controls { display: flex; flex-direction: row; min-height: 28px; gap: 4px; }
.graph-json__control { display: flex; flex-direction: row; align-items: center; min-height: 28px; gap: 4px; padding: 2px 4px; background: ${rgba8ToColor(uiTheme.spaceNode.navigationBar)}; }
.graph-json__control-label { display: block; color: ${rgba8ToColor(graphBoxColors.text)}; font-size: 11px; }
.graph-json__control-description { display: block; color: rgb(153, 153, 153); font-size: 10px; }
.graph-json__control select.graph-json__control-input { width: 160px; height: 24px; }
.graph-json__result { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; }
.graph-json__result > section { width: 100%; height: 100%; min-height: 0; flex: 1 1 0; }

.graph-node-tree {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  gap: 4px;
  padding: 6px;
  overflow: auto;
  background: ${rgba8ToColor(uiTheme.spaceNode.navigationBar)};
  color: ${rgba8ToColor(graphBoxColors.text)};
}

.graph-node-tree__header { display: flex; flex-direction: row; align-items: center; justify-content: space-between; min-height: 28px; gap: 4px; }
.graph-node-tree__header h2 { display: block; color: ${rgba8ToColor(graphBoxColors.text)}; font-size: 13px; }
.graph-node-tree__control { display: flex; flex-direction: row; align-items: center; gap: 4px; padding: 2px 4px; background: ${rgba8ToColor(uiTheme.spaceNode.header)}; font-size: 11px; }
.graph-node-tree__stats { display: flex; flex-direction: row; gap: 6px; padding: 4px; background: ${rgba8ToColor(uiTheme.spaceNode.executionButtons)}; }
.graph-node-tree__stat { display: flex; flex-direction: row; gap: 2px; }
.graph-node-tree__stat dt { display: block; color: rgb(153, 153, 153); font-size: 10px; }
.graph-node-tree__stat dd { display: block; color: ${rgba8ToColor(graphBoxColors.text)}; font-size: 10px; }
.graph-node-tree__frames { display: flex; flex-direction: row; align-items: flex-start; gap: 4px; overflow-x: auto; }
.graph-node-tree__frame { display: flex; flex-direction: column; width: 240px; min-height: 88px; gap: 3px; padding: 4px; }
.graph-node-tree__frame h3 { display: block; color: ${rgba8ToColor(graphBoxColors.text)}; font-size: 11px; }
.graph-node-tree__nodes { display: flex; flex-direction: column; gap: 3px; }
.graph-node-tree__node { display: flex; flex-direction: column; gap: 2px; padding: 4px; border-color: ${rgba8ToColor(graphSelectedColors.inner)}; border-radius: 0; }
.graph-node-tree__node h4 { display: block; color: ${rgba8ToColor(graphBoxColors.text)}; font-size: 11px; }
.graph-node-tree__parameters,
.graph-node-tree__sockets,
.graph-node-tree__links { width: 100%; max-height: 96px; }
`

export const graphDomStoryCss = `${checkboxCss}\n${enumInputCss}\n${paneCss}\n${listCss}\n${graphDomConsumerCss}`
