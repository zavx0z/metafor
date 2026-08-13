# UPD-001 — Артефакты

## Двухпрофильная live-приёмка

Приёмка выполнена 2026-08-14 на canonical
`/Users/zavx0z/repozitarium/metafor@b7807f32d`, ветка `main`, через exact
LaunchAgent `dev.metafor.hamiltonian` (`hamiltonian`, `127.0.0.1:4400`).
Authenticated `/lab/status` читался с локальным test-token, но сам bearer и
другие секреты в артефактах не сохранены. Chrome/profile и их storage во время
опыта не закрывались и не очищались.

### Причинные состояния

| Состояние | Host epoch | Profile `b04b5959-…` | Profile `06cb9ee3-…` | Topology |
|---|---|---|---|---|
| baseline committed `1.1.3` | `1a866410-4ddc-4d07-83ab-a5a137bf05fc` | logical Worker `45d8fde1-9ecb-4c83-b52a-095c974cb4a1`, execution `21fec270-876c-4dcc-8daa-9ae47284f171` | logical Worker `14fdce37-ce46-44cb-8697-cbcee2c7f810`, execution `136b17eb-c937-4e6b-8cf4-f65a34b88da7` | оба `identityConfirmed=true`, `workerUpdateRequired=false`, по две Window; baseline manifest SHA отдельно не читался |
| временный target `1.1.4` | `5980c25c-1b06-4820-93e1-8ab6bac2a9c0` | та же logical identity, новая execution `64f27ab2-e7a4-48b8-b2e1-7a3efd2d71ca` | та же logical identity, новая execution `b40530c9-2671-4feb-bcbb-8297620ca86b` | один одновременный authenticated snapshot: оба `identityConfirmed=true`, `workerUpdateRequired=false`, по две Window; heartbeat ACK движется |
| final committed `1.1.3` | `0ebbcf8a-9bfa-4e6c-91c8-02d06fe67f2e` | та же logical identity, ещё одна execution `161f4585-1d60-4c00-8af3-67952cb30a34` | та же logical identity, ещё одна execution `52134c71-ecdf-44e2-80ed-b5ef8b180b0c` | оба current, по две Window, final heartbeat ACK `14/14` и `8/8`, `failed/error` events после restart отсутствуют |

Временный manifest release: `1.1.4`, SHA-256
`61bed1d2dc21f069af62bbc277e0955d577aaeaacdca2847cced75641c130b44`.
Final committed manifest release: `1.1.3`, SHA-256
`0cfc5d19f08e86c0258730679a3b877a242f7f3393e04aa976c5201323d9428d`.
Для обеих logical identity host events отдельно зафиксировали
`service-worker-update-required 1.1.3 -> 1.1.4`, затем identity новой execution.

### `upd-001-11-final-two-profile.png`

Источник: `POST http://127.0.0.1:7880/cdp/screenshot` по stable CDP target
`7B227055B2489360CD83F7790823F8FF` после полного возврата обоих профилей к
committed `1.1.3`; второй наблюдаемый target —
`11E491A8B2D07463D406EBAF7948C35A`.

Ожидалось увидеть непустую Hamiltonian WebGPU-сцену с двумя отдельными
Chrome/profile compound и current Service Worker `1.1.3` в каждом. Фактически
снимок показывает оба compound, две Window внутри каждого, Service Worker с
`Версия кода 1.1.3` и восстановленные transport-линии. Размер `3840×2176`,
`191773` bytes; SHA-256
`e780638e92f80a3b3dfe2ca5c9670884771855a6fc27a09535b40de1af4c1c43`.
Оригинал находится здесь же в Git; чувствительных сведений снимок не содержит.

Оба stable target дополнительно наблюдались по 20 секунд через временные
`error`, `unhandledrejection` и `console.error` probes. Их `performance.timeOrigin`
остался соответственно `1786659954571.8` и `1786659965539.7`, document остался
`complete`, а все три error-массива — пустыми. Probes после чтения сняты; это
подтверждает отсутствие нового console error и reload loop в bounded final
интервале, но не является историей консоли до установки probe.
