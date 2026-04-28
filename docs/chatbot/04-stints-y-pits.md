# Stints y pit-stops

## Qué es un stint

Un **stint** es un periodo continuo de carrera entre dos pit-stops. Un
stint empieza cuando el kart sale del pit (evento `pitOut`) y termina
cuando vuelve a entrar (evento `pitIn`). El primer stint de la carrera
empieza desde la salida.

Cada kart lleva una numeración de stints (1, 2, 3…) y BoxBoxNow registra
para cada uno: piloto al volante, número de vueltas, mejor vuelta del
stint y duración total.

## Tarjeta "PITS" (realizados / mínimos)

En la app móvil y en el panel verás un contador del tipo `2/3`. El primer
número son los pits **ya realizados**; el segundo es el **mínimo
obligatorio** configurado en la sesión.

- Si te faltan pits, aparece "Faltan N" en naranja debajo.
- Cuando completas el mínimo obligatorio, el número se pone verde.

## Ventana de pit (pit window)

La **ventana de pit** es el intervalo durante el cual está permitido
parar a boxes para que el pit cuente como reglamentario:

- **PIT OPEN** (verde): puedes parar.
- **PIT CLOSED** (rojo, parpadeante): aún no puedes parar; debajo aparece
  un contador en formato M:SS con el tiempo restante hasta que se abra.

La ventana se abre cuando se cumplen las dos condiciones:

1. El stint actual ha durado al menos el "stint mínimo" configurado.
2. No estás dentro de los minutos de pit cerrado al inicio o al final
   de la carrera.

## "Pit en curso"

Cuando el kart está dentro de boxes, su `pitStatus` cambia a `in_pit`.
En ese momento:

- En la app móvil, **la pantalla cambia automáticamente** y muestra a
  pantalla completa el indicador "PIT EN CURSO" con un reloj cuenta
  arriba que va de `0:00` hasta el tiempo de pit configurado. Cuando
  el kart sale, vuelve la rejilla normal de tarjetas.
- En el panel web, el contador "PITS" se incrementa al detectar el
  evento de salida y la tarjeta "Pit en curso" del módulo Box muestra
  el tiempo transcurrido en directo.

El reloj cuenta el tiempo real desde la entrada al pit; no es un
estimación. Lo calcula a partir del countdown de carrera del momento
del pit-in.

## Vueltas hasta el stint máximo

La tarjeta "Vueltas hasta stint máximo" muestra cuántas vueltas más
puedes dar antes de tener que parar para no superar el stint máximo
configurado:

- **Verde**: tienes margen.
- **Naranja**: te quedan ≤ 5 vueltas, prepara la parada.
- **Rojo**: te quedan ≤ 2 vueltas, deberías parar ya.

## Mejor vuelta del stint

La tarjeta "Mejor vuelta stint" muestra la mejor vuelta del **stint
actual**, no de toda la carrera. Se reinicia al salir de cada pit. Es
útil para evaluar el ritmo del piloto que está actualmente al volante,
sin que las vueltas rápidas de stints anteriores la enturbien.
