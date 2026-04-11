# BoxBoxNow v2 — CLAUDE.md

Plataforma SaaS de estrategia de karting en tiempo real. Ingesta datos live de Apex Timing, calcula estrategia de boxes, clasificaciones y analytics, y los sirve via WebSocket a dashboards en navegador.

## Stack

- **Backend**: FastAPI (Python 3.12), SQLAlchemy async, SQLite (WAL mode), aiosqlite
- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, TailwindCSS, Zustand
- **Infra**: Docker Compose (backend + frontend + Caddy), AWS EC2
- **Pagos**: Stripe (subscriptions + one-time payments)
- **Auth**: JWT (HS256), Google OAuth, MFA (TOTP/PyOTP)
- **Email**: Resend API
- **Dominio**: `bbn.boxboxnow.kartingnow.com`
- **Colores marca**: bg `#000000`, surface `#111111`, accent `#9fe556`

## Estructura del proyecto

```
boxboxnow-v2/
├── backend/
│   └── app/
│       ├── main.py              # FastAPI app, lifespan, CORS, route registration
│       ├── config.py            # Pydantic Settings (.env loader)
│       ├── api/                 # Route handlers
│       │   ├── auth_routes.py   # Auth, JWT, MFA, Google OAuth, password reset
│       │   ├── admin_routes.py  # Admin panel, users, circuits, platform settings
│       │   ├── race_routes.py   # Race session CRUD
│       │   ├── config_routes.py # Circuit config, teams, drivers
│       │   ├── replay_routes.py # Race replay, playback control
│       │   ├── analytics_routes.py  # KPIs, kart/driver history
│       │   ├── gps_routes.py    # GPS telemetry upload/download
│       │   └── stripe_routes.py # Checkout, webhooks, portal, subscriptions
│       ├── models/
│       │   ├── database.py      # SQLAlchemy engine, Base, init_db(), seeds
│       │   ├── schemas.py       # 15 ORM models
│       │   └── pydantic_models.py
│       ├── engine/              # Logica de carrera
│       │   ├── state.py         # RaceStateManager, KartState, PitRecord
│       │   ├── registry.py      # SessionRegistry, UserSession (multi-tenant)
│       │   ├── fifo.py          # Cola de pit stops con scoring
│       │   ├── clustering.py    # Clasificacion por ritmo (scikit-learn + jenkspy)
│       │   └── classification.py
│       ├── apex/                # Integracion Apex Timing
│       │   ├── circuit_hub.py   # WebSocket always-on a todos los circuitos
│       │   ├── parser.py        # Protocolo pipe-delimited de Apex
│       │   ├── api_client.py    # PHP API para metadata de pilotos
│       │   ├── recorder.py      # DailyRecorder (archiva mensajes raw)
│       │   └── replay.py        # Motor de replay desde ficheros grabados
│       ├── ws/
│       │   └── server.py        # WebSocket server (JWT auth, broadcast)
│       ├── services/
│       │   └── email_service.py # Resend API (welcome, trial, subscription)
│       └── tasks/               # Background jobs
│           ├── compress_logs.py     # Rotacion logs (cada 6h)
│           ├── cleanup_analytics.py # Retencion datos (cada 24h)
│           └── trial_checker.py     # Expiracion trial + emails (cada 24h)
├── frontend/src/
│   ├── app/                     # Next.js App Router pages
│   │   ├── page.tsx             # Landing page
│   │   ├── login/page.tsx       # Login + MFA + Google OAuth callback
│   │   ├── register/page.tsx    # Registro + Google OAuth
│   │   ├── dashboard/page.tsx   # Dashboard principal (protegido)
│   │   ├── forgot-password/     # Reset password flow
│   │   └── reset-password/
│   ├── components/
│   │   ├── admin/AdminPanel.tsx # Admin (users, circuits, hub, platform)
│   │   ├── analytics/           # Charts/tablas analytics
│   │   ├── classification/      # Clasificacion real y ajustada
│   │   ├── config/ConfigPanel   # Config de carrera
│   │   ├── driver/              # Pilotos y config
│   │   ├── insights/            # GPS insights
│   │   ├── landing/             # Landing (PricingToggle, features)
│   │   ├── layout/Sidebar.tsx   # Menu lateral colapsable
│   │   ├── live/LiveTiming.tsx  # Datos live
│   │   ├── pit/FifoQueue.tsx    # Cola de boxes
│   │   ├── race/RaceTable.tsx   # Tabla de carrera
│   │   ├── replay/ReplayTab     # Controles de replay
│   │   └── shared/              # Modales, confirm, loaders
│   ├── hooks/
│   │   ├── useAuth.ts           # Zustand store (token, user, setAuth)
│   │   ├── useRaceWebSocket.ts  # Conexion WS con reconnect
│   │   ├── useRaceState.ts      # Estado de carrera desde WS
│   │   ├── useRaceBox.ts        # RaceBox GPS (UBX parser)
│   │   ├── useRaceClock.ts      # Timer countdown/count-up
│   │   └── usePhoneGps.ts       # GPS del telefono
│   ├── lib/
│   │   ├── api.ts               # Fetch wrapper, token injection, error handling
│   │   ├── i18n.ts              # Traducciones
│   │   ├── formatters.ts        # Formateadores de tiempo/ritmo
│   │   └── racebox/             # UBX parser, geo, calibracion IMU
│   └── types/race.ts            # Interfaces TS (KartState, FifoEntry, etc.)
├── data/                        # SQLite DB + recordings
├── docker-compose.yml           # backend + frontend + caddy
├── Caddyfile                    # Reverse proxy con SSL
└── .env                         # Variables de entorno (NO commiteado)
```

