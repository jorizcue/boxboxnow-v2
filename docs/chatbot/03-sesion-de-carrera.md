# Sesión de carrera

## Qué es una sesión de carrera

Una **sesión de carrera** agrupa todos los parámetros de una carrera
concreta: duración, número mínimo de pits, tiempo de pit, stints máximo
y mínimo, y el número del kart del equipo. Cada usuario tiene **una
sesión activa** en cada momento.

La sesión se configura desde la pestaña **Config** del panel y se guarda
automáticamente al pulsar "Actualizar sesión".

## Parámetros principales

- **Duración (min)**: duración total de la carrera en minutos. Se usa
  como referencia para todos los cálculos de tiempo restante. Por
  defecto 180.
- **Mínimo de pits**: número mínimo de paradas obligatorias por
  reglamento del evento. Por defecto 3.
- **Tiempo de pit (s)**: tiempo nominal en boxes. Por defecto 120
  (2 minutos). Sobrescribe al valor del circuito si difiere.
- **Stint máximo (min)**: máxima duración consecutiva permitida de un
  stint sin parar a boxes. Cuando el piloto se aproxima a este valor
  el indicador "Vueltas hasta stint máximo" empieza a parpadear y
  cambia a naranja/rojo.
- **Stint mínimo (min)**: tiempo mínimo en pista antes de que se abra
  la "ventana de pit". Si paras antes, el pit-stop puede no contar
  para el reglamento.
- **Tiempo mínimo por piloto (min)**: tiempo total acumulado que cada
  piloto debe estar en pista. Importante para carreras con cambios
  obligatorios de piloto.
- **Número de kart**: el kart del equipo (1, 2, 3…). Se usa para que
  el panel y la app móvil sepan cuál es "tu kart" y muestren la
  información personalizada (delta vs adelante, posición real, etc.).

## Parámetros de boxes

- **Líneas de box** (`boxLines`): número de calles disponibles en boxes
  (típicamente 2). Afecta al cálculo de la cola FIFO de pits.
- **Karts visibles en cola** (`boxKarts`): cuántos karts mostrar en la
  visualización de la cola FIFO de boxes. Por defecto 30.

## Ventana de pit cerrada

Algunas carreras imponen "minutos cerrados" al inicio o al final de la
carrera, durante los cuales no se permite parar. Se configuran como
**Pit cerrado al inicio (min)** y **Pit cerrado al final (min)**. La
tarjeta "Ventana de pit" del piloto pasa a "PIT CLOSED" en esos
intervalos.

## Cambiar el circuito de la sesión

En la pestaña Config puedes cambiar el circuito asociado a la sesión.
Al hacerlo, la app móvil del piloto re-aplica la línea de meta GPS del
nuevo circuito automáticamente sin necesidad de cerrar y volver a abrir
la app.
