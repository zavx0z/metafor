import {useEffect, useRef, useState} from "@zavx0z/immersive/XReact"
import {Button, CodeEditor, SelectField, Typography} from "@zavx0z/immersive/ui"

export type DevelopmentSourceFile = Readonly<{path: string; content: string; hash: string; writable: boolean}>
export type DevelopmentSourceEntry = Readonly<{path: string; type: "file" | "directory"}>
export type DevelopmentSourceClient = Readonly<{
  list(packageName: string, path?: string): Promise<Readonly<{entries: readonly DevelopmentSourceEntry[]; truncated: boolean}>>
  read(packageName: string, path: string): Promise<DevelopmentSourceFile>
  save(packageName: string, path: string, content: string, expectedHash: string): Promise<Readonly<{path: string; hash: string}>>
}>
export type DevelopmentSourceProps = Readonly<{
  packageName: string
  writable: boolean
  client: DevelopmentSourceClient
  onDirtyChange?(dirty: boolean): void
}>

type Selection = Readonly<{client: DevelopmentSourceClient; packageName: string; path: string}>
const message = (error: unknown) => error instanceof Error ? error.message : String(error)
const conflict = (error: unknown) => error !== null && typeof error === "object" &&
  (Reflect.get(error, "code") === "CONFLICT" || Reflect.get(error, "status") === 409)