## Deploy

```bash
# 1. Push local
git push origin main

# 2. Deploy en EC2
ssh -i ~/.ssh/boxboxnow.pem ubuntu@3.252.140.252 \
  "cd boxboxnow-v2 && git pull && docker compose up -d --build"
```

- **Servidor**: `ubuntu@3.252.140.252`
- **PEM key**: `~/.ssh/boxboxnow.pem` (o `/Users/jizcue/dumps/Claves_KN_PROD.pem`)
- **Directorio en servidor**: `/home/ubuntu/boxboxnow-v2`

## Base de datos (SQLite)

**Modelos principales** (`backend/app/models/schemas.py`):

| Modelo | Proposito |
|--------|-----------|
| `User` | Cuentas, password_hash, MFA, stripe_customer_id, max_devices |
| `DeviceSession` | Control de dispositivos conectados (OTT-style) |
| `Subscription` | Planes Stripe (trial, basic_monthly/annual, pro_monthly/annual, event) |
| `UserTabAccess` | Permisos de pestanas por usuario |
| `UserCircuitAccess` | Permisos de circuito con fechas valid_from/valid_until |
| `Circuit` | Configuracion de circuito (longitud, pit_time, ws_port, retencion) |
| `RaceSession` | Configuracion de carrera por usuario |
| `TeamPosition` | Asignacion de boxes con numero de kart |
| `TeamDriver` | Pilotos con differential_ms (ajuste de ritmo) |
| `LiveRaceState` | Estado actual de carrera (referencia) |
| `LivePitEvent` | Eventos pit in/out por kart |
| `RaceLog` | Historico de carreras completadas |
| `KartLap` | Tiempos de vuelta individuales |
| `GpsTelemetryLap` | Trazas GPS (distancias, posiciones, velocidades, g-forces) |
| `AppSetting` | Config clave-valor (trial_days, retention, etc.) |

## Planes y precios

| Plan | Mensual | Anual | Devices | Tabs |
|------|---------|-------|---------|------|
| Basico | 49€ | 490€ | 2 | race, pit, live, config, adjusted, driver |
| Pro | 79€ | 790€ | 5 | Todo (+ replay, analytics, insights) |
| Evento | 50€ (unico) | — | 3 | Todo (48h acceso) |
| Trial | Gratis | — | 2 | Todo (configurable: 0-N dias) |

## Flujo de checkout (Pricing → Registro → Circuito → Stripe)

