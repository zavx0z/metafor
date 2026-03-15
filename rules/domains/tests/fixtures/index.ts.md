# Fixture

`fixture/` содержит служебные test-only функции домена.

В `fixture/index.ts` размещаются и экспортируются функции для управления test environment и store-состоянием:

- `reset`
- `clear`
- `restore`
- `snapshot`
- test init helpers

Такие функции не должны входить в основной runtime-функционал домена и не должны экспортироваться из основного `index.ts`.

Если домен мыслится как отдельная worker-среда, его lifecycle управляется снаружи, а не через внутренний reset production API.
