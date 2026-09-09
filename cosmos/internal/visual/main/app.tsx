import {useRef, useState} from "@zavx0z/component"
import {ViewPoint} from "@zavx0z/space/cameras/view-point"
import {HUD} from "@zavx0z/space/portals/hud"
import {Grid} from "@zavx0z/space/gizmos/grid"
import type {XRViewPointElement} from "@zavx0z/space"
import {DisplayDock} from "./display-dock.tsx"
import {InfrastructureSurface} from "./infrastructure-surface.tsx"
import {DISPLAY_CENTER_MM, DISPLAY_NEAR_DISTANCE_MM, INITIAL_VIEW_POINT, type DisplayMode} from "./view-state.ts"

/**
Одна сцена Cosmos: Display и HUD разделяют Document, ввод и точку обзора.
Компонент хранит режим, а ViewPoint — текущий и сохранённый обзор.
Неизменённые props не переписывают положение после жестов или изменения размера.
*/
export function App() {
  const [mode, setMode] = useState<DisplayMode>("far")
  const camera = useRef<XRViewPointElement | null>(null)
  const [displayViewport, setDisplayViewport] = useState({width: 0, height: 0})
  return (
    <>
      <link
        rel="stylesheet"
        href={`/@internal/visual/theme.css?env=main&version=${import.meta.env.COSMOS_PACKAGE_VERSION}`}
      />
      <xr-space>
        <ViewPoint
          ref={camera}
          position={INITIAL_VIEW_POINT.position}
          target={INITIAL_VIEW_POINT.target}
          fov={INITIAL_VIEW_POINT.fov}
          near={INITIAL_VIEW_POINT.near}
          far={INITIAL_VIEW_POINT.far}
          controls={mode === "far"}
        />
        <Grid
          size={2400}
          divisions={24}
        />
        <display
          width={600}
          height={337.5}
          onResize={event => setDisplayViewport({
            width: Math.round(event.currentTarget.viewport.width),
            height: Math.round(event.currentTarget.viewport.height),
          })}
          style={css`
            width: 2268px;
            height: 1276px;

            translate: 0 0 900mm;
            rotate: x 90deg;

            display: flex;
            flex-direction: column;
            overflow: hidden;
          `}
        >
          {displayViewport.width > 0 ? (
            <InfrastructureSurface
              width={displayViewport.width}
              height={displayViewport.height}
            />
          ) : null}
        </display>
        <HUD>
          <DisplayDock
            mode={mode}
            onReturn={() => {
              const viewPoint = camera.current
              if (viewPoint === null) return
              if (mode === "far") {
                viewPoint.saveState()
                viewPoint.dollyTo(DISPLAY_NEAR_DISTANCE_MM, DISPLAY_CENTER_MM)
              } else {
                viewPoint.reset()
              }
              setMode(mode === "far" ? "near" : "far")
            }}
          />
        </HUD>
      </xr-space>
    </>
  )
}