1. **PricingToggle**: Boton "Empezar ahora" → `/register?plan=pro_monthly`
2. **Register/Login**: Guarda plan en `localStorage("bbn_pending_plan")`, lo pasa a Google OAuth via query param `?plan=`
3. **Backend OAuth**: Recibe `plan` como query param → lo pasa a Google como `state` → lo devuelve en redirect al frontend
4. **Dashboard**: Al montar, detecta `bbn_pending_plan` → muestra `CircuitSelector` para elegir circuito
5. **CircuitSelector**: Lista circuitos via `GET /api/stripe/circuits` → usuario elige → `POST /api/stripe/create-checkout-session` con `{ plan, circuit_id }` → redirect a Stripe
6. **Backend checkout**: Acepta tanto `price_id` como `plan` name — resuelve internamente via `_plan_to_price()`. `circuit_id` es **obligatorio**
7. **Webhook post-pago**: `_handle_checkout_completed()` crea Subscription + `UserCircuitAccess` con fecha temporal segun plan
8. **Webhook renovacion**: `_handle_invoice_paid()` extiende `UserCircuitAccess.valid_until` con cada pago (+ 3 dias de gracia)
9. **Webhook cancelacion**: `_handle_subscription_deleted()` expira `UserCircuitAccess` inmediatamente
10. **Dashboard post-pago**: Detecta `?checkout=success` → llama `api.getMe()` → refresca user en Zustand

## Modelo de acceso a circuitos

- **Todos los planes requieren seleccionar un circuito** (basic, pro, event)
- **Acceso temporal**: `UserCircuitAccess.valid_from` / `valid_until` controlan las fechas
- **Renovacion automatica**: Cada `invoice.paid` de Stripe extiende `valid_until` al nuevo `period_end + 3 dias gracia`
- **Cancelacion**: `subscription.deleted` expira el acceso inmediatamente (`valid_until = now`)
- **Duraciones por plan**: monthly = `relativedelta(months=1)`, annual = `relativedelta(years=1)`, event = 48h. Siempre meses/anos calendario exactos (Apr 10 → May 10, Mar 31 → Apr 30). Grace period (+3 dias) solo se aplica sobre `period_end` de Stripe invoice
- **Upsert**: Si ya existe acceso al circuito, se extiende (usa el mayor `valid_until`)
- **Trial**: Otorga acceso a TODOS los circuitos durante el periodo trial (diferente de planes pagados)

## Convenciones de codigo

### Backend
- **Async everywhere**: Todas las rutas y queries son `async/await`
- **SQLAlchemy relationships**: Usar `back_populates` + `cascade="all, delete-orphan"` en el lado parent. **NUNCA** `backref` solo — no propaga cascade
- **Pydantic Settings**: Toda config va en `config.py` via variables de entorno
- **AppSetting**: Config dinamica de plataforma (trial_days, etc.) en tabla key-value
- **Helper functions**: Prefijo `_` para helpers privados en routes (ej: `_get_platform_setting()`)

### Frontend
- **App Router**: Paginas en `app/`, componentes en `components/`
- **Zustand**: Solo para auth (`useAuth`). El resto de estado via hooks custom
- **API client**: Todo fetch va por `lib/api.ts` — nunca `fetch()` directo
- **Tab system**: Type union `Tab` en Sidebar.tsx, cada tab nueva requiere: tipo + subtab + icono + render en dashboard
- **No `useSearchParams`** en pages directamente (requiere Suspense). Usar `window.location.search` en su lugar

### CSS/UI
- **TailwindCSS**: Colores custom en `tailwind.config.js` (`accent`, `surface`, `border`)
- **Patron disabled**: `opacity-40 pointer-events-none` para campos deshabilitados
- **Responsive**: `py-3`, `text-sm`, `rounded-lg` como baseline

## Errores conocidos y soluciones

### SQLAlchemy cascade delete
**Problema**: `IntegrityError: NOT NULL constraint failed: subscriptions.user_id` al borrar usuario.
**Causa**: `backref="subscriptions"` en Subscription NO propaga cascade al parent User.
**Solucion**: Cambiar a `back_populates` en ambos lados + `cascade="all, delete-orphan"` en User:
```python
# En User:
subscriptions = relationship("Subscription", back_populates="user", cascade="all, delete-orphan")
# En Subscription:
user = relationship("User", back_populates="subscriptions")
```

### Acentos en Google OAuth (unicode)
**Problema**: "Jose Garcia" → "jos.garca" (se comian las letras acentuadas).
**Causa**: Regex `[^a-z0-9._-]` eliminaba directamente los caracteres no-ASCII.
**Solucion**: Normalizar Unicode NFD antes de limpiar:
```python
import unicodedata
normalized = unicodedata.normalize("NFD", name)
normalized = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
# "Jose" → "Jose", "Garcia" → "Garcia"
```

