# UI-004 — Артефакты integrated retained UI

Дата: 20 августа 2026 года. Версия capture:
`677871d9ba018daeb135fa8b5e3c52c6bd324a30`.

## components/{desktop,portrait,landscape}.png

* Источник: background exact-CDP canvas `@ui/components` через `UI dev`.
* Ожидание: historical five-panel public shell, активный Components route и
  package-owned preview видимы без пустого либо чёрного canvas.
* Фактическое наблюдение: desktop показывает public five-panel shell и Button
  preview; portrait/landscape показывают только preview, horizontal overflow
  отсутствует, console 0, native `1920×1088 @2` восстановлен.
* Чувствительные сведения: нет.
* Контрольные суммы: desktop
  `300ecdcee9967a55bc77af5b18d5f6f47e937ed4dd6f6918dd11f6594a016859`;
  portrait `9d0602642acaad8f39b98eec1160e31981de174ce01ad597faf2a39456d7a594`;
  landscape `a704755f4da0376602c8e6f4ea8a7f38e70884f4c3b93c76520cd37624d83fb3`.

## components-field/{desktop,portrait,landscape}.png

* Источник: background exact-CDP route `/field/values` через `UI dev`.
* Ожидание: universal Field controls видимы внутри package-owned retained
  preview, shell остаётся на месте, readiness и bounded counters опубликованы.
* Фактическое наблюдение: desktop показывает public shell и Values Field
  controls; mobile показывает только Field preview. DOM публикует exact Field
  owners/counters, console 0, native metrics восстановлены.
* Чувствительные сведения: нет.
* Контрольные суммы: desktop
  `c4f89d917dae7631972d396700988cf7cee86ecef0d463a5d952e3c867e04ac6`;
  portrait `b38aea655848c3d4760965f243f70ab60fac1abb9cfa5ecfee3ae8d994b5a5c3`;
  landscape `7d10d448e661740b69369d29c3e9e0c5fb7ebf709fbccff927e08d653c346dab`.

## fixture/{desktop,portrait,landscape}.png

* Источник: background exact-CDP canvas общего `@ui/playground` fixture через
  `UI dev`, с обязательным native restore.
* Ожидание: reusable shell/preview видимы; mobile показывает только preview,
  console чиста, native metrics восстановлены.
* Фактическое наблюдение: desktop показывает reusable shell, mobile — только
  preview; bounded retained counters опубликованы, console 0, native metrics
  восстановлены.
* Чувствительные сведения: нет.
* Контрольные суммы: desktop
  `90ef3aac532f85329ff310f7080c2472e077014eb29303874a1c53723b53a741`;
  portrait `d5ae41ee846b11484c1a37d69ece67044a3e21ce870c42837690c40bfd6f4a80`;
  landscape `b02ad7e580b24916f24508a949d275b38262f15878d7ab4931f41968286e7e41`.

## node-editor/desktop.png, portrait.png и landscape.png

* Источник: background exact-CDP viewport matrix route `/editor/scene` через
  `UI dev`, с обязательным native restore.
* Ожидание: полный retained Node Editor видим на desktop и mobile, Node bodies,
  text, Socket/Link endpoints не исчезают, horizontal overflow отсутствует.
* Фактическое наблюдение: полный Frame/Node/Socket/Link scene видим во всех
  viewport, body/text/endpoints сохранены, console 0, native metrics
  восстановлены. Это emulation, не physical-device proof.
* Чувствительные сведения: нет.
* Контрольные суммы: desktop
  `01ea4007b90160169963726d97461a1cbe11f84262b57dc9c649d56f514be379`;
  portrait `880b571d59e0fd7b19e34d19ff81e9c70d792d3fb07d712637dbd5b76404da0a`;
  landscape `2dfd6bcc07f497e4c578d84f0da1dfc499d9f4c36a2c6aef11b9c9b39ae6b885`.

## node-sockets/{desktop,portrait,landscape}.png

