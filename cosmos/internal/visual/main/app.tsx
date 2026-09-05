import {useSpace} from "@zavx0z/browser"
import {useRef, useState} from "@zavx0z/component"
import {Space} from "@zavx0z/space/staging/space"
import {ViewPoint} from "@zavx0z/space/cameras/view-point"
import {Display} from "@zavx0z/space/portals/display"
import {HUD} from "@zavx0z/space/portals/hud"
import {Grid} from "@zavx0z/space/gizmos/grid"
import type {XRViewPointElement} from "@zavx0z/space"
import {DisplayDock} from "./display-dock.tsx"
import {DISPLAY_CENTER_MM, DISPLAY_NEAR_DISTANCE_MM, INITIAL_VIEW_POINT, displayMillimetersPerPixel, type DisplayMode} from "./view-state.ts"

/**
Одна сцена Cosmos: Display и HUD разделяют Document, ввод и точку обзора.
Компонент хранит режим, а ViewPoint — текущий и сохранённый обзор.
Неизменённые props не переписывают положение после жестов или изменения размера.
*/
export function App() {
  const size = useSpace(state => state.size)
  const [mode, setMode] = useState<DisplayMode>("far")
  const camera = useRef<XRViewPointElement | null>(null)
  const toggleView = () => {
    const viewPoint = camera.current
    if (viewPoint === null) return
    if (mode === "far") {
      viewPoint.saveState()
      viewPoint.dollyTo(DISPLAY_NEAR_DISTANCE_MM, DISPLAY_CENTER_MM)
    } else {
      viewPoint.reset()
    }
    setMode(mode === "far" ? "near" : "far")
  }
  return <Space>
    <ViewPoint
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
    <Display
      x={DISPLAY_CENTER_MM.x}
      y={DISPLAY_CENTER_MM.y}
      z={DISPLAY_CENTER_MM.z}
      quaternionX={Math.SQRT1_2}
      quaternionW={Math.SQRT1_2}
      viewportWidth={size.width}
      viewportHeight={size.height}
      worldUnitsPerPixel={displayMillimetersPerPixel(size.height)}
    >
      <MainSurface />
    </Display>
    <HUD>
      <DisplayDock mode={mode} onReturn={toggleView} />
    </HUD>
  </Space>
}

function MainSurface() {
  return <div
    title="Основная поверхность Cosmos"
    style={css`
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      background: #020617;
      border: 1px solid #334155;
    `}
  />
}
