# GPS current-lap delta por cross-track (modo circuito RaceBox) — Diseño

**Fecha:** 2026-06-10
**Ámbito:** App driver GPS — iOS (`BoxBoxNow/`) + Android (`android/`). Toca **web** solo para el catálogo de la card nueva (i18n + orden); **no** toca backend ni schema (las prefs de cards son claves opacas).

## Objetivo

Sustituir el cálculo del delta de vuelta actual basado en **distancia acumulada** por uno basado en **posición real (cross-track)** contra la vuelta de referencia, replicando el método de modo circuito de RaceBox, y añadir un indicador de **vuelta proyectada** suavizado.

## Motivación

Hoy `LapTracker.computeDeltas` → `interpolateDelta` empareja la posición actual con la referencia por **distancia acumulada en la vuelta** (búsqueda binaria sobre `ref.distances[]` + interpolación lineal de `ref.timestamps[]`). Esa distancia se acumula sumando pasos haversine y **deriva** cuando la trazada del piloto difiere de la referencia: si abres más una curva recorres más metros para el mismo avance en pista, así que "misma distancia acumulada" te compara con un punto físico distinto. RaceBox evita esto en circuito anclando a la **posición** sobre el trazado de referencia (cross-track), no a la distancia. La interpolación reverse-engineered y verificada está en `memory/racebox_delta_algorithm.md` y los fuentes decompilados en `RaceboxApk/decompiled/`.

## Decisiones de diseño (acordadas)

1. **Reemplazo total**: el cross-track sustituye a `interpolateDelta`. No hay fallback a distancia. Si no se puede proyectar (trazada muy distinta, GPS malo, fuera de pista) → **sin delta** (análogo a `ErrorInCurrentLap` de RaceBox).
2. **Suavizado**: el valor mostrado es la **media móvil de las últimas 10 muestras** (buffer rodante), como RaceBox. Hasta llenar el buffer se muestra el último valor.
3. **Vuelta proyectada**: además del delta se muestra `vuelta_proyectada = ref.durationMs + delta_suavizado`, como **card de catálogo nueva** (`projectedLap`) — consistente con el resto de cards. Esto implica añadir la clave i18n `card.projectedLap` y el orden del catálogo en iOS, Android **y web** (las cards comparten catálogo cross-plataforma). No requiere cambio de schema en backend: las prefs de visibilidad/orden son claves de string opacas.
4. **Tests mínimos**: las apps no tienen tests hoy; se añade infraestructura mínima (target XCTest en iOS + source set JUnit en Android) acotada al helper geométrico y a la lógica de `LapTracker`.
5. **Bug pit-out aparte**: el reset del delta al salir de boxes (delta no resetea sin `PIT_OUT`, ver `memory/ios_gps_delta_pitout.md`) NO entra en este trabajo.

## Arquitectura

El cálculo es **local a la app GPS**, por muestra, contra la propia vuelta de referencia del piloto (no usa marcas del circuito salvo la línea de meta de 2 puntos que ya capturamos en `finishLat1/Lon1/finishLat2/Lon2`). No se sube nada nuevo al backend; la vuelta proyectada y el delta se muestran en la vista driver del dispositivo.

Enfoque elegido: **proyectar sobre la polilínea densa de la referencia** (`positions[]` a ~50 Hz). No se subdivide en "gates" cada 5 m como RaceBox (ellos lo hacen porque su referencia BLE es dispersa); nuestra referencia es más densa que 5 m, así que se proyecta directamente sobre los segmentos consecutivos de `positions[]`. Es equivalente y más fino.

### Estado nuevo en `LapTracker`

- `private var refAnchorIndex: Int = 0` — índice del último segmento emparejado en la referencia (avance monótono; se resetea a 0 al completar vuelta y en `reset()`).
- Buffer de suavizado: `private var deltaSmoothBuf: [Double]` (capacidad 10) + cursor + nivel, o un array circular equivalente. Se **vacía** cuando no hay proyección válida y al completar vuelta.
- `@Published var projectedLapMs: Double?` — vuelta proyectada (nil si no hay delta).
- Se mantienen `deltaBestMs` y `deltaPrevMs` (ambos pasan a cross-track). `projectedLapMs` usa la referencia **best**.

### Algoritmo por muestra GPS (sustituye a `computeDeltas`/`interpolateDelta`)

Entrada: muestra actual (`lat`, `lon`, `timestamp`, `fixType`), `currentElapsedMs`, referencia `ref: LapRecord`.

1. Si `fixType < 3` o `ref == nil` o `ref.positions.count < 2` → `delta = nil`, vaciar buffer, `projectedLapMs = nil`. Salir.
2. **Proyección sobre la polilínea** dentro de una ventana móvil anclada en `refAnchorIndex`:
   - Buscar en segmentos `[refAnchorIndex, refAnchorIndex + FWD]` (hacia delante) el que minimiza la distancia perpendicular `perp` del punto actual al segmento `(positions[k], positions[k+1])`, usando `crossTrackProjection`.
   - Si ninguno da una proyección válida (`perp <= MAX_PERP` y `t ∈ [0,1]`), reintentar en una ventana corta hacia atrás `[max(0, refAnchorIndex − BACK), refAnchorIndex]`.
   - Si sigue sin haber, **dar por perdida** la muestra: `delta = nil`, vaciar buffer, `projectedLapMs = nil`. Salir. (No se ensancha a toda la vuelta para no engancharse a otra parte del circuito en horquillas — avance monótono, igual que `LastCrossedReferencePointIndex` de RaceBox.)
