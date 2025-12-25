import { PCFSoftShadowMap, PerspectiveCamera, Scene, WebGLRenderer } from "three"

export const meta = MetaFor("canvas", {
  desc: `Менеджер конечных автоматов.`,
})
  .context((t) => ({
    fov: t.number.required(75, { label: "" }),
    aspect: t.number.optional(),
    near: t.number.optional(0.1),
    far: t.number.optional(1000),
    antialias: t.boolean.optional(true),
    shadowMapEnable: t.boolean.optional(true),
    shadowMapType: t.enum(PCFSoftShadowMap).optional(PCFSoftShadowMap, { label: "" }),
    clearColor: t.number.required(0x222222),
    width: t.number.optional(),
    height: t.number.optional(),
  }))
  .states({
    "сбор данных из DOM": {
      "инициализация сцены": {
        aspect: { null: false },
        width: { null: false },
        height: { null: false },
      },
    },
    "инициализация сцены": {
      "инициализация рендерера": {},
    },
    "инициализация камеры": {
      "инициализация рендерера": {},
    },
    "инициализация рендерера": {
      "добавление рендерера в DOM": {},
    },
    "добавление рендерера в DOM": {
      "обработка изменения размера окна": {},
    },
    "обработка изменения размера окна": {
      "добавление освещения в сцену": {},
    },
    "добавление освещения в сцену": {
      "инициализация WebXR": {},
    },
    "инициализация WebXR": {},
  })
  .core({
    /** @type {Scene|null} */
    scene: null,
    /** @type {PerspectiveCamera|null} */
    camera: null,
    /** @type {WebGLRenderer|null} */
    renderer: null,
  })
  .processes((process) => ({
    "сбор данных из DOM": process()
      .action(() => {
        const width = window.innerWidth
        const height = window.innerHeight
        return {
          width,
          height,
          aspect: width / height,
        }
      })
      .success(({ data, update }) => update(data))
      .error(({ error }) => console.log(error)),
    "инициализация сцены": process()
      .action(async ({ core }) => {
        const { Scene } = await import("three")
        core.scene = new Scene()
      })
      .success(({ data, update }) => update({}))
      .error(({ error }) => console.log(error)),
    "инициализация камеры": process()
      .action(async ({ core, context, fields }) => {
        const { PerspectiveCamera } = await import("three")
        const camera = new PerspectiveCamera(context.fov, context.aspect ?? fields.aspect.default, 0.1, 1000)
        camera.position.set(0, 1.6, 0)
        core.camera = camera
      })
      .success(() => {})
      .error(({ error }) => console.log(error)),
    "инициализация рендерера": process()
      .action(async ({ context, fields, core }) => {
        const { WebGLRenderer, PCFSoftShadowMap } = await import("three")
        const renderer = new WebGLRenderer({ antialias: context.antialias ?? fields.antialias.default })
        renderer.setSize(window.innerWidth, window.innerHeight)
        renderer.setClearColor(context.clearColor)
        renderer.shadowMap.enabled = context.shadowMapEnable ?? fields.shadowMapEnable.default
        renderer.shadowMap.type = PCFSoftShadowMap
        core.renderer = renderer
      })
      .success(() => {})
      .error(({ error }) => console.log(error)),
    "добавление рендерера в DOM": process()
      .action(async ({ core }) => {
        if (!core.renderer) throw new Error("Рендерер отсутствует")
        const MetaXR = document.getElementsByTagName("metafor")[0]
        if (!MetaXR) throw new Error("Родительский элемент отсутствует")
        MetaXR.append(core.renderer.domElement)
      })
      .success(() => {})
      .error(({ error }) => console.log(error)),
    "обработка изменения размера окна": process()
      .action(async ({ core }) => {
        const handler = () => {
          if (!core.camera) throw new Error("Камера отсутствует")
          if (!core.renderer) throw new Error("Рендерер отсутствует")
          core.camera.aspect = window.innerWidth / window.innerHeight
          core.camera.updateProjectionMatrix()
          core.renderer.setSize(window.innerWidth, window.innerHeight)
        }
        window.addEventListener("resize", () => handler)
      })
      .success(() => {})
      .error(({ error }) => console.log(error)),
    "добавление освещения в сцену": process()
      .action(async ({ core }) => {
        if (!core.scene) throw new Error("Сцена отсутствует")
        const { DirectionalLight } = await import("three")
        const directionalLight = new DirectionalLight(0xffffff, 0.8)
        directionalLight.position.set(10, 10, 5)
        directionalLight.castShadow = true
        core.scene.add(directionalLight)
      })
      .success(() => {})
      .error(({ error }) => console.log(error)),
    "инициализация WebXR": process()
      .action(async ({ core }) => {
        if (!core.renderer) throw new Error("Рендерер отсутствует")
        const { VRButton } = await import("three/addons/webxr/VRButton.js")
        // Проверка поддержки WebXR
        async function checkWebXRSupport() {
          if (!navigator.xr) {
            console.warn("WebXR не поддерживается в этом браузере")
            return false
          }

          try {
            const isSupported = await navigator.xr.isSessionSupported("immersive-vr")
            console.log("WebXR immersive-vr поддерживается:", isSupported)
            return isSupported
          } catch (error) {
            console.error("Ошибка проверки WebXR:", error)
            return false
          }
        } // Проверка поддержки WebXR
        async function checkWebXRSupport() {
          if (!navigator.xr) {
            // console.warn("WebXR не поддерживается в этом браузере")
            return false
          }

          try {
            const isSupported = await navigator.xr.isSessionSupported("immersive-vr")
            // console.log("WebXR immersive-vr поддерживается:", isSupported)
            return isSupported
          } catch (error) {
            console.error("Ошибка проверки WebXR:", error)
            return false
          }
        }
        const isSupported = await checkWebXRSupport()

        if (isSupported) {
          // Включаем WebXR только после проверки поддержки
          core.renderer.xr.enabled = true

          // Добавляем VR кнопку только если WebXR поддерживается
          const vrButton = VRButton.createButton(core.renderer)
          document.body.appendChild(vrButton)

          // console.log("WebXR инициализирован успешно")
        } else {
          // console.log("WebXR недоступен, работаем в обычном режиме")
        }
      })
      .success(() => {})
      .error(({ error }) => console.log(error)),
  }))
  .reactions()
  .view({
    render: ({ html, state }) => html`${state === "инициализация WebXR" && html`<meta-for src="meta/webxr.js" />`}`,
  })
