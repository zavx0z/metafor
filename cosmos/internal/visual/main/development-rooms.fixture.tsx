import type {Bot} from "./bot"
import type {DevelopmentRoomAgentsModel} from "./development-room-agents"
import type {DevelopmentRoomSceneModel} from "./development-room-scene"
import {DevelopmentRoomsHUD, DevelopmentRoomsSpace} from "./development-rooms"
import {DevelopmentRoomMinimap} from "./development-room-minimap"
export {sourcePackageCatalog} from "./development-room-minimap"
export {developmentRoomCatalogItems} from "./development-room-catalog"
import {useState, useSyncExternalStore} from "@zavx0z/immersive/XReact"
import type {StorybookAppWebPageShellMinimap} from "@zavx0z/storybook-app-web-page-shell-minimap"
export {createEmbeddedSurface} from "@zavx0z/storybook-app-web-page-shell/surface"
export {createSourcePackageContent} from "@zavx0z/storybook-app-web-page-package/content"

/** Renderer fixture uses the same single Space, ViewPoint and HUD composition as the product. */
export function DevelopmentRoomsFixture(props: Readonly<{
  active: boolean
  bot: Bot
  scene: DevelopmentRoomSceneModel
  agents: DevelopmentRoomAgentsModel
  onSelectPackage?(name: string): void
}>) {
  const scene = useSyncExternalStore(props.scene.subscribe, props.scene.getSnapshot)
  const [search, setSearch] = useState("")
  const [collapsedIds, setCollapsedIds] = useState<readonly string[] | undefined>(undefined)
  const [minimapState, setMinimapState] = useState<StorybookAppWebPageShellMinimap.Output | undefined>(undefined)
  return <space>
    <viewpoint
      x={0}
      y={-1000}
      z={2500}
      targetX={0}
      targetY={0}
      targetZ={0}
      fov={Math.PI / 3}
      controls={true}
    />
    <DevelopmentRoomsSpace
      active={props.active}
      scene={props.scene}
      agents={props.agents}
      bot={props.bot}
    />
    <hud id="cosmos-development-hud">
      <DevelopmentRoomsHUD
        active={props.active}
        scene={props.scene}
        agents={props.agents}
      />
      {props.active && scene.catalog ? <DevelopmentRoomMinimap
        catalog={scene.catalog}
        selectedPackage={scene.selectedPackage?.name ?? null}
        search={search}
        collapsedIds={collapsedIds}
        initialState={minimapState}
        onSearch={setSearch}
        onCollapsedIds={setCollapsedIds}
        onStateChange={setMinimapState}
        onSelectPackage={name => props.onSelectPackage?.(name)}
      /> : null}
    </hud>
  </space>
}
