# Introducción a BoxBoxNow

## Qué es BoxBoxNow

BoxBoxNow es una plataforma de estrategia en tiempo real para carreras
de karts de resistencia (endurance). Se conecta al sistema de cronometraje
oficial del circuito (Apex Timing) y muestra al equipo de boxes información
en directo para tomar mejores decisiones de pit-stop, cambios de piloto y
clasificación.

El producto tiene dos partes que trabajan juntas:

- **Panel web** en `boxboxnow.com/dashboard`, pensado para el equipo de
  boxes (jefe de equipo, ingeniero de carrera).
- **App móvil "Vista Piloto"** (iOS y Android), pensada para el piloto en
  pista. Muestra solo la información esencial en tarjetas grandes
  optimizadas para leer a 60 km/h.

Ambas se sincronizan por WebSocket en tiempo real con el mismo backend.

## Para quién es

- Equipos amateur y semiprofesionales de resistencia karting
- Pilotos individuales que quieran datos GPS y deltas de vuelta en
  tiempo real durante la carrera
- Organizadores de eventos que necesitan un panel de seguimiento

## Idiomas soportados

La interfaz está disponible en **español, inglés, italiano y alemán**.
El idioma se cambia desde el selector dentro del panel y se persiste
por usuario.

## Acceso

El panel web requiere usuario y contraseña. La app móvil reutiliza la
misma cuenta. El acceso a cada módulo (Carrera, Box, Live, etc.) está
controlado por permisos individuales que el administrador del equipo
puede activar o desactivar usuario a usuario.
