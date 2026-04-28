# Load tests

Pruebas de carga para el backend de BoxBoxNow. Dos escenarios:

| Script | Qué simula | Por qué importa |
|---|---|---|
| `ws_concurrent.js` | N usuarios con el panel/app abierto durante una carrera | Es el patrón real de día de carrera. Mide cuántas conexiones WS persistentes aguanta el `t3.small`. |
| `http_burst.js`    | Pico de gente abriendo el dashboard a la vez | Mide RPS sostenidos contra los endpoints más usados (`/api/auth/me`, `/api/config/session`, `/api/config/circuits`). |

**No incluye** prueba contra el chatbot — ese tira de Groq/OpenAI y los caps por usuario salen rápido. Si más adelante quieres testearlo se añade aparte.

## Requisitos

- [k6](https://k6.io/) instalado en tu Mac:
  ```bash
  brew install k6
  ```
- Un usuario en producción para autenticarse. Para evitar bloquear al admin, **crea un usuario de pruebas dedicado** con `max_devices` alto (1000+):
  - Admin → Usuarios → Crear usuario "loadtest"
  - Edita "Dispositivos máximos" a 1000.
  - Anota la contraseña.
- Acceso a SSH al servidor para monitorizar recursos en directo.

## Cuándo ejecutarlo

- **Nunca** durante una carrera real activa.
- De noche o en horario muerto, comprobando antes que no hay sesiones de carrera en curso.
- Lanza una sola prueba a la vez (no las dos en paralelo).

## Ejecutar `ws_concurrent.js`

Carga sostenida de 50 conexiones WS durante 2 minutos:

```bash
PASSWORD='tu_password_loadtest' \
USERNAME='loadtest' \
VUS=50 \
HOLD_S=120 \
k6 run loadtest/ws_concurrent.js
```

Variables disponibles (todas opcionales salvo `PASSWORD`):

| Var | Default | Qué hace |
|---|---|---|
| `BASE_URL` | `https://boxboxnow.com` | Base HTTP para login |
| `WS_URL`   | derivado de `BASE_URL` (`wss://...`) | Base del WebSocket |
| `USERNAME` | `admin` | Usuario para login |
| `PASSWORD` | — | **Obligatorio.** Contraseña del usuario |
| `VUS`      | `50` | Conexiones WS simultáneas en pico |
| `HOLD_S`   | `120` | Segundos que cada VU mantiene la WS abierta |
| `RAMP_S`   | `30` | Segundos para subir de 0 a `VUS` |
| `VIEW`     | `driver` | Param `view=` del WS (driver permite +1 conexión) |
| `DEVICE`   | `web` | Param `device=` del WS |

### Qué deberías ver

Al final del run k6 imprime un resumen. Lo importante:

```
✓ ws_connect_success.....: rate>0.99
✓ ws_first_message_ms....: p(95)<3000
✓ ws_messages_received...: count>0
```

Si todos los thresholds están en verde, el backend aguantó esa carga sin caídas. Si alguno sale en rojo, mira los detalles más abajo en la sección "Interpretación".

## Ejecutar `http_burst.js`

Burst HTTP que sube hasta 30 RPS y mantiene 60s en pico:

```bash
PASSWORD='tu_password_loadtest' \
USERNAME='loadtest' \
PEAK_RPS=30 \
HOLD_S=60 \
k6 run loadtest/http_burst.js
```

Variables:

| Var | Default | Qué hace |
|---|---|---|
| `BASE_URL` | `https://boxboxnow.com` | Base HTTP |
| `USERNAME` | `admin` | Usuario |
| `PASSWORD` | — | **Obligatorio.** |
| `PEAK_RPS` | `30` | Iteraciones por segundo en pico (×4 endpoints = 120 reqs/s reales) |
| `STAGE_S`  | `30` | Segundos por etapa de rampa |
| `HOLD_S`   | `60` | Segundos sosteniendo el pico |

Cada iteración hace 4 GETs (`/api/auth/me`, `/api/config/session`, `/api/config/circuits`, `/health`), por lo que `PEAK_RPS=30` ≈ 120 requests/seg reales contra el backend.

### Qué deberías ver

```
✓ endpoint_errors..............: rate<0.01
✓ endpoint_me_ms...............: p(95)<800
✓ endpoint_session_ms..........: p(95)<1000
✓ endpoint_circuits_ms.........: p(95)<1500
✓ endpoint_health_ms...........: p(95)<300
```

Cada endpoint tiene su propio threshold de p95 — si uno falla pero los otros pasan, sabes exactamente qué endpoint es el cuello de botella.

## Monitorizar el servidor en directo

Mientras corre la prueba, en otra terminal:

```bash
ssh -i /Users/jizcue/dumps/Claves_KN_PROD.pem ubuntu@3.252.140.252 \
  'docker stats --no-stream && echo --- && free -h'
```

O en interactivo:

```bash
ssh -i /Users/jizcue/dumps/Claves_KN_PROD.pem ubuntu@3.252.140.252
# luego en el server:
docker stats         # ctrl+c para salir
htop                 # si está instalado
```

**Lo que hay que vigilar en `t3.small` (2 vCPU burstable, 2 GB RAM):**

- **CPU sostenido > 70%** durante varios minutos: vas a quemar créditos burst y luego la CPU se limita al baseline (24%). Mala idea durante una carrera real.
- **RAM > 1.7 GB**: estás muy cerca del OOM. Una segunda prueba en paralelo te lo tira.
- **Backend container > 800 MB**: anormal — investigar leaks.

## Interpretación de resultados

### `ws_connect_success` por debajo de 0.99

- Probable: `max_devices` del usuario es bajo. Sube a 1000+.
- Si no, el backend está rechazando handshakes — mira logs (`docker compose logs --tail 50 backend`).

### `ws_first_message_ms` alto pero sin errores

- El backend está saturado de CPU. Los mensajes de Apex Timing siguen entrando pero el broadcast a clientes va con cola.
- Mira `docker stats` durante la prueba y compara CPU%.

### `endpoint_session_ms` o `endpoint_circuits_ms` se disparan a >2s en pico

- SQLite empieza a serializar lecturas porque hay muchas escrituras simultáneas (típicamente, otros clientes WS escribiendo `device_session.last_active`).
- El cuello de botella es la BD, no la red ni la CPU.

### Errores 401 esporádicos

- Algún VU tiró del `logout` antes de tiempo y dejó el session_token inválido.
- Suele resolverse subiendo `RAMP_S` (rampa más suave) y verificando que solo corres una prueba a la vez.

### Errores 502 / 504 desde Caddy

- Caddy proxyea contra el backend; si el backend tarda > 60s tira 504.
- Suele indicar saturación seria. Reduce `VUS` / `PEAK_RPS` y vuelve a probar.

## Punto de partida razonable para t3.small

Lo que **no debería romperse** con tu instancia actual:

| Prueba | Configuración OK |
|---|---|
| WS sostenido | `VUS=80`, `HOLD_S=120` |
| HTTP burst   | `PEAK_RPS=20`, `HOLD_S=60` (≈80 reqs/s reales) |

Si esos pasan en verde, tu setup aguanta una carrera de tamaño habitual (20-30 karts × 2-3 staff por equipo + drivers en móvil) con margen.

Si quieres saber el techo, sube `VUS` o `PEAK_RPS` en pasos de 25-50% hasta que algún threshold falle. Ese punto es tu límite real.
