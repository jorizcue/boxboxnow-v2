# Clasificación real

## Qué es la clasificación real

La **Clasificación Real** (pestaña **Clasif. Real**) es una clasificación
calculada que, a diferencia de la posición oficial del cronometraje,
**descuenta el tiempo que cada kart aún tiene que pasar en boxes** por
los pits obligatorios que le faltan.

Esto da una visión más realista de la posición que tendría cada kart si
todos estuviesen al día con sus pits obligatorios.

## Por qué se necesita

La posición oficial te dice quién va por delante **ahora mismo**, pero
no quién va a estar por delante **al final de la carrera**. Si un equipo
no ha hecho aún sus paradas obligatorias está aparentemente más arriba
de lo que va a estar realmente cuando las haga.

La Clasificación Real "penaliza" a los karts que tienen pits pendientes
restando de su distancia recorrida la distancia que cubrirán durante
sus paradas futuras. Así obtienes la posición *efectiva*.

## Cómo se calcula

Por cada kart:

1. **Velocidad estable** = longitud del circuito / vuelta media (en m/s).
   Pondera la vuelta media con la última vuelta si está dentro de un
   rango razonable, para reaccionar a cambios de ritmo sin que un
   "outlier" la enturbie.
2. **Distancia recorrida** = vueltas completadas × longitud del circuito
   + interpolación parcial de la vuelta en curso.
3. **Penalización por pits pendientes** = pits que le faltan × velocidad
   × tiempo de pit. Es la distancia que dejaría de cubrir mientras está
   parado.
4. **Distancia ajustada** = distancia recorrida − penalización.

Luego se ordenan los karts de mayor a menor distancia ajustada.

## Diferencias visibles

En la tarjeta "Posición (clasif. real)" verás un valor del tipo `P3/15`
(posición / total). Compáralo con "Posición (tiempos medios)":

- Si tu posición real es **mejor** que la oficial: te están "subiendo"
  porque otros karts tienen pits pendientes; tu posición efectiva al
  final será mejor.
- Si tu posición real es **peor** que la oficial: tienes pits
  pendientes; cuando los hagas vas a perder posiciones.

## Adjusted Beta

La pestaña **Real Beta** es una variante experimental del mismo cálculo
con una fórmula ligeramente distinta para algunos casos extremos. Está
visible solo si el administrador te ha dado el permiso `adjusted-beta`
y se mantiene como referencia para comparar cálculos.
