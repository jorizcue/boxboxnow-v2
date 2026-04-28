# Box Score y cola FIFO de pits

## Qué es el Box Score

El **Box Score** es una puntuación de 0 a 100 que indica la **urgencia
estratégica** del pit-stop de tu kart respecto a la cola de boxes
prevista por el sistema. Cuanto más alto, mejor "ventana" tienes para
parar ahora.

Aparece en:

- La pestaña **Box** del panel web (módulo principal de la cola FIFO).
- La tarjeta "Puntuación Box" de la app móvil del piloto (grupo BOX).

## Código de colores

- **≥ 75 (verde)**: ventana excelente. Es el momento.
- **50–75 (amarillo)**: ventana razonable.
- **25–50 (naranja)**: ventana mala, pero hay que parar igual si
  estás obligado.
- **< 25 (rojo)**: peor momento posible para entrar.

## Cómo se calcula

El sistema mantiene una cola virtual de pits prevista y, cada vez que
recibe nuevas vueltas del cronometraje, recalcula:

1. La distancia restante hasta el final de carrera para cada kart.
2. Cuántos pits le quedan por hacer.
3. Cómo se solapan los pits previsibles de todos los karts en las
   líneas de box disponibles.

A partir de ahí asigna a cada posición de la cola una puntuación
inversa: el primero en la cola obtiene 100 (entrar ya), y va bajando
para los que están más alejados de su ventana óptima.

## Cola FIFO en el módulo Box

El módulo **Box** muestra la cola completa, no solo tu kart. Cada fila
tiene:

- **Línea**: a qué calle de box le toca (1, 2, …).
- **Kart número** y nombre del piloto/equipo.
- **Score** del kart (mismo color que arriba).
- **Pits realizados** y **vueltas del stint actual**.

Pulsa sobre una fila para abrir el detalle de un kart concreto: sus
últimos tiempos de vuelta, pilotos que han conducido, mejor vuelta del
stint y media móvil de 20 vueltas.

## Diferencia con "Vueltas hasta stint máximo"

No los confundas:

- "**Vueltas hasta stint máximo**" es una restricción dura: si las
  superas, **rompes** el reglamento del evento (stint demasiado largo).
- "**Box Score**" es una recomendación blanda: puntuación de qué tan
  buena es la ventana **ahora** para parar respecto al resto de la cola.
