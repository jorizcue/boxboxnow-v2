# Permisos y administración de usuarios

## Cómo funcionan los permisos

BoxBoxNow controla el acceso a cada módulo por **permisos
individuales** (también llamados "tabs" o pestañas). Cada usuario tiene
una lista de permisos activos. Si un permiso está desactivado, esa
pestaña simplemente no aparece en su menú.

Hay dos tipos de cuenta:

- **Administrador**: tiene todos los permisos automáticamente, no se
  pueden modificar.
- **Usuario regular**: ve solo las pestañas que el administrador le ha
  activado.

Los permisos se gestionan desde **Admin → Usuarios** (sólo
administradores).

## Lista completa de permisos

### En directo

- `race` → pestaña "Carrera"
- `pit` → pestaña "Box"
- `live` → pestaña "Live"
- `config` → pestaña "Config"

### Clasificaciones

- `adjusted` → pestaña "Clasif. Real"
- `adjusted-beta` → pestaña "Real Beta"

### Vista del piloto

- `driver` → pestaña "Vista en vivo"
- `driver-config` → pestaña "Config Piloto"

### Post-carrera

- `replay` → pestaña "Replay"
- `analytics` → pestaña "Karts"
- `insights` → pestaña "GPS Insights"

### App móvil — secciones de configuración

- `app-config-carrera` → tarjetas del grupo Carrera
- `app-config-box` → tarjetas del grupo Box (Box Score, Pit en curso…)
- `app-config-visualizacion` → opciones de contraste y orientación
- `app-config-plantillas` → gestión de plantillas
- `app-config-gps-racebox` → integración con dispositivo RaceBox

### Soporte

- `chat` → asistente de soporte (este chatbot)

### Solo administradores

- `admin-users` → gestión de usuarios
- `admin-circuits` → gestión de circuitos
- `admin-hub` → estado de las conexiones a Apex Timing

## Acceso a circuitos

Aparte de los permisos de pestañas, cada usuario tiene una lista de
**circuitos accesibles**. Solo verá esos circuitos en el selector de
circuito de la sesión, aunque tenga el permiso `config` activo.

Si un usuario no tiene ningún circuito asignado, no podrá empezar una
sesión de carrera (aunque sí podría entrar al dashboard).

## Sesiones simultáneas y dispositivos

Cada usuario tiene un **límite de sesiones simultáneas** que el
administrador configura. Si se intenta iniciar sesión en un nuevo
dispositivo y se supera el límite, se debe cerrar otra sesión activa
desde el "Gestor de sesiones" (icono del candado en la cabecera del
panel).

Esto evita que se compartan credenciales entre varias personas y
permite mantener el control del equipo.
