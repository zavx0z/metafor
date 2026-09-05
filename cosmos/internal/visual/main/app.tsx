import {useSpace, type RootSize} from "@zavx0z/browser"
import {useRef, useState} from "@zavx0z/component"
import {GridHelper} from "@zavx0z/engine"
import {Space} from "@zavx0z/space/space"
import {ViewPoint} from "@zavx0z/space/view-point"
import {Display} from "@zavx0z/space/display"
import {HUD} from "@zavx0z/space/hud"
import {Asset} from "@zavx0z/space/asset"
import {XRViewPointElement} from "@zavx0z/space"
import {DisplayDock} from "./display-dock.tsx"
import {DISPLAY_CENTER_MM, INITIAL_VIEW_POINT, displayMillimetersPerPixel, nearViewPoint, readViewPoint, writeViewPoint, type DisplayMode, type ViewPointPose} from "./view-state.ts"

const floorGrid = () => {
  const grid = new GridHelper(2400, 24)
  grid.frustumCulled = false
  return grid
}

/** Размер Canvas поступает из общего Browser-контекста до расчёта кадра. */
export function VisualApp() {
  const size = useSpace(state => state.size)
  return <VisualScene size={size} />
}

/**
Одна сцена Cosmos: Display и HUD разделяют Document, ввод и точку обзора.
Состояние режима и сохранённая камера живут в компоненте и исчезают при unmount.
Изменение размера не переписывает положение камеры.
*/
export function VisualScene(props: Readonly<{size: Pick<RootSize, "width" | "height">}>) {
  const [mode, setMode] = useState<DisplayMode>("far")
  const farViewPoint = useRef<ViewPointPose>(INITIAL_VIEW_POINT)
  const currentCamera = document.querySelector("xr-view-point")
  const camera = currentCamera instanceof XRViewPointElement ? readViewPoint(currentCamera) : INITIAL_VIEW_POINT
  const toggleView = () => {
    const viewPoint = document.querySelector("xr-view-point")
    if (!(viewPoint instanceof XRViewPointElement)) throw new Error("Visual camera is not mounted")
    const current = readViewPoint(viewPoint)
    if (mode === "far") farViewPoint.current = current
    // Общий обработчик события Component уже объединяет эти изменения Document.
    writeViewPoint(viewPoint, mode === "far" ? nearViewPoint(current) : farViewPoint.current)
    setMode(mode === "far" ? "near" : "far")
  }
  return <Space>
    <ViewPoint
      x={camera.position.x}
      y={camera.position.y}
      z={camera.position.z}
      targetX={camera.target.x}
      targetY={camera.target.y}
      targetZ={camera.target.z}
      fov={camera.fov}
      near={camera.near}
      far={camera.far}
      controls={mode === "far"}
    />
    <Asset name="SpaceFloorGrid" factory={floorGrid} />
    <Display
      id="main"
      x={DISPLAY_CENTER_MM.x}
      y={DISPLAY_CENTER_MM.y}
      z={DISPLAY_CENTER_MM.z}
      quaternionX={Math.SQRT1_2}
      quaternionW={Math.SQRT1_2}
      viewportWidth={props.size.width}
      viewportHeight={props.size.height}
      worldUnitsPerPixel={displayMillimetersPerPixel(props.size.height)}
    >
      <MainSurface />
    </Display>
    <HUD id="main-hud">
      <DisplayDock mode={mode} onReturn={toggleView} />
    </HUD>
  </Space>
}

function MainSurface() {
  return <div
    id="main-content"
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
