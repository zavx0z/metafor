import {dirname, resolve} from "node:path"
import createJsxBunPlugin from "@zavx0z/immersive/compiler"

const agentRoot = resolve(import.meta.dir, "../../../../standard/agent")
const chatRoot = resolve(dirname(Bun.resolveSync("@zavx0z/chat/composer", agentRoot)), "../../..")
const preferencesRoot = dirname(Bun.resolveSync("@zavx0z/storybook-chat-preferences", agentRoot))
const timelineRoot = resolve(dirname(Bun.resolveSync("@zavx0z/storybook-chat-view/timeline", agentRoot)), "..")
const settingsRoot = dirname(Bun.resolveSync("@zavx0z/storybook-app-web-page-shell-execution-settings", import.meta.dir))
const visualRoot = resolve(import.meta.dir, "..")

/** Visual связывает свои views и стандартный Agent в одном compiled Document; Immersive предоставляет готовые компоненты. */
export default createJsxBunPlugin({
  cwd: visualRoot,
  sourceRoots: [resolve(visualRoot, "main"), resolve(visualRoot, "../../../standard/agent"), chatRoot, preferencesRoot, timelineRoot, settingsRoot],
  styleSourceRootIds: ["@internal/visual", "@metafor/agent", "@zavx0z/chat", "@zavx0z/storybook-chat-preferences", "@zavx0z/storybook-chat-view", "@zavx0z/storybook-app-web-page-shell-execution-settings"],
})
