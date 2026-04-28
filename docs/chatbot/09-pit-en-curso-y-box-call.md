# Pit en curso y BOX call

## Tarjeta "Pit en curso"

La tarjeta **"Pit en curso"** del grupo Box muestra el tiempo
transcurrido desde que tu kart entró a boxes. Solo está activa mientras
`pitStatus == "in_pit"`. Cuando el kart está en pista, muestra `--:--`
y la etiqueta "inactivo".

### En la app móvil

Cuando el kart entra a boxes, **toda la pantalla** del piloto cambia y
deja sólo este indicador, en grande:

- Cabecera "PIT EN CURSO" con animación de pulso, en cyan.
- Reloj M:SS gigante (ocupa casi toda la pantalla), también en cyan,
  monoespaciado.
- Subtítulo "/ M:SS" con el **tiempo de pit configurado** en la sesión
  de carrera (referencia visual del tope esperado).

Cuando el kart sale del pit, la rejilla normal de tarjetas vuelve
automáticamente.

### Cálculo

El reloj cuenta desde 0 segundos en el momento exacto en que el sistema
recibió el evento `pitIn` del cronometraje. Internamente:

```
elapsed = (countdown_pit_in − countdown_actual) / 1000
```

Donde `countdown_pit_in` es el tiempo de carrera restante en el momento
de entrada a boxes, y `countdown_actual` es el tiempo restante ahora.
La diferencia da el tiempo real transcurrido.

## BOX call (aviso de boxes desde el equipo)

El **BOX call** es una notificación que el equipo de boxes puede
disparar desde el panel web para avisar al piloto de que **debe entrar
a boxes**. Es una alerta agresiva, pensada para que sea imposible no
verla.

### Cómo se dispara

Desde el panel web, el equipo pulsa el botón de "llamada a boxes" para
el kart de su equipo. La alerta se envía por WebSocket al móvil del
piloto en menos de 1 segundo.

### Qué ve el piloto

- Pantalla en **rojo parpadeante** a pantalla completa (alterna entre
  rojo intenso y rojo más suave cada 0.5 segundos).
- Texto enorme "BOX" en blanco centrado.
- **Vibración fuerte** del dispositivo (notificación háptica de tipo
  warning).
- Subtexto "Toca para cerrar" y "Se cierra automáticamente".

### Cómo se cierra

- **Tocando cualquier zona de la pantalla**.
- **Automáticamente a los 5 segundos** si el piloto no toca.

Tras cerrarse, vuelve la rejilla de tarjetas normal (o la pantalla de
"Pit en curso" si el piloto ya ha entrado a boxes).
