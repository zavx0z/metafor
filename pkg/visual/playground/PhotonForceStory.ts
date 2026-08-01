import {
  PHOTON_STORY_CLOSURE,
  PHOTON_STORY_PATCH,
  PHOTON_STORY_PREPARED_PROJECTION,
  PHOTON_STORY_PROVENANCE,
} from "./fixture/PhotonStoryFixture.ts"

export {
  PHOTON_STORY_CLOSURE,
  PHOTON_STORY_PATCH,
  PHOTON_STORY_PREPARED_PROJECTION,
  PHOTON_STORY_PROVENANCE,
}

export const PHOTON_STORY_PREPARED_SCENE = Object.freeze({
  atomId: 4,
  atomLabel: "lada-model",
  closure: PHOTON_STORY_CLOSURE,
  id: "force-story/photon/prepared",
  initialStateId: 19,
  initialStateName: "обращение к модели",
  ownerSrc: "zavx0z/lada-model",
  parentAtomId: 1,
  processId: 12,
  provenance: PHOTON_STORY_PROVENANCE,
  rootSrc: "zavx0z/lada",
  sourceSnapshot: PHOTON_STORY_PREPARED_PROJECTION,
  targetStateId: 20,
  targetStateName: "ошибка",
  transitionId: 26,
})

export const PHOTON_STORY_SCENARIO =
  "Из Cloud Force history восстановлен полный причинный срез lada-model непосредственно перед sequence 412. Входит записанный Photon replace по Atom 4 со State «ошибка»."

export const PHOTON_STORY_EXPECTED_VISUAL_OUTCOME =
  "Активность переключается с полного рукава «обращение к модели» на рукав «ошибка»: прежний рукав, Process 12 и его связи затухают, новый State, его Transition и Condition-связи подсвечиваются. Геометрия остаётся неизменной; Restart возвращает записанное состояние перед Photon."

export const PHOTON_STORY_HELP = [
  "В записанном состоянии lada-model находится в State «обращение к модели». Process попытался подготовить ответ, завершился ошибкой, и Field «Ошибка модели» уже содержит значение «Inference prompt is empty.». Это выполняет реальное Condition перехода в State «ошибка».",
  "Затем приходит записанная частица Photon от Matrix. Она меняет текущий State целевого Atom на «ошибка». Во всех четырёх отображениях обеих раскладок активный рукав «обращение к модели» и Process затухают, а полный рукав «ошибка» с его Transition и Condition-связями подсвечивается. Формы и их расположение внутри каждой раскладки не меняются.",
  "Restart возвращает точный подготовленный срез перед Photon: снова активен State «обращение к модели», Process и его причинные связи.",
].join("\n\n")