3. Sea `k` el segmento ganador y `t` su fracción (clamp `0..1`). Avanzar `refAnchorIndex = k` (monótono).
4. `refTimeS = lerp(ref.timestamps[k], ref.timestamps[k+1], t) − ref.timestamps[0]`.
5. `rawDeltaMs = currentElapsedMs − refTimeS * 1000`.
6. Empujar `rawDeltaMs` al buffer de 10 → `deltaMs = media(buffer)` (o último valor si el buffer aún no está lleno).
7. `projectedLapMs = ref.durationMs + deltaMs` (solo para la referencia best).
8. Al completar vuelta (`completeLap`): `refAnchorIndex = 0`, vaciar buffer, `projectedLapMs = nil`.

Constantes propuestas (afinables): `FWD = 60` segmentos (~1.2 s a 50 Hz), `BACK = 20`, `MAX_PERP = 25.0` m (más allá se considera fuera de la trazada de referencia). Signo: `delta > 0` = por detrás de la referencia; `< 0` = por delante (igual que hoy).

### Helper geométrico nuevo (`GeoUtils`, metros planos locales)

Mantiene el estilo flat-earth ya usado (`degToMLat`/`degToMLon`), válido para un kárting de ~1 km.

```
crossTrackProjection(p, a, b) -> (t: Double, perpMeters: Double)
  // proyecta p sobre el segmento a->b en metros locales
  // dx,dy = b - a (en metros);  len2 = dx*dx + dy*dy
  // si len2 ~ 0 -> t = 0, perp = dist(p, a)
  // t = clamp(((p - a) . (b - a)) / len2, 0, 1)
  // pie = a + t*(b - a);  perp = dist(p, pie)
```

Más un envoltorio que recorre la ventana de segmentos y devuelve `(segmentIndex, t, perp)` del mejor. Espejo en Kotlin (`util/GeoUtils.kt`).

## Selección de referencia

- **Principal = mejor vuelta del stint** (`bestLap`), reseteable con el `resetStintBest()` que ya existe (lo llama la salida de boxes). La vuelta proyectada usa esta referencia.
- Se mantiene también **delta vs vuelta anterior** (`prevLap`), también por cross-track.
- Antes de tener una vuelta completa no hay referencia → sin delta (consistente con "reemplazo total"; igual que hoy `interpolateDelta` devolvía nil sin ref).

## Manejo de errores / bordes (paridad con RaceBox)

- Sin proyección válida en la ventana → sin delta, buffer vaciado (no mostrar dato viejo).
- `fixType < 3` → muestra ignorada para delta.
- Salto GPS > 50 m ya filtrado aguas arriba en `processSample` (se mantiene).
- Cruce de meta → `refAnchorIndex = 0`, buffer vacío.
- Horquillas / cruces del trazado consigo mismo → la ventana móvil monótona evita emparejar con el tramo equivocado.

## Fuera de alcance

- Arreglo del reset del delta en salida de boxes (`ios_gps_delta_pitout`) — trabajo separado.
- Submuestreo a gates de 5 m (innecesario; referencia más densa).
- Cambios de **schema/backend**. El delta y la vuelta proyectada se calculan y muestran en el dispositivo; solo el catálogo de la card nueva toca web (i18n + orden), sin persistencia nueva.
- Modo drag/recta: no aplica (somos circuito).

## Ficheros

**iOS:**
- `BoxBoxNow/BoxBoxNow/Services/LapTracker.swift` — sustituir `computeDeltas`/`interpolateDelta` por la proyección cross-track; añadir `refAnchorIndex`, buffer de suavizado, `projectedLapMs`; resets en `reset()`/`completeLap()`.
- `BoxBoxNow/BoxBoxNow/Utilities/GeoUtils.swift` — `crossTrackProjection` + envoltorio sobre ventana.
- `BoxBoxNow/BoxBoxNow/Views/Driver/Cards/DriverCardView.swift` (o `Views/Driver/DriverView.swift`) — mostrar vuelta proyectada.

**Android (espejo):**
- `android/app/src/main/java/com/boxboxnow/app/lap/LapTracker.kt`
- `android/app/src/main/java/com/boxboxnow/app/util/GeoUtils.kt`
- vista driver (Compose) equivalente.

## Plan de pruebas (TDD)

- **`GeoUtils.crossTrackProjection`** (unitario, puro):
  - punto exactamente sobre el segmento → `perp ≈ 0`, `t` esperado.
  - punto perpendicular a 5 m del centro → `t ≈ 0.5`, `perp ≈ 5`.
  - punto más allá del extremo → `t` clamp a 0 o 1, `perp` = distancia al extremo.
  - segmento degenerado (a == b) → `t = 0`, `perp = dist(p,a)`.
- **`LapTracker` proyección** (referencia sintética):
  - referencia recta + vuelta actual idéntica → delta ≈ 0 en todo el recorrido.
  - vuelta actual con timestamps +0.30 s desplazados → delta ≈ +300 ms estable.
  - punto fuera de pista (`perp > MAX_PERP`) → delta nil, buffer vaciado.
  - trazada paralela desplazada lateralmente (misma velocidad) → delta ≈ 0 (demuestra inmunidad a la línea, el objetivo del cambio).
  - avance monótono del ancla en un trazado con dos tramos cercanos (horquilla): no salta al tramo equivocado.
- Espejo de los tests en Android (JUnit) para `GeoUtils.kt` y `LapTracker.kt`.

## Criterio de aceptación

- Con la vuelta actual = referencia, el delta se mantiene cerca de 0 sin deriva al final de la vuelta (lo que el método por distancia no garantizaba con trazadas distintas).
- Una trazada lateralmente desplazada pero a igual ritmo da delta ≈ 0 (no penaliza por elegir otra línea).
- El número mostrado es estable (suavizado) y aparece la vuelta proyectada.
- iOS y Android producen el mismo delta para la misma entrada sintética.
