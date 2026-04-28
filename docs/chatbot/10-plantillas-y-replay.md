# Plantillas de piloto y Replay

## Plantillas (presets)

Una **plantilla** guarda una configuración de la app móvil del piloto:
qué tarjetas se ven, en qué orden, y opcionalmente la orientación,
contraste y narración por voz.

Sirven para:

- Cambiar de configuración rápido entre pilotos del equipo (cada uno
  prefiere ver cosas distintas).
- Tener una plantilla por tipo de circuito (carrera larga, sprint,
  entrenamiento).
- Probar layouts diferentes sin reconfigurar tarjeta a tarjeta.

### Crear y aplicar

Desde el panel web, en **Config Piloto** (`driver-config`), puedes:

- Crear hasta **10 plantillas por usuario**.
- Marcar una como **predeterminada**: se aplicará automáticamente cada
  vez que el piloto entre en la app móvil.
- Editar el orden y visibilidad de cada tarjeta.
- Editar contraste y orientación de pantalla preferida.

Desde la app móvil, en el menú lateral, el piloto puede **cambiar de
plantilla** sobre la marcha sin salir de la vista.

### Qué guarda exactamente una plantilla

- Nombre (único por usuario, máximo 50 caracteres).
- Tarjetas visibles (qué tarjetas mostrar y cuáles ocultar).
- Orden de las tarjetas.
- Contraste (slider 0–100%).
- Orientación (libre / vertical / horizontal).
- Audio activado/desactivado.

## Replay

**Replay** (pestaña `replay`) reproduce una sesión guardada como si
estuviera ocurriendo en directo. Útil para análisis post-carrera y
para revisar momentos clave (entrada en boxes, vueltas rápidas, BOX
calls, cambios de piloto).

### Qué se puede reproducir

- **Tu propia sesión**: cualquier carrera de tu cuenta.
- **Sesiones de otros usuarios** (si eres administrador).
- **Grabaciones de circuito**: capturas históricas del cronometraje
  de un circuito completo, sin un usuario concreto.

### Controles

- **Play/Pause**.
- **Velocidad**: 1x, 2x, 5x, 10x.
- **Seek**: barra para saltar a un momento concreto de la carrera.
- **Stop**: cierra el replay y vuelve a tiempo real.

### Lo que ves durante un replay

Mientras el replay está activo, **todas** las pestañas del panel se
alimentan del estado reconstruido de la sesión grabada (Carrera, Box,
Clasif. Real, Box Score, etc.). La app móvil del piloto, si está
conectada, también se actualiza para que puedas verificar qué vio el
piloto en cada momento.
