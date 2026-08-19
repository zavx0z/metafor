# NODES-018 — Артефакты

## Точный contour NODES-018.5

* Источник: checkout `/Users/zavx0z/repozitarium/metafor-nodes-018`, branch
  `codex/nodes-018`, preparation checkpoint
  `09cb592839147b16d4912ae093f74010f3c756be`.
* Result checkpoint NODES-018.5:
  `0a4ce7f810d4b5731d1fc7db7a47dc52f675e35c`.
* Standalone origin: `http://127.0.0.1:4018/`.
* Exact CDP target: `8A6231C66CBD889C40FA2B6677BAC369`, exact URL
  `http://127.0.0.1:4018/`.
* Checkout-owned playground: PID `52416`, long-lived tool PTY session `52407`.
* Внешний normal playground `127.0.0.1:4016`, PID `68355`, сохранён без
  adoption, reload либо остановки.
* Native metrics до и после emulation: `1920×1088 @2`; final canvas
  `3840×2176`, `scrollWidth == innerWidth == 1920`.
* Среда: desktop CDP Chrome и mobile emulation; физическое устройство и owner
  visual acceptance не доказаны.
* Чувствительные сведения: нет.

## browser-evidence.json

* Источник: repeatable `node-system-dev browser.py evidence` на exact target.
* Дата: 2026-08-19.
* Ожидание: desktop, portrait `390×844 @2` и landscape `844×390 @2` готовы без
  horizontal overflow и console errors; atomic synthetic touch меняет pan и
  pinch, а helper всегда возвращает native metrics.
* Фактическое наблюдение: readiness `ready` и один content root подтверждены во
  всех трёх viewport; console count `0`; synthetic pan и pinch оба изменили
  transform; portrait, landscape и финальный native state не имеют
  horizontal overflow; обе restore-проверки вернули `1920×1088 @2`.
* Граница: synthetic `TouchEvent` и emulation не являются physical-device
  proof; exact canvas PNG не является whole-window screenshot.
* Размер: `19 291` bytes.
* SHA-256: `fc1ed8a507a9f8251d4503f8e471a76d481a18133bd5eb177a7b4013cf2f5d1c`.

## retained-performance.json

* Источник: repeatable `node-system-dev browser.py retained` и dev-only
  bounded observer actual `editor.node` graph.
* Дата: 2026-08-19.
* Ожидание: exact content root, component и geometry identities устойчивы;
  три `setCanvasTransform`, wheel и pinch увеличивают только
  `transformOnlyFrames`; transformed hit materializes только dirty selection;
  Link geometry endpoints равны exact Socket centers; Node body/text и fixed
  clip остаются действующими.
* Фактическое наблюдение: initial counters `{6,1,0}`; три transforms дали
  `{6,1,1}`, `{6,1,2}`, `{6,1,3}`, wheel — `{6,1,4}`, pinch — `{6,1,5}`.
  Actual transformed hit выбрал Node `scalar` и дал ровно `{7,2,5}`. Restore
  вернул исходные transform и Link selection; post-restore counters записаны
  отдельно как `{8,3,6}`. Единственный content root `object-188` и component
  identities не менялись в transform-only фазах. Representative Node
  `object-84` сохранил `28` geometry и `8` text objects на overview `0.26`;
  actual descendant/content-root `matrixWorld` ratios устойчивы. Для всех
  четырёх Links first/last vertices actual ribbon geometry равны raw
  source/target Socket centers; один framebuffer clip оставался неизменным.
* Поведение failure path: отдельный unit намеренно ломает transform phase и
  доказывает вызовы restore исходных transform/selection. Два найденных во
  время proof дефекта относились только к helper: узкий pixel-scale observer и
  hidden-target scheduling; production `.3/.4` не опровергнут. Helper теперь
  читает actual hierarchy с bounded samples, фокусирует exact target и
  сохраняет restore evidence.
* Размер: `173 111` bytes.
* SHA-256: `aa11056f6fc33ec40587dc4d3ba01ffa56d0f52903f8b029561770645fa3d812`.

## node-system-desktop.png

* Источник: exact WebGPU canvas target
  `8A6231C66CBD889C40FA2B6677BAC369`, native desktop `1920×1088 @2`.
* Дата: 2026-08-19.
* Ожидание: полный multi-panel catalog, Blender comparison, live Node и полный
  Node Editor без detached Socket/Link endpoints.
* Фактическое наблюдение: canvas `3840×2176` показывает все desktop regions;
  editor содержит полные Node bodies/text и Links, соединённые с Sockets.
  Reference crop является существующим comparison surface, а не NODES-017
  visual correction.
* Размер: `2 020 631` bytes.
* SHA-256: `532f377df770dfce1f91870d84888ca2cb06a75abc57b4e577efa11b00bf3800`.

## node-system-portrait.png

* Источник: exact WebGPU canvas того же target, emulated `390×844 @2`.
* Дата: 2026-08-19.
* Ожидание: один Node Editor без desktop catalogs, empty bodies, detached
  endpoints и horizontal overflow.
* Фактическое наблюдение: canvas `780×1688` содержит только editor; все шесть
  Nodes, body/text, Frames, Sockets и Links материализованы внутри viewport;
  DOM `scrollWidth == innerWidth == 390`.
* Размер: `59 839` bytes.
* SHA-256: `f650d15f7781ccf8a543a59b6eead44043cb604e548a841c2e6c308a8a66665d`.

## node-system-landscape.png

* Источник: exact WebGPU canvas того же target, emulated `844×390 @2`.
* Дата: 2026-08-19.
* Ожидание: один полный Node Editor без desktop catalogs, empty bodies,
  detached endpoints и horizontal overflow.
* Фактическое наблюдение: canvas `1688×780` показывает один editor с полной
  retained Node scene; Socket/Link endpoints соединены, viewport clip
  соблюдён; DOM `scrollWidth == innerWidth == 844`.
* Размер: `63 622` bytes.
* SHA-256: `cad41543e15ee0fafd88571a68f8eb5e04bd2a4da917f5685fb75f48dd1984cb`.
