# MF-415 — Артефакты

Три снимка получены 2026-08-08 из временного Hamiltonian host текущего
рабочего дерева на основе `c34bd25ef868daad2c29ca4659e396790a0ce514`.
Host был запущен на случайном localhost port; уже работавший пользовательский
listener `4400` не останавливался и не перезапускался. Join token на снимках не
виден и в артефакты не записан. Чувствительные сведения отсутствуют: сохранены
только тестовые topology identifiers, presentation coordinates и публичные
счётчики стенда.

## v15-libavoid-initial.png

* Источник: Chrome, обычная страница Hamiltonian, WebGPU HUD.
* Ожидание: 7 нод, 9 связей, `live`; пропорциональная Flex-геометрия без
  пустого canvas или ошибки Libavoid.
* Фактическое наблюдение: ожидание выполнено; initial ELK placement отрисован с
  серверными orthogonal Libavoid routes.
* Контрольная сумма: `082b4361321132043b1ede53e40cbf6c79da6cbdce7a6aa1e0065ba3bf6ffc06`.

## v15-libavoid-add-window.png

* Источник: первая Chrome Window после открытия второй вкладки того же profile.
* Ожидание: 8 нод, прежний каркас остаётся на местах, новая Window появляется
  отдельно, новые линии orthogonal.
* Фактическое наблюдение: ожидание выполнено; host status одновременно видел
  две Window одного connection на topology revision `6`.
* Контрольная сумма: `3f5e8d57e9ef6a12861130e6244598774c881de53d502553a397a7aae670d96e`.

## v15-libavoid-remove-window.png

* Источник: та же первая Chrome Window после закрытия только второй вкладки.
* Ожидание: возврат к 7 нодам и 9 связям без перестановки surviving nodes и без
  маршрута удалённой Window.
* Фактическое наблюдение: ожидание выполнено; host status видел одну Window на
  topology revision `8`.
* Контрольная сумма: `0f7e7c5ec664843c4fa3e146e99bac262901f56bcf31ab1096ece2c4e39a3d84`.

## v16 — drag, persistence и непрерывный Bézier stroke

Сценарий выполнен на том же отдельном temporary-origin
`http://127.0.0.1:49782`; listener пользователя `4400` и его PID `40650` не
останавливались и не перезапускались.

* `v16-drag-before.png` — исходная сцена перед drag. SHA-256:
  `01b549058b5ff313e9ed3d2ec3740f750dec59de102b1ad4c615466722394eec`.
* `v16-drag-after.png` — `This Window` вручную перемещена в graph coordinates;
  остальные карточки сохранили положение, inspector обновился, server-side
  Libavoid выполнил reroute. SHA-256:
  `9ba769b819024ad258130e45ef86cb3070bc58cd594f7809f7749ae6aa121eee`.
* `v16-drag-reload.png` — промежуточный reload до исправления разрывов между
  отдельными sampled line meshes. SHA-256:
  `b9e22f564ed5510bc1cd875f17d856e2dbbd3f28e5e115f5cfda9e44169a85fc`.
* `v16-drag-reload-continuous.png` — финальный connected polyline mesh:
  прямые участки сплошные, Libavoid corners скруглены Bézier-сегментами,
  сохранённый Window anchor применён после reload. SHA-256:
  `b4571fbdf135f2f530f601a1403c6464d0d093ce2db7a1f4c73d0e2a4e7e50dc`.

Точные graph coordinates, счётчики applied/ignored anchors и результат WebGPU
capture находятся в `v16-drag-evidence.json`. Capture текущего source дал два
render pass, 306 draw calls и ноль WebGPU validation errors. Сохранённая
Window-position совпала после reload; anchor исчезнувшего physical control
connection не удерживал отсутствующую ноду. Финальный полный suite завершился:
92 tests, 0 failures, 447 assertions.

## v19 — edge hover, observer viewport, resize и group placement

