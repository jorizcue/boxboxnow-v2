# Preguntas frecuentes (FAQ)

## ¿Por qué no veo la pestaña "Box" / "Replay" / etc.?

Cada pestaña requiere un permiso individual que el administrador del
equipo te tiene que activar. Si no la ves, pídele al admin que te dé
el permiso correspondiente desde **Admin → Usuarios**. Ver el artículo
"Permisos y administración de usuarios" para la lista completa.

## ¿Por qué no se actualizan los datos en tiempo real?

Si aparece el banner rojo "Reconectando..." en la parte superior,
significa que se ha perdido la conexión WebSocket con el backend. El
panel intenta reconectar automáticamente. Si no se restaura en unos
segundos:

- Comprueba tu conexión a internet.
- Refresca la página (F5).
- Si el problema persiste, contacta con soporte.

Los datos NO se pierden mientras hay desconexión: cuando vuelve, se
sincroniza el estado completo otra vez.

## ¿Por qué la app móvil del piloto muestra "GPS --" en algunas tarjetas?

Las tarjetas del grupo GPS (Delta vs Best Lap, Velocidad GPS, G-Force,
etc.) requieren:

1. Que el circuito tenga la **línea de meta GPS** configurada.
2. Que la app esté recibiendo muestras GPS (del propio teléfono o un
   dispositivo RaceBox conectado por Bluetooth).

Si falta cualquiera de las dos, esas tarjetas muestran "GPS --". El
resto de tarjetas (las que vienen del cronometraje oficial) sí
funcionan normalmente.

## ¿Cuál es la diferencia entre "Posición" y "Posición (clasif. real)"?

- **Posición** (tiempos medios): es la posición oficial del
  cronometraje, basada en distancia recorrida sin más.
- **Posición (clasif. real)**: descuenta el tiempo que cada kart
  todavía tiene que pasar en boxes por los pits obligatorios
  pendientes.

Si vas tercero por tiempos medios pero P5 en clasif. real, significa
que dos karts que están detrás te van a adelantar cuando hagan sus
pits pendientes.

## ¿Cuánto cuesta un mensaje al asistente?

Para el usuario es **gratuito**. Para el administrador hay un límite
diario de mensajes por usuario (configurable, por defecto 30 al día)
para evitar abusos. El asistente usa modelos de lenguaje hospedados
(Llama 3.1 8B en Groq) con tier gratuito; el coste es prácticamente
nulo a escala normal.

## ¿El asistente sabe cuántos pits llevo en mi sesión?

**No**. El asistente actual sólo responde preguntas sobre **cómo usar
la app** y conceptos generales. No tiene acceso al estado en tiempo
real de tu sesión, ni a tu historial de carreras. Si necesitas datos
específicos de tu sesión, los tienes en el panel (Carrera, Box,
Clasif. Real…).

## ¿Puedo cambiar el idioma?

Sí. Hay un selector de idioma en el panel. Idiomas disponibles:
español, inglés, italiano y alemán. La elección se persiste por
usuario.

## ¿Cómo cierro otra sesión iniciada en otro dispositivo?

Pulsa en el icono del candado en la cabecera del panel para abrir el
**Gestor de sesiones**. Verás todos los dispositivos con sesión
activa de tu cuenta. Puedes cerrar cualquiera (excepto la actual) o
todos a la vez.

## ¿La información de mi cuenta es privada?

Sí. Cada usuario sólo ve sus propias sesiones, presets y datos GPS.
Los administradores del equipo pueden ver datos de los usuarios que
gestionan (para reproducir sesiones, por ejemplo) pero ningún usuario
ve datos de equipos distintos al suyo.
