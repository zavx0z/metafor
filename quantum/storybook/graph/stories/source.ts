import type {StorybookStorySource} from "@zavx0z/storybook/stories"

export function graphJsonStorySource(input: Readonly<{
  id: string
  title: string
  typescript: string
}>): StorybookStorySource {
  return Object.freeze({
    html: `<section class="graph-json" data-story="${input.id}">
  <h2 class="graph-json__title">${input.title}</h2>
  <pre class="graph-json__result"><code></code></pre>
</section>`,
    css: `.graph-json {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  gap: 6px;
  padding: 52px 18px 18px;
}

.graph-json__title {
  flex: 0 0 28px;
  margin: 0;
  font-size: 16px;
  line-height: 28px;
}

.graph-json__result {
  flex: 1 1 auto;
  margin: 0;
  overflow: auto;
}`,
    typescript: input.typescript,
  })
}

export function graphNodeTreeStorySource(typescript: string): StorybookStorySource {
  return Object.freeze({
    html: `<node-editor class="graph-node-tree" data-projection="graph-live"></node-editor>`,
    css: `.graph-node-tree {
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
}`,
    typescript,
  })
}
