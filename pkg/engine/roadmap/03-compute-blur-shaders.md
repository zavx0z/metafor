# Подзадача 3: Compute-шейдеры для размытия по Гауссу

## 📁 Затронутые файлы

- `src/renderer/shaders/blur.wgsl` (новый)
- `src/renderer/index.ts` (добавление пайплайнов и бинд-групп)

## 🎯 Цель

Реализовать двухпроходное размытие по Гауссу (горизонтальное + вертикальное) через compute-шейдеры с оптимизацией через общую память workgroup.

## 📋 Что сделать

### Шаг 1: Создать файл с шейдерами

Новый файл `src/renderer/shaders/blur.wgsl`:

```wgsl
// Константы для размытия
const RADIUS = 4u;
const WORKGROUP_SIZE = 64u;
const TILE_SIZE = WORKGROUP_SIZE + (RADIUS * 2u);

// Веса Гаусса для 5 семплов (радиус 4)
const GAUSS_WEIGHTS = array<f32, 5>(
    0.227027,   // center
    0.1945946,  // ±1
    0.1216216,  // ±2
    0.054054,   // ±3
    0.016216    // ±4
);

// Общая память для workgroup
var<workgroup> tile: array<vec4<f32>, TILE_SIZE>;

// Горизонтальный проход размытия
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(WORKGROUP_SIZE, 1, 1)
fn blur_horizontal(
    @builtin(workgroup_id) workgroup_id: vec3<u32>,
    @builtin(local_invocation_id) local_id: vec3<u32>
) {
    let group_start_coord = workgroup_id.x * WORKGROUP_SIZE;
    let y_coord = workgroup_id.y;
    
    // Загружаем тайл в shared memory с учетом радиуса размытия
    for (var i = local_id.x; i < TILE_SIZE; i = i + WORKGROUP_SIZE) {
        let read_x = i32(group_start_coord + i - RADIUS);
        let image_coord = vec2<i32>(read_x, i32(y_coord));
        tile[i] = textureLoad(inputTexture, image_coord, 0);
    }
    workgroupBarrier();
    
    // Вычисляем размытие для этого потока
    let output_local_coord = local_id.x;
    let tile_read_coord = output_local_coord + RADIUS;
    
    // Применяем фильтр Гаусса
    var result = tile[tile_read_coord] * GAUSS_WEIGHTS[0];
    for (var i = 1u; i <= RADIUS; i = i + 1u) {
        let weight = GAUSS_WEIGHTS[i];
        result += tile[tile_read_coord - i] * weight;
        result += tile[tile_read_coord + i] * weight;
    }
    
    // Записываем результат
    let output_global_coord = vec2<i32>(
        i32(group_start_coord + output_local_coord),
        i32(y_coord)
    );
    textureStore(outputTexture, output_global_coord, result);
}

// Вертикальный проход размытия
@compute @workgroup_size(1, WORKGROUP_SIZE, 1)
fn blur_vertical(
    @builtin(workgroup_id) workgroup_id: vec3<u32>,
    @builtin(local_invocation_id) local_id: vec3<u32>
) {
    let group_start_coord = workgroup_id.y * WORKGROUP_SIZE;
    let x_coord = workgroup_id.x;
    
    // Загружаем тайл в shared memory (транспонированные координаты)
    for (var i = local_id.y; i < TILE_SIZE; i = i + WORKGROUP_SIZE) {
        let read_y = i32(group_start_coord + i - RADIUS);
        let image_coord = vec2<i32>(i32(x_coord), read_y);
        tile[i] = textureLoad(inputTexture, image_coord, 0);
    }
    workgroupBarrier();
    
    // Вычисляем размытие
    let output_local_coord = local_id.y;
    let tile_read_coord = output_local_coord + RADIUS;
    
    var result = tile[tile_read_coord] * GAUSS_WEIGHTS[0];
    for (var i = 1u; i <= RADIUS; i = i + 1u) {
        let weight = GAUSS_WEIGHTS[i];
        result += tile[tile_read_coord - i] * weight;
        result += tile[tile_read_coord + i] * weight;
    }
    
    // Записываем результат
    let output_global_coord = vec2<i32>(
        i32(x_coord),
        i32(group_start_coord + output_local_coord)
    );
    textureStore(outputTexture, output_global_coord, result);
}
```

### Шаг 2: Добавить загрузку шейдера в Renderer

В `src/renderer/index.ts` добавить:

```typescript
class Renderer {
    // ... существующие свойства ...
    private blurComputePipelineHorizontal: GPUComputePipeline;
    private blurComputePipelineVertical: GPUComputePipeline;
    private blurShaderModule: GPUShaderModule;
    
    // В методе init или отдельном методе setupComputePipelines:
    private async setupComputePipelines(): Promise<void> {
        // Загружаем WGSL код
        const blurShaderCode = await this.loadShader('blur.wgsl');
        this.blurShaderModule = this.device.createShaderModule({
            code: blurShaderCode
        });
        
        // Создаем пайплайн для горизонтального размытия
        this.blurComputePipelineHorizontal = this.device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: this.blurShaderModule,
                entryPoint: 'blur_horizontal'
            }
        });
        
        // Создаем пайплайн для вертикального размытия
        this.blurComputePipelineVertical = this.device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: this.blurShaderModule,
                entryPoint: 'blur_vertical'
            }
        });
    }
    
    // Вспомогательный метод для загрузки шейдеров
    private async loadShader(name: string): Promise<string> {
        const response = await fetch(`/shaders/${name}`);
        return await response.text();
    }
}
```

### Шаг 3: Создать метод для выполнения compute-пасса

Добавить метод `applyBlur()` в Renderer:

```typescript
private applyBlur(
    commandEncoder: GPUCommandEncoder,
    inputTexture: GPUTexture,
    outputTexture: GPUTexture,
    horizontal: boolean
): void {
    const computePass = commandEncoder.beginComputePass();
    
    const pipeline = horizontal 
        ? this.blurComputePipelineHorizontal 
        : this.blurComputePipelineVertical;
    
    computePass.setPipeline(pipeline);
    
    // Создаем bind group для передачи текстур в шейдер
    const bindGroup = this.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: inputTexture.createView()
            },
            {
                binding: 1,
                resource: outputTexture.createView()
            }
        ]
    });
    
    computePass.setBindGroup(0, bindGroup);
    
    // Вычисляем количество workgroup
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    if (horizontal) {
        const workgroupCountX = Math.ceil(width / 64);
        computePass.dispatchWorkgroups(workgroupCountX, height);
    } else {
        const workgroupCountY = Math.ceil(height / 64);
        computePass.dispatchWorkgroups(width, workgroupCountY);
    }
    
    computePass.end();
}
```

## ✅ Ожидаемый результат

1. Готовые compute-шейдеры для двухпроходного размытия Гаусса
2. Оптимизация через shared memory workgroup
3. Compute-пайплайны готовы к использованию в рендерере
4. Метод `applyBlur` можно интегрировать в основной цикл рендеринга

## 🧮 Производительность

- Каждый проход: ~(width/64 *height) workgroups для горизонтального, (width* height/64) для вертикального
- Использование shared memory уменьшает количество обращений к глобальной памяти

## 🔧 Зависимости

- WebGPU должен поддерживать compute-шейдеры
- Текстуры должны быть созданы с флагом `STORAGE_BINDING`
