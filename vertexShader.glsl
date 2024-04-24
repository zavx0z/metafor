#version 300 es
in vec2 position;
uniform float iTime;
out float vTime; // Передаем время во фрагментный шейдер
void main() {
    float amplitude = 0.8f; // Амплитуда пульсации
    float baseSize = 3.0f; // Начальный размер точки
    vTime = iTime; // Передаем текущее время во фрагментный шейдер

    gl_Position = vec4(position, 0.0f, 1.0f);
    gl_PointSize = baseSize + sin(iTime) * amplitude; // Пульсирующий размер точки
}