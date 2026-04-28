# Documentación del asistente de soporte

Este directorio contiene los artículos que el chatbot de la web (panel
`/dashboard`) usa para responder preguntas. Cada `.md` se trocea por
encabezados (`##` y `###`) y se indexa en la BD con `python -m
app.chatbot.ingest`.

Reglas para escribir aquí:

- **Una idea por sección.** Si añades un nuevo concepto, ponle su propio
  `##`. Cuanto más auto-contenida sea cada sección, mejor responderá el
  bot cuando la recupere por similitud.
- **Spanish, registro neutro.** Igual que la UI.
- **Nombres exactos de la app.** Si la pestaña se llama "Clasif. Real",
  escríbelo así (no "clasificación ajustada"). El bot devuelve respuestas
  citando lo que vea en la doc.
- **Evita "ver imagen X" o "como se vio antes".** El bot puede recuperar
  un fragmento aislado sin contexto previo.
- **El `README.md` no se indexa** (lo excluye el ingester).

Cuando edites o añadas un `.md`, vuelve a indexar:

```bash
cd backend && python -m app.chatbot.ingest --reset
```
