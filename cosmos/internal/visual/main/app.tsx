import {useEffect, useMemo, useState} from "@zavx0z/immersive/XReact"
import {Button, Tab} from "@zavx0z/immersive/ui"
import type {Bot} from "./bot.ts"
import {createNetworkSpace, NetworkSpace, type NetworkSpaceModel} from "./network-space.tsx"
import {INITIAL_VIEW_POINT} from "./view-state.ts"

/** Одна сеть в одном Space и Document; свет, HUD и ввод разделяют общий lifecycle. */
export function App(props: Readonly<{network?: NetworkSpaceModel | undefined; bot?: Bot | undefined}>) {
  const network = useMemo(() => props.network ?? createNetworkSpace(), [props.network])
  useEffect(() => () => network.dispose(), [network])
  return <>
    <link
      rel="stylesheet"
      href={`/@internal/visual/theme.css?env=main&version=${import.meta.env.COSMOS_PACKAGE_VERSION}`}
    />
    <space style={css`
      font-family: var(--font-family);
      color: var(--widget-regular-content);
    `}>
      <viewpoint
        x={INITIAL_VIEW_POINT.position.x}
        y={INITIAL_VIEW_POINT.position.y}
        z={INITIAL_VIEW_POINT.position.z}
        targetX={INITIAL_VIEW_POINT.target.x}
        targetY={INITIAL_VIEW_POINT.target.y}
        targetZ={INITIAL_VIEW_POINT.target.z}
        fov={INITIAL_VIEW_POINT.fov}
        near={INITIAL_VIEW_POINT.near}
        far={INITIAL_VIEW_POINT.far}
        controls={true}
      />
      <xr-light
        name="Основной свет сети"
        kind="directional"
        color="#d9eaff"
        intensity={3}
        x={-100000}
        y={-100000}
        z={200000}
      />
      <xr-light
        name="Мягкий свет сети"
        kind="directional"
        color="#8ed8dc"
        intensity={1.5}
        x={100000}
        y={40000}
        z={120000}
      />
      <xr-light
        name="Контровой свет сети"
        kind="directional"
        color="#cfb5f3"
        intensity={1}
        x={0}
        y={100000}
        z={60000}
      />
      <NetworkSpace model={network} />
      {props.bot === undefined ? null : <BotAvatar bot={props.bot} />}
      <hud>
        <NetworkNavigation network={network} />
      </hud>
    </space>
  </>
}

/** Как в Workbench: общий Tab владеет drag/docking, Button — доступностью и темой. */
function NetworkNavigation(props: Readonly<{network: NetworkSpaceModel}>) {
  const [vertical, setVertical] = useState(false)
  return <div
    id="main-display-dock"
    style={css`
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    `}
  >
    <Tab
      label="Сети"
      position={{edge: "bottom", offset: .5}}
      onPositionChange={position => setVertical(position.edge === "left" || position.edge === "right")}
    >
      <NetworkNavigationActions network={props.network} vertical={vertical} />
    </Tab>
  </div>
}

function NetworkNavigationActions(props: Readonly<{network: NetworkSpaceModel; vertical: boolean}>) {
  return <nav
    role="toolbar"
    aria-label="Навигация сети"
    style={css`
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: var(--spacing-4);
      padding: var(--spacing-4);
      ${props.vertical && css`flex-direction: column;`}
    `}
  >
    <Button label="−" title="Отдалить сеть" aria-label="Отдалить сеть" onClick={() => props.network.zoom(1.25)} />
    <Button label="Вписать сеть" title="Вписать сеть в область просмотра" onClick={() => props.network.fit()} />
    <Button label="+" title="Приблизить сеть" aria-label="Приблизить сеть" onClick={() => props.network.zoom(.8)} />
  </nav>
}

function BotAvatar(props: Readonly<{bot: Bot}>) {
  return <xr-asset
    name="bot"
    factory={props.bot.object}
    x={550}
    y={0}
    z={0}
    scaleX={.5}
    scaleY={.5}
    scaleZ={.5}
  >
    <xr-animation
      factory={props.bot.animation}
      playing={false}
      loop={true}
    />
  </xr-asset>
}
