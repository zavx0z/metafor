import {useState} from "@zavx0z/component"
import {Button} from "@zavx0z/ui/buttons/button"
import {uiIcons} from "@zavx0z/ui/themes/icons"
import type {DisplayMode} from "./view-state.ts"

export type DisplayDockProps = Readonly<{
  mode: DisplayMode
  onReturn(): void
}>

/** Navigation state and two production Buttons in the application's HUD. */
export function DisplayDock(props: DisplayDockProps) {
  const [pinned, setPinned] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const title = props.mode === "far"
    ? "Приблизить основную поверхность"
    : "Вернуть пространственный обзор"
  const togglePinned = () => {
    setPinned(!pinned)
    if (!pinned) setExpanded(true)
  }
  const returnToView = () => {
    setPinned(false)
    setExpanded(false)
    props.onReturn()
  }
  return <div style={css`
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    width: 100%;
    height: 100%;
    padding-bottom: 13px;
  `}>
    <div
      id="main-display-dock"
      data-expanded={expanded ? "true" : "false"}
      onPointerEnter={() => setExpanded(true)}
      onPointerLeave={() => { if (!pinned) setExpanded(false) }}
      style={css`
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        width: 7.5%;
        min-width: 58px;
        max-width: 88px;
        height: 17px;

        &[data-expanded="true"] {
          height: 82px;
        }
      `}
    >
      <Button
        label="Вернуться к предыдущему обзору"
        aria-label="Вернуться к предыдущему обзору"
        title={title}
        iconSrc={uiIcons.chevronLeft}
        iconOnly={true}
        variant="glass"
        size="small"
        onClick={returnToView}
        style={css`
          width: 38px;
          min-width: 38px;
          height: 38px;
          padding: 8px;

          ${expanded === false && css`
            display: none;
          `}
        `}
      />
      <Button
        label="—"
        aria-label="Навигация основной поверхности"
        title={title}
        selected={pinned}
        variant="glass"
        size="small"
        onClick={togglePinned}
        style={css`
          width: 100%;
          min-width: 100%;
          height: 17px;
          padding: 0;
          border-radius: 9px;
        `}
      />
    </div>
  </div>
}
