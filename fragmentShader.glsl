#version 300 es
precision highp float;
uniform float iTime;
out vec4 fragColor;

void main() {
  // Установите значения для интенсивности и частоты пульсации
    float amplitude = 1.5f; // Измените это значение для управления интенсивностью пульсаций
    float frequency = 1.0f; // Измените, чтобы пульсации были быстрее или медленнее

  // Вычисляем координаты цвета с учетом пульсации
    vec3 color = 0.5f + amplitude * cos(iTime * frequency + vec3(0.0f, 2.0f, 4.0f));

  // Находим расстояние от центра фрагмента до центра точки.
    vec2 coord = gl_PointCoord - vec2(0.5f, 0.5f);
    float radius = dot(coord, coord);

  // Проверяем, находится ли фрагмент внутри круга с радиусом меньше 0.5.
    if(radius > 0.25f) // 0.5^2 = 0.25
        discard; // Отбрасываем фрагменты за пределами круга.

  // Устанавливаем цвет фрагмента
    fragColor = vec4(color, 1.0f);
}