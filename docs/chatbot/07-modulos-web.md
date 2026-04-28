# Módulos del panel web

El panel web está dividido en pestañas que se activan con permisos
individuales. Esta es la lista, agrupada por temática.

## Módulos en directo

- **Carrera** (`race`): tabla principal con todos los karts ordenados
  por posición oficial. Muestra última vuelta, mejor vuelta, gap al
  líder y al kart de delante, número de vueltas, número de pits y
  estado (en pista o en boxes).
- **Box** (`pit`): cola FIFO de pits con Box Score. Punto central para
  decidir cuándo parar. Ver el artículo "Box Score y cola FIFO".
- **Live** (`live`): página oficial del cronometraje del circuito
  (Apex Timing) embebida en un iframe. Útil para ver el cuadro
  oficial del organizador junto al panel.

## Clasificaciones

- **Clasif. Real** (`adjusted`): clasificación que descuenta los pits
  pendientes. Ver el artículo "Clasificación real".
- **Real Beta** (`adjusted-beta`): variante experimental del cálculo
  anterior.

## Configuración

- **Config** (`config`): parámetros de la sesión de carrera (duración,
  mínimo de pits, tiempo de pit, stint máx/mín, número de kart, etc.).
  Ver el artículo "Sesión de carrera".

## Vista del piloto

- **Vista en vivo** (`driver`): vista web equivalente a lo que el piloto
  ve en su app móvil. Permite previsualizar tarjetas y disposición sin
  un dispositivo móvil.
- **Config Piloto** (`driver-config`): editor de plantillas (presets) de
  tarjetas. Permite definir qué tarjetas se muestran al piloto, en qué
  orden, y guardar varias plantillas (por circuito, por piloto…).

## Análisis post-carrera

- **Replay** (`replay`): reproducción de una sesión guardada con
  controles de velocidad y barra de seek. Reconstruye toda la carrera
  vuelta a vuelta.
- **Karts** (`analytics`): análisis comparativo de todos los karts del
  evento (rendimiento medio, consistencia, tiempos de pit).
- **GPS Insights** (`insights`): análisis de las trazas GPS de tu kart:
  velocidad por sector, mapa de la pista, comparación de mejores
  vueltas.

## Sólo para administradores

- **Admin → Usuarios** (`admin-users`): crear, editar usuarios y
  gestionar sus permisos (qué pestañas ven).
- **Admin → Circuitos** (`admin-circuits`): editar circuitos, parámetros
  de Apex Timing y línea de meta GPS.
- **Admin → Circuit Hub** (`admin-hub`): estado de las conexiones
  WebSocket a cada circuito.

## Asistente

- **Asistente** (`chat`): este chatbot de soporte. Responde dudas sobre
  cómo usar la app a partir de la documentación oficial. Es un agente
  de RAG, no inventa datos: si la respuesta no está documentada te
  redirige a soporte humano.
