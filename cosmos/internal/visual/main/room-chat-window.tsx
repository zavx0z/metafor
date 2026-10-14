import {HTMLElement} from "@zavx0z/immersive"
import {useLayoutEffect, useMemo, useRef} from "@zavx0z/immersive/XReact"
import {Window} from "@zavx0z/immersive/ui"
import type {AgentWorkspaceModel} from "./agent-workspace"

/** Полноэкранная проекция того же Chat: окно скрывается, экземпляр возвращается над Agent. */
export function RoomChatWindow(props: Readonly<{workspace: AgentWorkspaceModel; open: boolean; title: string; onBack(): void}>) {
  const host = useRef<HTMLElement | null>(null)
  const current = useRef(props)
  current.current = props
  const bind = useMemo(() => (value: unknown) => {
    if (value !== null && !(value instanceof HTMLElement)) throw new TypeError("Chat host должен быть Element")
    if (host.current && host.current !== value) props.workspace.releaseCommon(host.current)
    host.current = value
    if (value && current.current.open) props.workspace.bindCommon(value, true)
  }, [props.workspace])
  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    if (props.open) props.workspace.bindCommon(element, true)
    else props.workspace.releaseCommon(element)
    return () => props.workspace.releaseCommon(element)
  }, [props.workspace, props.open])
  return <Window
    id="metafor-room-chat"
    title={props.title}
    open={props.open}
    onOpenChange={open => {if (!open) props.onBack()}}
    layout="fill"
    actions={[{key: "back", label: "Назад в комнату"}]}
    onAction={key => {if (key === "back") props.onBack()}}
    style={css`
      backdrop-filter: blur(8px);
      --widget-surface-background: rgba(24, 30, 38, .14);
    `}
  >
    <RoomChatHost bind={bind} />
  </Window>
}

function RoomChatHost(props: Readonly<{bind(value: unknown): void}>) {
  return <div
      ref={props.bind}
      data-room-chat-host=""
      style={css`
        display: flex;
        flex-direction: column;
        flex: 1;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
      `}
    />
}
