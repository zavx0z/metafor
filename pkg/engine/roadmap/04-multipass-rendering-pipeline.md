# Подзадача 4: Многопроходный конвейер рендеринга

## 📁 Затронутые файлы

- `src/renderer/index.ts` (полная переработка метода render)
- `src/renderer/shaders/glass.wgsl` (новый шейдер для стекла)
- `src/ui/UIDisplay.ts` (обновление фонового материала)

## 🎯 Цель

Реализовать финальный конвейер рендеринга из 4 пассов:

1. Offscreen-рендеринг сцены (без UI)
2. Горизонтальное размытие
3. Вертикальное размытие
4. Финальная композиция (сцена + UI с эффектом стекла)

## 📋 Что сделать

### Шаг 1: Создать шейдер для стеклянных панелей

Новый файл `src/renderer/shaders/glass.wgsl`:

```wgsl
// Uniforms для настроек стекла
struct GlassUniforms {
    tintColor: vec4<f32>,
    opacity: f32,
    blurIntensity: f32,
};

@group(1) @binding(0) var<uniform> glassUniforms: GlassUniforms;
@group(1) @binding(1) var mySampler: sampler;
@group(1) @binding(2) var blurredTexture: texture_2d<f32>;

@fragment
fn fs_main(
    @builtin(position) frag_coord: vec4<f32>,
    @location(0) uv: vec2<f32>
) -> @location(0) vec4<f32> {
    // Получаем UV экранных координат
    let textureSize = vec2<f32>(textureDimensions(blurredTexture));
    let screenUV = frag_coord.xy / textureSize;
    
    // Сэмплируем размытую текстуру фона
    let blurredColor = textureSample(blurredTexture, mySampler, screenUV);
    
    // Применяем тонирование
    let tintedColor = mix(blurredColor.rgb, glassUniforms.tintColor.rgb, glassUniforms.tintColor.a);
    
    // Возвращаем с учетом прозрачности
    return vec4<f32>(tintedColor, glassUniforms.opacity);
}
```

### Шаг 2: Обновить метод render в Renderer

Полностью переработать метод `render()`:

```typescript
public render(scene: Scene, viewPoint: ViewPoint): void {
    // 1. Подготовка ресурсов
    this.updateTextures();
    this.updateOffscreenTextures();
    
    const commandEncoder = this.device.createCommandEncoder();
    
    // 2. Разделение объектов по типам
    const { glassObjects, regularObjects, uiObjects } = 
        this.collectSceneObjectsByType(scene, viewPoint.camera);
    
    // 3. Пасс 1: Offscreen-рендеринг сцены (без UI)
    this.renderOffscreenPass(commandEncoder, regularObjects, viewPoint);
    
    // 4. Пасс 2 и 3: Размытие (пинг-понг между текстурами)
    this.applyBlur(commandEncoder, this.offscreenTexture, this.blurredIntermediateTexture, true);
    this.applyBlur(commandEncoder, this.blurredIntermediateTexture, this.finalBlurredTexture, false);
    
    // 5. Пасс 4: Финальная композиция
    this.renderFinalPass(commandEncoder, scene, viewPoint, regularObjects, glassObjects, uiObjects);
    
    // Отправка команд
    this.device.queue.submit([commandEncoder.finish()]);
}
```

### Шаг 3: Реализовать метод renderOffscreenPass

```typescript
private renderOffscreenPass(
    commandEncoder: GPUCommandEncoder,
    objects: RenderItem[],
    viewPoint: ViewPoint
): void {
    const offscreenPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [{
            view: this.offscreenTexture.createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: [0, 0, 0, 0] // Прозрачный фон
        }],
        depthStencilAttachment: {
            view: this.offscreenDepthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store'
        }
    };
    
    const passEncoder = commandEncoder.beginRenderPass(offscreenPassDescriptor);
    this.renderObjects(passEncoder, objects, viewPoint);
    passEncoder.end();
}
```

### Шаг 4: Реализовать метод renderFinalPass

```typescript
private renderFinalPass(
    commandEncoder: GPUCommandEncoder,
    scene: Scene,
    viewPoint: ViewPoint,
    regularObjects: RenderItem[],
    glassObjects: RenderItem[],
    uiObjects: RenderItem[]
): void {
    const finalPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [{
            view: this.context.getCurrentTexture().createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: scene.background.toArray()
        }],
        depthStencilAttachment: {
            view: this.depthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store'
        }
    };
    
    const passEncoder = commandEncoder.beginRenderPass(finalPassDescriptor);
    
    // 5a. Рендеринг обычных объектов сцены
    this.renderObjects(passEncoder, regularObjects, viewPoint);
    
    // 5b. Рендеринг стеклянных объектов с доступом к размытой текстуре
    if (glassObjects.length > 0) {
        passEncoder.setPipeline(this.glassRenderPipeline);
        
        // Создаем bind group с размытой текстурой для стекла
        const glassBindGroup = this.device.createBindGroup({
            layout: this.glassRenderPipeline.getBindGroupLayout(1),
            entries: [
                { binding: 0, resource: { buffer: this.glassUniformBuffer } },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: this.finalBlurredTexture.createView() }
            ]
        });
        
        passEncoder.setBindGroup(1, glassBindGroup);
        this.renderObjects(passEncoder, glassObjects, viewPoint, true);
    }
    
    // 5c. Рендеринг обычного UI (текст, кнопки без эффекта стекла)
    this.renderObjects(passEncoder, uiObjects, viewPoint);
    
    passEncoder.end();
}
```

### Шаг 5: Обновить UIDisplay для использования GlassMaterial

В `src/ui/UIDisplay.ts` заменить MeshBasicMaterial на GlassMaterial:

```typescript
// В конструкторе UIDisplay:
this.backgroundMesh = new Mesh(
    new PlaneGeometry({ width: this.physicalWidth, height: this.physicalHeight }),
    new GlassMaterial({ tintColor: background }) // background - Color с альфа
);
```

## ✅ Ожидаемый результат

1. Полный 4-пассовый конвейер рендеринга
2. Стеклянные панели показывают размытый фон сцены
3. Обычный UI рендерится поверх эффекта стекла
4. Производительность оптимизирована через compute-шейдеры

## 📊 Производительность

- 1 дополнительный render pass (offscreen)
- 2 compute pass (размытие)
- 1 финальный render pass с композицией

## 🔧 Зависимости

- Все предыдущие подзадачи (GlassMaterial, offscreen текстуры, compute шейдеры)
- Наличие метода `renderObjects` в рендерере
