/**
Window entrypoint действующего release.

Он подключает выбранную visual capability как часть уже проверенного
composition. Смысл состава принадлежит
[release owner law](../README.md#что-называется-выпуском).

@packageDocumentation
*/

const {runtime} = await import("@internal/visual")
console.debug("[@cosmos/release:main]", "Visual runtime подключён", {
  runtime: Object.keys(runtime),
})
