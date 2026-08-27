import type {StorybookDomStorySource} from "@zavx0z/storybook/stories"
export function graphJsonStorySource(input: Readonly<{
  id: string
  title: string
  control?: Readonly<{kind: "boolean" | "select"; label: string}>
  typescript: string
}>): StorybookDomStorySource {
  const control = input.control === undefined
    ? ""
    : input.control.kind === "boolean"
      ? `\n  <label class="graph-json__control"><span>${input.control.label}</span><input type="checkbox"></label>`
      : `\n  <label class="graph-json__control"><span>${input.control.label}</span><select></select></label>`
  return Object.freeze({
    html: `<section class="graph-json" data-story="${input.id}">
  <h2 class="graph-json__title">${input.title}</h2>${control}
  <section class="ui-code-editor" aria-readonly="true"></section>
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
}>): StorybookDomStorySource {
  return Object.freeze({
    html: `<section class="graph-node-tree" data-projection="graph-live">
  <header><h2>Graph · NodeTree projection</h2></header>
  <label><input type="checkbox" data-control-key="incremented"> Изменить runtime count</label>
  <dl data-revision="${input.revision}" data-topology-revision="${input.topologyRevision}">
    <dt>Frames</dt><dd>${input.frames}</dd>
    <dt>Nodes</dt><dd>${input.nodes}</dd>
    <dt>Links</dt><dd>${input.links}</dd>
  </dl>
  <div class="graph-node-tree__frames"></div>
  <ul class="graph-node-tree__links"></ul>
</section>`,
    css: graphDomStoryCss,
    typescript: [
      'import {createDocument} from "@zavx0z/dom"',
      'import {createGraphNodeTree, reconcileGraphNodeTree} from "@metafor/node-tree/graph"',
      "",
      "const document = createDocument()",
      "const tree = createGraphNodeTree(graph)",
      `reconcileGraphNodeTree(tree, nextGraph) // runtime count = ${input.incremented ? 1 : 0}`,
      "const snapshot = tree.snapshot()",
      'const root = document.createElement("section")',
      'root.className = "graph-node-tree"',
      "for (const frame of snapshot.frames) {",
      '  const section = document.createElement("section")',
      '  section.setAttribute("data-frame-id", frame.id)',
      "  root.appendChild(section)",
      "}",
      "document.appendChild(root)",
    ].join("\n"),
  })
}

export const graphDomStoryCss = String.raw`
.graph-json {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  gap: 8px;
  padding: 12px;
}

.graph-json__title { display: block; color: #e8edf2; font-size: 16px; line-height: 24px; }
.graph-json__controls { display: flex; flex-direction: row; min-height: 36px; gap: 8px; }
.graph-json__control { display: flex; flex-direction: row; align-items: center; min-height: 32px; gap: 8px; padding: 5px 8px; background: #252b32; }
.graph-json__control-label { display: block; color: #f0f2f5; }
.graph-json__control-description { display: block; color: #9da7b2; font-size: 11px; }
.graph-json__control select { display: block; width: 180px; height: 28px; padding: 4px 8px; background: #181c21; color: #e5e8ec; }
.graph-json__result { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; }
.graph-json__result .ui-code-editor { width: 100%; height: 100%; min-height: 0; flex: 1 1 0; }

.graph-node-tree {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  gap: 10px;
  padding: 12px;
  overflow: auto;
  background: #14191f;
  color: #e5e9ee;
}

.graph-node-tree__header { display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 12px; }
.graph-node-tree__header h2 { display: block; color: #7edcec; font-size: 16px; }
.graph-node-tree__control { display: flex; flex-direction: row; align-items: center; gap: 6px; padding: 5px 8px; background: #252c35; }
.graph-node-tree__stats { display: flex; flex-direction: row; gap: 12px; padding: 8px; background: #20262e; }
.graph-node-tree__stat { display: flex; flex-direction: row; gap: 4px; }
.graph-node-tree__stat dt { display: block; color: #99a4af; }
.graph-node-tree__stat dd { display: block; color: #ffffff; }
.graph-node-tree__frames { display: flex; flex-direction: row; flex-wrap: wrap; align-items: flex-start; gap: 10px; }
.graph-node-tree__frame { display: flex; flex-direction: column; width: 260px; min-height: 96px; gap: 6px; padding: 8px; border: 1px solid #4a5360; border-radius: 5px; background: #1d242c; }
.graph-node-tree__frame h3 { display: block; color: #c3d9ef; font-size: 13px; }
.graph-node-tree__nodes { display: flex; flex-direction: column; gap: 5px; }
.graph-node-tree__node { display: flex; flex-direction: column; gap: 4px; padding: 6px; border-left: 3px solid #4f8fc2; background: #28313b; }
.graph-node-tree__node h4 { display: block; color: #ffffff; font-size: 12px; }
.graph-node-tree__parameters, .graph-node-tree__sockets, .graph-node-tree__links { display: flex; flex-direction: column; gap: 3px; }
.graph-node-tree__parameter, .graph-node-tree__socket, .graph-node-tree__link { display: block; color: #aeb8c3; font-size: 10px; }
.graph-node-tree__links { padding: 8px; background: #1d242c; }
`
