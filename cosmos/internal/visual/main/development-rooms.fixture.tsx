import type {Bot} from "./bot"
import type {DevelopmentRoomAgentsModel} from "./development-room-agents"
import type {DevelopmentRoomSceneModel} from "./development-room-scene"
import {DevelopmentRoomsHUD, DevelopmentRoomsSpace} from "./development-rooms"
export {createEmbeddedSurface} from "@zavx0z/storybook-app-web-page-shell/surface"
export {createSourcePackageContent} from "@zavx0z/storybook-app-web-page-package/content"

/** Renderer fixture uses the same single Space, ViewPoint and HUD composition as the product. */
export function DevelopmentRoomsFixture(props: Readonly<{
  active: boolean
  bot: Bot
  scene: DevelopmentRoomSceneModel
  agents: DevelopmentRoomAgentsModel
}>) {
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
    </hud>
  </space>
}
