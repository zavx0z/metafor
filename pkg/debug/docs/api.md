# Snapshot И NDJSON API

Sidecar имеет два интерфейса:

- JSON snapshot file
- stdin/stdout NDJSON command stream

## Snapshot File

Dump пишется атомарно:

```text
write tmp file -> rename tmp to final path
```

Это позволяет читать JSON без race с частичной записью.

Default package path:

```text
.metafor/debug/agent-state.json
```

Default dark wrapper path:

```text
dark/debug/.agent-state.json
```

## Snapshot Shape

```ts
type AgentDump = {
  timestamp: string
  reason: string
  hitBreakpoints: string[]
  frames: Array<{
    index: number
    function: string
    url: string
    line: number
    column: number
    scriptId?: string
    callFrameId?: string
    scopes: {
      local: ScopeSnapshot[]
      closure: ScopeSnapshot[]
    }
  }>
}
```

Ограничения snapshot:

- максимум top 5 frames
- scope properties раскрываются только для top frame
- раскрываются только `local` и `closure` scopes
- object previews не являются глубоким object graph

Для глубокого чтения использовать `eval` или `props`.

## Scope Properties

Bun/JSC отдаёт scopes как `DebuggerScope`.
Для них `Runtime.getProperties({ ownProperties: true })` часто пустой.

Поэтому sidecar использует:

```text
Runtime.getDisplayableProperties
```

Fallback:

```text
Runtime.getProperties
```

## NDJSON Формат

Одна строка stdin — одна команда:

```json
{"cmd":"frames"}
```

Одна строка stdout — один ответ:

```json
{"seq":1,"ok":true,"cmd":"frames","result":{}}
```

Общий shape ответа:

```ts
{
  seq: number
  ok: boolean
  cmd?: string
  id?: unknown
  result?: unknown
  error?: string
}
```

Если команда содержит `id`, ответ повторяет его:

```json
{"id":"req-1","cmd":"frames"}
```

Ответ:

```json
{"seq":1,"ok":true,"id":"req-1","cmd":"frames","result":{}}
```

## Команда frames

```json
{"cmd":"frames"}
```

Возвращает:

- `paused`
- raw cached `frames`
- последний `dump`

## Команда eval

```json
{"cmd":"eval","frame":0,"expr":"wimp.children.length"}
```

Требования:

- target paused
- `frame` указывает на существующий cached call frame
- `callFrameId` ещё валиден

Использует:

```text
Debugger.evaluateOnCallFrame
```

Пример успешного ответа:

```json
{"seq":1,"ok":true,"cmd":"eval","result":{"result":{"type":"number","value":3,"description":"3"},"wasThrown":false}}
```

## Команда props

```json
{"cmd":"props","objectId":"{\"injectedScriptId\":1,\"id\":7}"}
```

Default:

```json
{"ownProperties":true}
```

Для inherited/synthetic properties:

```json
{"cmd":"props","objectId":"...","ownProperties":false}
```

## Команда pause

```json
{"cmd":"pause"}
```

Отправляет:

```text
Debugger.pause
```

## Команда step

```json
{"cmd":"step","kind":"over"}
{"cmd":"step","kind":"into"}
{"cmd":"step","kind":"out"}
```

Mapping:

```text
over -> Debugger.stepOver
into -> Debugger.stepInto
out  -> Debugger.stepOut
```

## Команда resume

```json
{"cmd":"resume"}
```

Отправляет:

```text
Debugger.resume
```

## Важное Про Валидность Id

`callFrameId` и `objectId` валидны только пока VM paused.
После `resume`, `stepOver`, `stepInto`, `stepOut` старые id могут стать stale.

Если нужно продолжить читать state после step, дождаться нового `Debugger.paused` и нового dump.