* Источник: background exact-CDP canvas route `/socket/types` через `UI dev`.
* Ожидание: виден только Socket catalog; standalone Fields и Parameters в
  preview отсутствуют.
* Фактическое наблюдение: показаны `19` Socket types и route-local catalog;
  standalone Fields/Parameters отсутствуют, console 0, native metrics
  восстановлены.
* Чувствительные сведения: нет.
* Контрольные суммы: desktop
  `39b43ea7e3816ac2feac74ea266094f0f86b243f13230a6d167deeac3d655254`;
  portrait `e6659ce6b86e37cf96e76a7b266bf8aab56f972ae55849e34d841de3122b13af`;
  landscape `7b33176368c3929caf329d78607ddaabb0aaae8ecb064fd8f7c541dee6461085`.

## node-comparison/{desktop,portrait,landscape}.png

* Источник: background exact-CDP canvas route `/comparison/blender` через
  `UI dev`.
* Версия проекта: UI-004.13 working tree на integration baseline
  `f9f3ace2d6110388db3a3fb3fc29f10e5559c248`.
* Ожидание: UI-owned Blender reference загружен рядом ровно с одной live
  representative Node; full scene и Socket catalog не примешаны.
* Фактическое наблюдение: TextureLoader, comparison marker и global marker
  достигли `ready` только перед capture; desktop отчётливо показывает
  оригинальную Blender 4.5.5 Noise Texture Node и одну live Noise Texture Node
  в равных slots. Portrait/landscape сохраняют compact contract с одной live
  Node; console 0, horizontal overflow отсутствует, native `1920×1088 @2`
  восстановлен.
* Чувствительные сведения: нет.
* Контрольные суммы: desktop
  `722ddb5b53e3d4a44c30822aa22eac568a60da018a3df43060f5a790dca7bad5`;
  portrait `fdc30313ed5cbe62fb0177b8368007c40fa599995e29ac2d92fbe1e1787d0ef0`;
  landscape `700bfba8aa435ea0c4c68587cf4866a9ec9837bc68e4ea39649e0ed9227cd915`.

## UI-004.14 hash route evidence

* Источник: `UI dev` background exact-target `open`, `reload`, `console` и
  viewport matrix; существующий canonical listener `node-ui`, PID `31521`, не
  перезапускался и не присваивался.
* Exact stable target: `809BF08D88E4582CA819EFE847FE1450`. Один и тот же ID
  последовательно навигирован на `/#/editor/scene`, `/#/socket/types` и
  `/#/comparison/blender`; target count на origin до/после каждой операции — `1`.
* Фактическое наблюдение: URL hash совпал с `nodePlaygroundHash`, route без
  префикса совпал с `nodePlaygroundRoute`, `nodeReferenceReady=ready`, console
  sample содержит `0` записей. Mobile emulation восстановила native
  `1920×1088 @2`; helper не создавал route tabs.
* Новые canvas capture не создавались: этот срез доказывает route identity, а
  не повторяет visual acceptance UI-004.13.

## UI-004.17 singleton target evidence

* Источник: `UI dev targets`, route `dom` navigation и exact-ID `close`.
* До correction эта задача создала шесть Node targets и две лишние Components
  targets. Закрыты только exact task-created IDs; pre-existing Components
  `D0775AE44CFF0E299A0C28EECB3872D2` сохранён.
* После correction: Node — один target `809BF08D88E4582CA819EFE847FE1450`;
  Components — один target `D0775AE44CFF0E299A0C28EECB3872D2`;
  fixture — один target `1AFE2E4404B88E32A4CBA6C26AF4C633`.
* Один и тот же ID каждого selector сохранился при навигации на другой route.
  Multiple origin targets теперь дают explicit ambiguity и никогда не создают
  ещё одну вкладку либо не закрываются молча.

Все captures созданы через background exact target; renderer activity emulation
не меняла OS/browser focus. `visible/focused` внутри отдельных capture phases —
CDP focus emulation, final restored targets вернулись в `hidden/unfocused`.
