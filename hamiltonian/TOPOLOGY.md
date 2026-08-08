# Hamiltonian — статическая техническая карта

Основное представление теперь находится на интерактивной WebGPU-странице
Hamiltonian: она показывает фактический runtime и обновляется через отдельную
browser-local orchestration projection. Эта Mermaid-схема остаётся справочной
картой результата `MF-412`, а не целевой production-топологией MetaFor.

```mermaid
flowchart TB
  subgraph HAMILTONIAN["Hamiltonian · одно управляющее целое"]
    direction TB

    ID["Логическая identity<br/>version · host epoch · placement policy"]

    subgraph HOST["Bun host facet"]
      direction TB
      LISTENER["Один HTTP/WSS listener<br/>единственный фиксированный port"]
      VERSION["Version source<br/>module bytes · SHA-256"]
      CONTROL["Control plane<br/>identity · heartbeat · topology · signaling"]
      PLACEMENT{"Authority placement · XOR<br/>browser или server"}
      SUPERVISOR["Process supervisors<br/>Bun.spawn · IPC"]

      PEER["Bun peer process<br/>WebRTC adapter · без fixed HTTP/WSS server"]
      BUN_MAIN["Bun main / main-probe<br/>OS process · без listener"]
      BUN_WORKER["Bun worker / worker-probe<br/>OS process · без listener"]

      VERSION --> LISTENER
      LISTENER --> CONTROL
      CONTROL --> PLACEMENT
      CONTROL <-->|"signaling через host"| SUPERVISOR
      SUPERVISOR <-->|"IPC"| PEER
      SUPERVISOR <-->|"IPC"| BUN_MAIN
      SUPERVISOR <-->|"IPC"| BUN_WORKER
    end

    subgraph BROWSERS["Browser facets · 0..N browser profiles"]
      direction TB
      SW["Один Service Worker на profile + origin<br/>Window registry · Cache Storage · reconnect"]

      subgraph WINDOWS["0..N Window clients одного profile"]
        direction LR
        LEADER["Избранная Window<br/>page bootstrap · browser main"]
        FOLLOWERS["Остальные Window<br/>followers"]
      end

      LEADER_WORKER["Dedicated Worker<br/>этой Window"]
      FOLLOWER_WORKERS["Dedicated Worker<br/>на каждую follower Window"]

      SW <-->|"MessagePort"| LEADER
      SW <-->|"MessagePort"| FOLLOWERS
      LEADER -->|"birth / cold rebirth"| LEADER_WORKER
      FOLLOWERS -->|"birth / cold rebirth"| FOLLOWER_WORKERS
    end

    subgraph DIRECT["Direct realtime data plane · один RTCPeerConnection"]
      direction LR
      ORACLE["RTCDataChannel · oracle<br/>ordered · reliable · RPC"]
      FORCE["RTCDataChannel · force<br/>ordered · reliable · events"]
    end

    ID --> LISTENER
    ID --> SW

    LISTENER -->|"HTTP: Service Worker · manifest · version bytes"| SW
    LISTENER -->|"HTTP: page bootstrap"| LEADER
    LISTENER -->|"HTTP: page bootstrap"| FOLLOWERS
    SW -->|"controlled module fetch из Cache Storage"| LEADER
    SW -->|"controlled module fetch из Cache Storage"| FOLLOWERS
    SW <-->|"Control WSS: identity · heartbeat · election · SDP/ICE"| CONTROL

    PLACEMENT -.->|"browser mode<br/>lease + fencing token"| LEADER
    PLACEMENT -.->|"server mode<br/>authority envelope"| BUN_MAIN

    LEADER <-->|"direct bytes"| ORACLE
    LEADER <-->|"direct bytes"| FORCE
    ORACLE <-->|"direct bytes"| PEER
    FORCE <-->|"direct bytes"| PEER
  end

  OUT["Не подключены в MF-412<br/>production Dark · Boundary · Matrix · Energy · Bulk"]
  ID -.->|"граница эксперимента"| OUT
```

## Как читать схему

- `browser` и `server` — взаимоисключающие placement одного запуска. В
  `browser` authority получает ровно одна Window, а Bun-роли остаются probes;
  в `server` authority получает Bun `main`, а Window leader отсутствует.
- Control WSS заканчивается на единственном listener и не переносит realtime
  payload. Он нужен для identity, lease/election, version state и WebRTC
  signaling.
- После знакомства избранная Window и Bun peer обмениваются payload напрямую
  через два DataChannel внутри одного `RTCPeerConnection`; Service Worker и
  listener не являются realtime relay.
- Service Worker один только внутри конкретных `profile + origin`. Глобальную
  singleton-authority между разными браузерами и устройствами выдаёт Bun host.
- `oracle` и `force` здесь являются названиями испытательных логических lane.
  Production-домены и их протоколы в стенд не импортированы.
- Интерактивная сцена использует этот же listener для presentation-only
  `POST /node-system/route`: ELK предлагает первоначальные node positions,
  surviving nodes остаются фиксированными, а серверный Libavoid меняет только
  edge routes. Это не Oracle RPC, Force stream и не второй server/port.