### useSearchParams sin Suspense
**Problema**: `useSearchParams()` en pages de Next.js App Router causa warning/error sin Suspense boundary.
**Solucion**: Usar `window.location.search` con `new URLSearchParams()`:
```tsx
function getPlanFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("plan");
}
const [plan] = useState(getPlanFromUrl);
```

### Trial mode 0 dias (no-trial)
**Problema**: Cuando trial_days=0, el sistema seguia creando subscripciones trial vacias.
**Solucion**: Leer `trial_days` de AppSetting. Si es 0, solo asignar tabs basicas, sin subscription ni circuit access.

### Subscripcion pagada sin acceso a circuitos
**Problema**: Despues de pagar via Stripe, el usuario tenia subscription activa pero no podia acceder a ningun circuito.
**Causa dual**:
1. No habia seleccion de circuito en el flujo de compra — el checkout no pasaba `circuit_id`.
2. El frontend cacheaba el user en Zustand con `has_active_subscription: false` y no lo refrescaba tras volver de Stripe.
**Solucion**:
1. Añadido paso de seleccion de circuito (`CircuitSelector`) antes del checkout. `circuit_id` ahora es obligatorio.
2. Acceso temporal con duraciones por plan: `_grant_circuit_access()` centraliza la logica de upsert.
3. Webhooks `invoice.paid` y `subscription.updated` extienden acceso, `subscription.deleted` lo revoca.
4. Dashboard detecta `?checkout=success` → `api.getMe()` → `updateUser()`.

### Stripe webhook 500 — stripe-python v15 breaking changes (DOBLE)
**Problema 1**: `stripe.error.SignatureVerificationError` ya no existe → `AttributeError` → 500.
**Problema 2**: `StripeObject` ya no soporta `.get()` → los handlers fallaban con `AttributeError: get`.
**Solucion**:
1. `except Exception` con check de `type(e).__name__` para la firma.
2. Parsear el payload como JSON plano (`json.loads(payload)`) despues de verificar firma con `construct_event`. Los handlers reciben dicts puros, no StripeObjects.
**Leccion**: En stripe-python v15+, NUNCA usar el objeto devuelto por `construct_event` para acceder a datos. Solo usarlo para verificar firma. Parsear el JSON raw como dict.

### Duracion de acceso con timedelta vs relativedelta
**Problema**: `timedelta(days=33)` daba 33 dias fijos. Apr 10 → May 13 en vez de May 10.
**Solucion**: Usar `dateutil.relativedelta(months=1)` para meses calendario exactos. Apr 10 → May 10, Mar 31 → Apr 30, etc.
**Leccion**: Para duraciones de suscripcion, SIEMPRE usar relativedelta, nunca timedelta con dias fijos.

### Cache de usuario desactualizado tras acciones externas
**Problema general**: Zustand persiste el user en localStorage. Cualquier cambio server-side (webhook, admin) no se refleja automaticamente.
**Patron**: Despues de acciones que modifican el user server-side, siempre llamar `api.getMe()` + `updateUser()` para refrescar.

## Variables de entorno requeridas

```env
# Core
DATABASE_URL=sqlite+aiosqlite:///./data/boxboxnow.db
JWT_SECRET=<random-string>
JWT_EXPIRE_MINUTES=1440
FRONTEND_URL=https://bbn.boxboxnow.kartingnow.com

# Apex Timing
APEX_WS_HOST=www.apex-timing.com
APEX_WS_PORT=8092

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_BASIC_MONTHLY_PRICE_ID=price_...
STRIPE_BASIC_ANNUAL_PRICE_ID=price_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_ANNUAL_PRICE_ID=price_...
STRIPE_EVENT_PRICE_ID=price_...

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Email
RESEND_API_KEY=re_...
FROM_EMAIL=BoxBoxNow <noreply@boxboxnow.com>
```

## Arquitectura de datos en tiempo real

```
Apex Timing (WS) → CircuitHub → ApexParser → RaceEvent
    → UserSession.on_events() → RaceStateManager
        → FIFO scoring → Clustering → Classification
            → WebSocket server → Browser dashboards
```

- **CircuitHub**: Conexion WS persistente a todos los circuitos configurados
- **DailyRecorder**: Graba mensajes raw en `data/recordings/{circuit}/{date}.txt`
- **SessionRegistry**: Una instancia de RaceStateManager por usuario (multi-tenant)
- **Replay**: Reconstruye estado desde ficheros grabados, misma pipeline que live
