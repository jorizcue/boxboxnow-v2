# Circuitos

## Qué es un circuito

Un **circuito** en BoxBoxNow es la pista física donde se corre la
carrera, junto con todos los parámetros que necesita el sistema para
conectarse al cronometraje en directo y calcular tiempos correctamente.

Cada usuario solo ve los circuitos a los que tiene acceso (gestionado
por el administrador). El circuito activo se selecciona al configurar
una nueva sesión de carrera.

## Campos de un circuito

Los administradores configuran cada circuito desde **Admin → Circuitos**
con estos campos:

- **Nombre**: nombre visible del circuito (p. ej. "Karting Santos").
- **Longitud (m)**: longitud de la pista en metros. Se usa para calcular
  velocidad y distancia recorrida.
- **Tiempo de pit (s)**: duración estándar de un pit-stop en segundos.
  Se usa como referencia en cálculos de stint y como tope visual del
  reloj "Pit en curso".
- **Vueltas a descartar**: número de vueltas iniciales que se ignoran
  al calcular medias (típicamente 1 o 2).
- **Diferencial de vuelta**: umbral en milisegundos para agrupar karts
  por ritmo. Vueltas que se desvían más de este valor se consideran
  "outliers" y se descartan en algunos cálculos.
- **Puerto WebSocket Apex** (`ws_port`): puerto del sistema Apex Timing.
- **URL de PHP API Apex**: endpoint REST de Apex para consultas de
  histórico (opcional).
- **Días de retención**: cuánto tiempo se guardan los datos brutos del
  circuito antes de purgarse.

## Línea de meta GPS

Si el circuito está configurado para detección de vueltas vía GPS, se
definen dos pares de coordenadas (`finish_lat1/lon1`,
`finish_lat2/lon2`) que forman un segmento virtual atravesando la línea
de meta. La app móvil del piloto detecta el cruce de ese segmento para
disparar la vuelta y calcular el delta vs mejor.

Si la línea de meta no está configurada, las funciones GPS de la app
móvil (delta, vuelta actual GPS, velocidad GPS) muestran "GPS --" pero
el resto de la información en directo sigue funcionando porque viene
del cronometraje oficial, no del GPS.

## Live Timing externo

Cada circuito puede tener una **URL de live timing** (la página oficial
del cronometraje) que se muestra dentro de la pestaña "Live" del panel,
embebida en un iframe. Es útil para ver el cuadro de tiempos del
organizador junto al panel de BoxBoxNow.
