import {useRef, useState} from "@zavx0z/component"
import {Grid} from "@zavx0z/space/gizmos/grid"
import type {ViewPointElement} from "@zavx0z/dom/viewpoint"
import {DisplayDock} from "./display-dock.tsx"
import {InfrastructureSurface} from "./infrastructure-surface.tsx"
import {DISPLAY_CENTER_MM, DISPLAY_NEAR_DISTANCE_MM, type DisplayMode, INITIAL_VIEW_POINT} from "./view-state.ts"

/**
 Одна сцена Cosmos: Display и HUD разделяют Document, ввод и точку обзора.
 Компонент хранит режим, а ViewPoint — текущий и сохранённый обзор.
 Неизменённые props не переписывают положение после жестов или изменения размера.
 */
export function App() {
  const [mode, setMode] = useState<DisplayMode>("far")
  const camera = useRef<ViewPointElement | null>(null)
  const [displayViewport, setDisplayViewport] = useState({width: 0, height: 0})
  return (
    <>
      <link
        rel="stylesheet"
        href={`/@internal/visual/theme.css?env=main&version=${import.meta.env.COSMOS_PACKAGE_VERSION}`}
      />
      <space>
        <viewpoint
          ref={camera}
          x={INITIAL_VIEW_POINT.position.x}
          y={INITIAL_VIEW_POINT.position.y}
          z={INITIAL_VIEW_POINT.position.z}
          targetX={INITIAL_VIEW_POINT.target.x}
          targetY={INITIAL_VIEW_POINT.target.y}
          targetZ={INITIAL_VIEW_POINT.target.z}
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
        <hud>
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
        </hud>
      </space>
    </>
  )
}