* `v17-live-before.png` — новая сцена без постоянных edge labels. SHA-256:
  `6fd118fda7a18bd67acad20854bb1407b63da115396d231391ed5621ea761949`.
* `v17-resize-right.png` — `This Window` расширена правой границей; sockets и
  Libavoid routes следуют за новой шириной. SHA-256:
  `eeae094e97b083e8122c825904f8f806c995be1aecd17f3b4ae110ef3706dcd2`.
* `v19-resize-viewport-restored.png` — после reload восстановлены ширина,
  position и observer viewport. SHA-256:
  `316ec1a4363380d3498ff32e42ff636686b43f84c8a1145ccd06f0e1808c2500`.
* `v19-box-selection.png` — рамкой одновременно выбраны `main-probe` и
  `worker-probe`. SHA-256:
  `35e318891a376549d4b649b1b8172e779752b58e6927ccd91bc3313044d114d8`.
* `v19-group-move-final.png` — выбранная группа перемещена одним drag и одним
  последующим server-side reroute. SHA-256:
  `48412cb087460e9bf267a6169ad0f51ff2f8d149baffa03301d9253608b999f5`.
* `v19-edge-hover-tooltip.png` — постоянная подпись скрыта; hovered edge
  подсвечен, а `Bun peer supervision` показан рядом с cursor. SHA-256:
  `be7c648f08eb2b87860be7971e88eaf69fb4ceabb19070ac06d703caad49ed24`.
* `v19-interaction-evidence.json` — точные left/right resize coordinates,
  неизменный противоположный край, group positions, viewport и post-reload
  applied counters. SHA-256:
  `2571b34d2301744c79e54f39f4b90066889c1d20341f958d42300e12b598cfa0`.

На live `v19` правая граница дала `{x:1143.6,width:513.4050301810864}`;
левая — `{x:979.2908115358819,width:677.7142186452045}`, при этом правый
край остался точно `1657.0050301810864`. После отдельного reload сцена
сообщила `knownAnchors=3`, `positionsApplied=3`, `widthsApplied=3` и
`anchorsApplied=3`; observer viewport восстановился как
`{x:100.59999999999991,y:167.324807641284,scale:0.7120721676837358}`.
Финальный полный Hamiltonian + node/UI suite: 103 tests, 0 failures,
482 assertions; тестовых child processes после него не осталось, а live
`v19` продолжил работать на единственном listener `4400`.

## v20 — hover сохраняет edge tone

* `v20-edge-tone-before.png` — исходная `v20`-сцена перед наведением.
  SHA-256: `f9ec48b2828908280ef200a5027763776fe61b5739b050c2041a7f223f264de8`.
* `v20-edge-tone-hover.png` — `Bun.spawn IPC` попал в hover-corridor: stroke
  стал толще, сохранил собственный cyan tone, tooltip появился рядом с cursor.
  SHA-256: `b6ee36da50e6a4fe0b60a6a52531c5306c82afea680eb4ecb8e29559c17b47db`.

Проверено на прежнем единственном listener `4400`; общий
`palette.borderBright` для hovered edges больше не используется.

## v22 — полупрозрачные карточки

* `v22-translucent-nodes-canvas.png` — прямой захват WebGPU canvas: в
  центральном перекрытии edges и нижние карточки видны через body/header
  верхних нод, а borders, typography и sockets остаются контрастными.
  SHA-256: `9adc459e9dad8aa75b98384a56eee0ba68b0344bba2a5ef02ae0a5843dd7557a`.

Системный Chrome screenshot на этом экземпляре вернул серую поверхность без
canvas pixels, поэтому визуальный факт подтверждён прямым
`HTMLCanvasElement.toDataURL("image/png")` capture по правилу canvas-приложений.
Первый рамочный вариант `v21` был отклонён до фиксации evidence: `fill:null` в
текущем `RoundedRectMaterial` дал белую заливку. В `v22` border pass использует
явный прозрачный fill и потому не перекрывает полупрозрачный body.