/** Исходник приходит только через назначенный client; запись всегда требует hash прочитанной версии. */
export function DevelopmentSource(props: DevelopmentSourceProps) {
  const [location, setLocation] = useState<Selection>({client: props.client, packageName: props.packageName, path: "."})
  const [entries, setEntries] = useState<readonly DevelopmentSourceEntry[]>([])
  const [truncated, setTruncated] = useState(false)
  const [selected, setSelected] = useState<Selection | null>(null)
  const [file, setFile] = useState<DevelopmentSourceFile | null>(null)
  const [draft, setDraft] = useState("")
  const [phase, setPhase] = useState<"listing" | "reading" | "ready" | "error">("listing")
  const [saving, setSaving] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [error, setError] = useState("")
  const [readRevision, setReadRevision] = useState(0)
  const folder = location.client === props.client && location.packageName === props.packageName ? location : null
  const current = selected?.client === props.client && selected.packageName === props.packageName ? selected : null
  const activeSelection = useRef(current), alive = useRef(true), onDirtyChange = useRef(props.onDirtyChange)
  activeSelection.current = current
  onDirtyChange.current = props.onDirtyChange
  const visible = current !== null && file?.path === current.path && phase !== "listing"
  const dirty = visible && draft !== file.content
  const writableFile = props.writable && file?.writable === true
  const files = entries.filter(item => item.type === "file")
  const directories = entries.filter(item => item.type === "directory")
  useEffect(() => {onDirtyChange.current?.(dirty)}, [dirty])
  useEffect(() => {alive.current = true; return () => {alive.current = false; onDirtyChange.current?.(false)}}, [])

  useEffect(() => {
    setLocation({client: props.client, packageName: props.packageName, path: "."})
  }, [props.client, props.packageName])

  useEffect(() => {
    if (!folder) return
    let active = true
    setEntries([]); setTruncated(false); setSelected(null); setFile(null); setDraft(""); setPhase("listing"); setSaving(false); setBlocked(false); setError("")
    void folder.client.list(folder.packageName, folder.path).then(result => {
      if (!active) return
      const first = result.entries.find(item => item.type === "file")
      setEntries(result.entries)
      setTruncated(result.truncated)
      setSelected(first ? {client: folder.client, packageName: folder.packageName, path: first.path} : null)
      setPhase(first ? "reading" : "ready")
    }).catch(cause => {if (active) {setPhase("error"); setError(`Список файлов недоступен: ${message(cause)}`)}})
    return () => {active = false}
  }, [folder?.client, folder?.packageName, folder?.path])

  useEffect(() => {
    if (!current) return
    let active = true
    setPhase("reading")
    void current.client.read(current.packageName, current.path).then(result => {
      if (!active) return
      if (result.path !== current.path || !result.hash) throw new Error("Получен другой файл или пустой hash")
      setFile(result); setDraft(result.content); setBlocked(false); setError(""); setPhase("ready")
    }).catch(cause => {if (active) {setPhase("error"); setError(`Файл недоступен: ${message(cause)}`)}})
    return () => {active = false}
  }, [current?.client, current?.packageName, current?.path, readRevision])

  const select = (path: string) => {
    if (path === current?.path || !files.some(item => item.path === path)) return
    if (dirty || saving) {setError("Сохраните изменения перед выбором другого файла"); return}
    setFile(null); setDraft(""); setError(""); setSelected({client: props.client, packageName: props.packageName, path})
  }
  const openDirectory = (path: string) => {
    if (!folder || path === folder.path || !directories.some(item => item.path === path) && path !== "." && !folder.path.startsWith(`${path}/`)) return
    if (dirty || saving) {setError("Сохраните изменения перед переходом в другую папку"); return}
    setLocation({client: props.client, packageName: props.packageName, path})
  }
  const parent = folder?.path === "." ? null : folder?.path.split("/").slice(0, -1).join("/") || "."
  const save = async () => {
    if (!current || !file || !dirty || saving || blocked || !writableFile || phase !== "ready") return
    const submitted = draft
    setSaving(true); setError("")
    try {
      const result = await current.client.save(current.packageName, current.path, submitted, file.hash)
      if (!alive.current || activeSelection.current !== current) return
      if (result.path !== current.path || !result.hash) throw new Error("Сохранение не подтвердило файл и hash")
      setFile({...file, content: submitted, hash: result.hash})
    } catch (cause) {
      if (!alive.current || activeSelection.current !== current) return
      setBlocked(true)
      setError(conflict(cause)
        ? "Файл изменился с момента чтения. Ваши правки сохранены в редакторе; перезапись отклонена."
        : `Сохранение не подтверждено: ${message(cause)}. Ваши правки сохранены в редакторе.`)
    } finally {if (alive.current && activeSelection.current === current) setSaving(false)}
  }
  return <section
    data-development-source={props.packageName}
    style={css`
      display: flex;
      flex: 1;
      flex-direction: column;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      gap: 8px;
    `}
  >
    <div style={css`
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    `}>
      {parent ? <Button
        label="Назад"
        disabled={saving}
        onClick={() => openDirectory(parent)}
      /> : null}
      <Typography
        text={folder?.path ?? "."}
        variant="caption"
      />
      <SelectField
        label="Файл"
        value={current?.path ?? ""}
        options={files.map(item => ({key: item.path, value: item.path, label: item.path}))}
        disabled={files.length === 0 || phase === "listing" || saving}
        onChange={select}
      />
      <Typography text={dirty ? "● Изменён" : visible ? "Сохранён" : ""} />
      <Button
        label="Сохранить"
        disabled={!writableFile || !dirty || saving || blocked || phase !== "ready"}
        onClick={() => {void save()}}
      />
      {blocked || phase === "error" && current ? <Button
        label="Загрузить версию с диска"
        disabled={saving || phase === "reading"}
        onClick={() => {setReadRevision(value => value + 1)}}
      /> : null}
    </div>
    <nav
      aria-label="Папки исходников"
      hidden={directories.length === 0}
      style={css`
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        &[hidden] {
          display: none;
        }
      `}
    >
      {directories.map(item => <Button
        key={item.path}
        label={item.path}
        disabled={saving}
        onClick={() => openDirectory(item.path)}
      />)}
    </nav>
    {truncated ? <Typography text="Список ограничен. Откройте нужную папку для её содержимого." /> : null}
    {error ? <Typography
      text={error}
      style={css`
        color: var(--widget-error-content);
      `}
    /> : null}
    {phase === "listing" ? <Typography text="Загрузка файлов…" /> : null}
    {phase === "ready" && files.length === 0 && directories.length === 0 ? <Typography text="В папке нет доступных исходников" /> : null}
    {phase === "reading" ? <Typography text="Загрузка файла…" /> : null}
    {visible ? <CodeEditor
      key={`${props.packageName}:${current!.path}`}
      value={draft}
      path={current!.path}
      title={current!.path}
      readOnly={!writableFile || blocked || saving}
      onChange={setDraft}
      style={css`
        flex: 1;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
      `}
    /> : null}
  </section>
}
