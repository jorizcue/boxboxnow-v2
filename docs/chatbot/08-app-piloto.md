# App móvil "Vista Piloto"

## Qué es

**Vista Piloto** es la app móvil de BoxBoxNow (iOS y Android), pensada
para el piloto en pista. Muestra una rejilla de **tarjetas grandes con
información en directo** optimizadas para leerse de un vistazo a alta
velocidad. Se conecta al mismo backend que el panel web por WebSocket.

Se accede con la **misma cuenta** que el panel web. Al iniciar sesión
por primera vez se asocia el dispositivo al usuario.

## Layout

- **Vertical (portrait)**: 2 columnas de tarjetas.
- **Horizontal (landscape)**: 3 columnas.

El piloto puede forzar la orientación (libre / vertical / horizontal)
desde el menú lateral.

Las tarjetas escalan automáticamente para llenar la pantalla en función
del número de tarjetas visibles. Cuanto menos tarjetas, más grandes y
más legibles.

## Tarjetas disponibles

Las tarjetas se agrupan por temática:

### Grupo "Carrera"

- **Tiempo de carrera**: countdown de la carrera. En los últimos 10
  minutos se pone roja y parpadea.
- **Vuelta actual (tiempo real)**: tiempo de la vuelta en curso vía GPS.
- **Última vuelta**: tiempo de la última vuelta cerrada. Verde si fue
  mejor que la anterior, amarilla si fue peor.
- **Posición (tiempos medios)**: posición oficial.
- **Posición (clasif. real)**: posición ajustada (ver artículo
  Clasificación Real).
- **Gap kart delante** y **Gap kart detrás**: diferencia en segundos.
- **Vuelta media (20v)**: media móvil de las últimas 20 vueltas válidas.
- **Mejor 3 (3V)**: mejor secuencia de 3 vueltas consecutivas.
- **Media stint futuro**: ritmo necesario en próximos stints para
  cumplir el reglamento.
- **Vueltas hasta stint máximo**: cuántas vueltas te quedan antes del
  stint máximo (verde / naranja / rojo).
- **Ventana de pit**: PIT OPEN / PIT CLOSED.
- **PITS (realizados / mínimos)**: contador del tipo `2/3`.

### Grupo "Box" (requiere permiso "App: Box")

- **Puntuación Box**: el Box Score (0-100) en colores.
- **Pit en curso**: aparece a pantalla completa cuando el kart está en
  boxes. Reloj cuenta arriba desde 0:00 hasta el tiempo de pit
  configurado, en cyan, con animación de pulso.

### Grupo "GPS"

- **Delta vs Best Lap (GPS)**: delta en segundos respecto a tu mejor
  vuelta del stint, calculado en tiempo real con GPS.
- **G-Force (diana)**: diana visual mostrando aceleraciones laterales
  y longitudinales en tiempo real.
- **Delta vuelta anterior GPS**: delta vs la vuelta inmediatamente
  anterior.
- **Velocidad GPS**: velocidad instantánea en km/h del GPS.
- **G-Force (números)**: lectura numérica de las G laterales y de
  frenada.
- **Mejor vuelta stint**: la mejor vuelta del stint en curso, según el
  cronometraje oficial.

## Menú lateral

Tap en cualquier zona libre de la pantalla abre el menú lateral. Desde
ahí puedes:

- **Plantilla**: seleccionar una plantilla guardada (preset).
- **Contraste**: aumentar contraste/brillo para ver mejor con sol
  directo.
- **Orientación**: forzar libre / portrait / landscape.
- **Audio**: activar/desactivar la narración por voz al final de cada
  vuelta (lee última vuelta, posición y vueltas hasta stint máximo).
- **Salir**: volver a la lista de circuitos.

## Comportamiento general

- La pantalla se mantiene **encendida** mientras la vista del piloto
  está abierta (no se bloquea).
- Se fuerza el **brillo al máximo** automáticamente. Al salir se
  restaura el brillo previo.
- Si pierdes conexión aparece un banner rojo "Reconectando…" arriba.
  Las tarjetas mantienen el último valor recibido hasta que vuelve la
  conexión.
