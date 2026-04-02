"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Language = "es" | "en" | "it" | "de";

export const LANGUAGES: { code: Language; label: string; flag: string }[] = [
  { code: "es", label: "Espanol", flag: "🇪🇸" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
];

interface LangStore {
  lang: Language;
  setLang: (lang: Language) => void;
}

export const useLangStore = create<LangStore>()(
  persist(
    (set) => ({
      lang: "es",
      setLang: (lang) => set({ lang }),
    }),
    { name: "boxboxnow-lang" }
  )
);

// Translation keys
const translations: Record<string, Record<Language, string>> = {
  // === StatusBar ===
  "status.race": { es: "Carrera", en: "Race", it: "Gara", de: "Rennen" },
  "status.devices": { es: "Dispositivos", en: "Devices", it: "Dispositivi", de: "Gerate" },
  "status.logout": { es: "Salir", en: "Logout", it: "Esci", de: "Abmelden" },
  "status.noCircuit": { es: "Sin circuito", en: "No circuit", it: "Nessun circuito", de: "Keine Strecke" },
  "status.replayPaused": { es: "Replay (pausa)", en: "Replay (paused)", it: "Replay (pausa)", de: "Replay (Pause)" },
  "status.pitClosed": { es: "PIT CERRADO", en: "PIT CLOSED", it: "PIT CHIUSO", de: "PIT GESCHL." },
  "status.pitOpen": { es: "PIT ABIERTO", en: "PIT OPEN", it: "PIT APERTO", de: "PIT OFFEN" },

  // === Navbar ===
  "nav.race": { es: "Carrera", en: "Race", it: "Gara", de: "Rennen" },
  "nav.box": { es: "Box", en: "Box", it: "Box", de: "Box" },
  "nav.live": { es: "Live", en: "Live", it: "Live", de: "Live" },
  "nav.classification": { es: "Clasificacion", en: "Classification", it: "Classifica", de: "Klassifizierung" },
  "nav.config": { es: "Config", en: "Config", it: "Config", de: "Config" },
  "nav.admin": { es: "Admin", en: "Admin", it: "Admin", de: "Admin" },
  "nav.adjusted": { es: "Clasif. Real", en: "Real Class.", it: "Class. Reale", de: "Echte Klass." },
  "nav.adjustedShort": { es: "C.Real", en: "Real", it: "Reale", de: "Echt" },
  "nav.replay": { es: "Replay", en: "Replay", it: "Replay", de: "Replay" },
  "nav.analytics": { es: "Kart Analytics", en: "Kart Analytics", it: "Kart Analytics", de: "Kart Analytics" },
  "nav.analyticsShort": { es: "Analytics", en: "Analytics", it: "Analytics", de: "Analytics" },
  "nav.analysis": { es: "Análisis", en: "Analysis", it: "Analisi", de: "Analyse" },

  // === Login ===
  "login.username": { es: "Usuario", en: "Username", it: "Utente", de: "Benutzer" },
  "login.password": { es: "Contrasena", en: "Password", it: "Password", de: "Passwort" },
  "login.enter": { es: "ENTRAR", en: "LOGIN", it: "ACCEDI", de: "ANMELDEN" },
  "login.entering": { es: "ENTRANDO...", en: "LOGGING IN...", it: "ACCESSO...", de: "ANMELDEN..." },
  "login.wrongCredentials": { es: "Usuario o contrasena incorrectos", en: "Invalid username or password", it: "Utente o password errati", de: "Falscher Benutzer oder Passwort" },
  "login.errorClosingSession": { es: "Error al cerrar la sesion", en: "Error closing session", it: "Errore nella chiusura della sessione", de: "Fehler beim Schliessen der Sitzung" },
  "login.deviceLimit": { es: "LIMITE DE DISPOSITIVOS", en: "DEVICE LIMIT", it: "LIMITE DISPOSITIVI", de: "GERATELIMIT" },
  "login.activeSessions": { es: "Sesiones activas", en: "Active sessions", it: "Sessioni attive", de: "Aktive Sitzungen" },
  "login.close": { es: "Cerrar", en: "Close", it: "Chiudi", de: "Schliessen" },
  "login.backToLogin": { es: "Volver al login", en: "Back to login", it: "Torna al login", de: "Zuruck zum Login" },
  "login.noCircuitAccess": { es: "No tienes acceso a ningun circuito. Contacta con el administrador.", en: "You don't have access to any circuit. Contact the administrator.", it: "Non hai accesso a nessun circuito. Contatta l'amministratore.", de: "Sie haben keinen Zugang zu einer Strecke. Kontaktieren Sie den Administrator." },

  // === Session Manager ===
  "sessions.connectedDevices": { es: "Dispositivos conectados", en: "Connected devices", it: "Dispositivi collegati", de: "Verbundene Gerate" },
  "sessions.maxDevices": { es: "Maximo", en: "Maximum", it: "Massimo", de: "Maximum" },
  "sessions.devices": { es: "dispositivo(s)", en: "device(s)", it: "dispositivo/i", de: "Gerat(e)" },
  "sessions.active": { es: "activo(s)", en: "active", it: "attivo/i", de: "aktiv" },
  "sessions.loading": { es: "Cargando...", en: "Loading...", it: "Caricamento...", de: "Laden..." },
  "sessions.thisDevice": { es: "Este dispositivo", en: "This device", it: "Questo dispositivo", de: "Dieses Gerat" },
  "sessions.close": { es: "Cerrar", en: "Close", it: "Chiudi", de: "Schliessen" },
  "sessions.closeAllOthers": { es: "Cerrar todas las demas sesiones", en: "Close all other sessions", it: "Chiudi tutte le altre sessioni", de: "Alle anderen Sitzungen schliessen" },

  // === Race Table ===
  "race.noData": { es: "Sin datos de carrera", en: "No race data", it: "Nessun dato di gara", de: "Keine Renndaten" },
  "race.connectHint": { es: "Conecta al WebSocket de Apex o inicia un replay", en: "Connect to Apex WebSocket or start a replay", it: "Connettiti al WebSocket di Apex o avvia un replay", de: "Verbinde dich mit dem Apex WebSocket oder starte ein Replay" },
  "race.kart": { es: "Kart", en: "Kart", it: "Kart", de: "Kart" },
  "race.team": { es: "Equipo", en: "Team", it: "Squadra", de: "Team" },
  "race.driver": { es: "Piloto", en: "Driver", it: "Pilota", de: "Fahrer" },
  "race.avg20": { es: "Med.20", en: "Avg.20", it: "Med.20", de: "Schn.20" },
  "race.avg20Title": { es: "Media ultimas 20 vueltas", en: "Average last 20 laps", it: "Media ultime 20 giri", de: "Durchschnitt letzte 20 Runden" },
  "race.best3": { es: "Mej.3", en: "Best.3", it: "Mig.3", de: "Best.3" },
  "race.best3Title": { es: "Media 3 mejores vueltas", en: "Average best 3 laps", it: "Media 3 migliori giri", de: "Durchschnitt beste 3 Runden" },
  "race.last": { es: "Ult.", en: "Last", it: "Ult.", de: "Letzt." },
  "race.best": { es: "Mejor", en: "Best", it: "Migliore", de: "Beste" },
  "race.laps": { es: "Vlt", en: "Laps", it: "Giri", de: "Rnd" },
  "race.pit": { es: "Pit", en: "Pit", it: "Pit", de: "Pit" },
  "race.stint": { es: "Stint", en: "Stint", it: "Stint", de: "Stint" },
  "race.inPit": { es: "En boxes", en: "In pit", it: "Ai box", de: "In der Box" },
  "race.onTrack": { es: "En pista", en: "On track", it: "In pista", de: "Auf der Strecke" },

  // === Stint metrics ===
  "metric.metric": { es: "Metrica", en: "Metric", it: "Metrica", de: "Metrik" },
  "metric.value": { es: "Valor", en: "Value", it: "Valore", de: "Wert" },
  "metric.currentStint": { es: "Stint en curso", en: "Current stint", it: "Stint in corso", de: "Aktueller Stint" },
  "metric.timeToMaxStint": { es: "Tiempo hasta stint maximo", en: "Time to max stint", it: "Tempo al stint massimo", de: "Zeit bis max Stint" },
  "metric.lapsToMaxStint": { es: "Vueltas hasta stint maximo", en: "Laps to max stint", it: "Giri al stint massimo", de: "Runden bis max Stint" },
  "metric.kartsNearPit": { es: "Karts cerca de PIT", en: "Karts near PIT", it: "Kart vicini al PIT", de: "Karts nahe PIT" },
  "metric.maxStint": { es: "Stint maximo", en: "Max stint", it: "Stint massimo", de: "Max Stint" },
  "metric.minStint": { es: "Stint minimo", en: "Min stint", it: "Stint minimo", de: "Min Stint" },
  "metric.driverLastLap": { es: "Piloto / Ult. vuelta", en: "Driver / Last lap", it: "Pilota / Ultimo giro", de: "Fahrer / Letzte Runde" },
  "metric.avgLap": { es: "Media 20v", en: "Avg 20 laps", it: "Media 20 giri", de: "Schnitt 20 Rnd" },
  "metric.avgPosition": { es: "Posicion por media", en: "Pos. by avg", it: "Pos. per media", de: "Pos. nach Schnitt" },

  // === Driver info ===
  "driver.driver": { es: "Piloto", en: "Driver", it: "Pilota", de: "Fahrer" },
  "driver.info": { es: "Info", en: "Info", it: "Info", de: "Info" },
  "driver.currentDriver": { es: "Piloto actual", en: "Current driver", it: "Pilota attuale", de: "Aktueller Fahrer" },
  "driver.driverTime": { es: "Tiempo piloto", en: "Driver time", it: "Tempo pilota", de: "Fahrerzeit" },
  "driver.driverDiffTime": { es: "Dif. Tiempo piloto", en: "Driver time diff.", it: "Diff. Tempo pilota", de: "Fahrerzeit Diff." },
  "driver.stintLaps": { es: "Vueltas en stint", en: "Stint laps", it: "Giri nello stint", de: "Stint-Runden" },
  "driver.avgPace": { es: "Ritmo medio", en: "Avg pace", it: "Ritmo medio", de: "Durchschn. Tempo" },
  "driver.bestAvg3": { es: "Mejor media (3 mejores)", en: "Best avg (3 best)", it: "Miglior media (3 migliori)", de: "Beste Schn. (3 beste)" },
  "driver.totalTime": { es: "Tiempo total", en: "Total time", it: "Tempo totale", de: "Gesamtzeit" },
  "driver.avgLap": { es: "Media vuelta", en: "Avg lap", it: "Media giro", de: "Schnitt Runde" },
  "driver.remainingMin": { es: "Restante min.", en: "Remaining min.", it: "Minimo restante", de: "Verbleibend Min." },
  "driver.minPerDriver": { es: "Min. por piloto", en: "Min. per driver", it: "Min. per pilota", de: "Min. pro Fahrer" },

  // === Pit / FIFO ===
  "pit.pits": { es: "Pits", en: "Pits", it: "Pit", de: "Pits" },
  "pit.currentPit": { es: "Pit en curso", en: "Current pit", it: "Pit in corso", de: "Aktueller Pit" },
  "pit.minPitTime": { es: "Tiempo minimo de pit", en: "Min pit time", it: "Tempo minimo di pit", de: "Min Pit-Zeit" },
  "pit.pitCount": { es: "Numero de pits", en: "Pit count", it: "Numero di pit", de: "Anzahl Pits" },
  "pit.minPitCount": { es: "Numero minimo de pits", en: "Min pit count", it: "Numero minimo di pit", de: "Min Pit-Anzahl" },
  "pit.history": { es: "Historial de entradas en box", en: "Pit entry history", it: "Storico ingressi ai box", de: "Boxen-Einfahrts-Historie" },
  "pit.queue": { es: "Cola", en: "Queue", it: "Coda", de: "Warteschlange" },

  // === Classification ===
  "class.noData": { es: "Sin datos de clasificacion", en: "No classification data", it: "Nessun dato di classifica", de: "Keine Klassifizierungsdaten" },
  "class.pos": { es: "Pos", en: "Pos", it: "Pos", de: "Pos" },
  "class.gap": { es: "Gap", en: "Gap", it: "Gap", de: "Gap" },
  "class.interval": { es: "Int.", en: "Int.", it: "Int.", de: "Int." },
  "class.avg": { es: "Media", en: "Avg", it: "Media", de: "Schn." },

  // === Adjusted Classification ===
  "adjusted.title": { es: "Clasificacion Ajustada", en: "Adjusted Classification", it: "Classifica Corretta", de: "Bereinigte Klassifizierung" },
  "adjusted.missingPits": { es: "Pits pend.", en: "Missing pits", it: "Pit manc.", de: "Fehl. Pits" },
  "adjusted.adjustedLaps": { es: "Vlt. Ajust.", en: "Adj. Laps", it: "Giri Corr.", de: "Ber. Runden" },
  "adjusted.adjustedDist": { es: "Dist. Ajust.", en: "Adj. Dist.", it: "Dist. Corr.", de: "Ber. Dist." },
  "adjusted.noData": { es: "Sin datos de carrera", en: "No race data", it: "Nessun dato di gara", de: "Keine Renndaten" },
  "adjusted.explanation": { es: "Clasificacion ajustada igualando paradas a {maxPits} pits (equipo con mas paradas)", en: "Classification adjusted equalizing stops to {maxPits} pits (team with most stops)", it: "Classifica corretta equalizzando le soste a {maxPits} pit (squadra con piu soste)", de: "Klassifizierung bereinigt auf {maxPits} Pits (Team mit den meisten Stopps)" },
  "adjusted.gapMeters": { es: "Dif. (m)", en: "Gap (m)", it: "Diff. (m)", de: "Abst. (m)" },
  "adjusted.gapSeconds": { es: "Dif. (s)", en: "Gap (s)", it: "Diff. (s)", de: "Abst. (s)" },
  "adjusted.intMeters": { es: "Int. (m)", en: "Int. (m)", it: "Int. (m)", de: "Int. (m)" },
  "adjusted.intSeconds": { es: "Int. (s)", en: "Int. (s)", it: "Int. (s)", de: "Int. (s)" },

  // === Live Timing ===
  "live.loading": { es: "Cargando...", en: "Loading...", it: "Caricamento...", de: "Laden..." },
  "live.noUrl": { es: "No hay URL de live timing configurada para este circuito.", en: "No live timing URL configured for this circuit.", it: "Nessun URL di live timing configurato per questo circuito.", de: "Keine Live-Timing-URL fur diese Strecke konfiguriert." },
  "live.configHint": { es: "Configura el campo \"Live Timing URL\" en Admin > Circuitos.", en: "Configure the \"Live Timing URL\" field in Admin > Circuits.", it: "Configura il campo \"Live Timing URL\" in Admin > Circuiti.", de: "Konfiguriere das Feld \"Live Timing URL\" unter Admin > Strecken." },

  // === Config Panel ===
  "config.raceSession": { es: "Sesion de Carrera", en: "Race Session", it: "Sessione di Gara", de: "Rennsitzung" },
  "config.active": { es: "Activa", en: "Active", it: "Attiva", de: "Aktiv" },
  "config.circuit": { es: "Circuito", en: "Circuit", it: "Circuito", de: "Strecke" },
  "config.selectCircuit": { es: "Seleccionar circuito...", en: "Select circuit...", it: "Seleziona circuito...", de: "Strecke auswahlen..." },
  "config.wsPort": { es: "Puerto WS", en: "WS Port", it: "Porta WS", de: "WS Port" },
  "config.duration": { es: "Duracion (min)", en: "Duration (min)", it: "Durata (min)", de: "Dauer (Min)" },
  "config.ourKart": { es: "Nuestro kart", en: "Our kart", it: "Il nostro kart", de: "Unser Kart" },
  "config.minStint": { es: "Stint min (min)", en: "Min stint (min)", it: "Stint min (min)", de: "Min Stint (Min)" },
  "config.maxStint": { es: "Stint max (min)", en: "Max stint (min)", it: "Stint max (min)", de: "Max Stint (Min)" },
  "config.minPits": { es: "Pits minimos", en: "Min pits", it: "Pit minimi", de: "Min Pits" },
  "config.pitTime": { es: "Tiempo pit (s)", en: "Pit time (s)", it: "Tempo pit (s)", de: "Pit-Zeit (s)" },
  "config.minDriverTime": { es: "Tiempo min piloto (min)", en: "Min driver time (min)", it: "Tempo min pilota (min)", de: "Min Fahrerzeit (Min)" },
  "config.refresh": { es: "Refresh (s)", en: "Refresh (s)", it: "Refresh (s)", de: "Refresh (s)" },
  "config.boxLines": { es: "Lineas box", en: "Box lines", it: "Linee box", de: "Box-Reihen" },
  "config.boxKarts": { es: "Karts en box", en: "Karts in box", it: "Kart nel box", de: "Karts in Box" },
  "config.pitClosedStart": { es: "Pit cerrado inicio (min)", en: "Pit closed start (min)", it: "Pit chiuso inizio (min)", de: "Pit geschlossen Start (Min)" },
  "config.pitClosedEnd": { es: "Pit cerrado final (min)", en: "Pit closed end (min)", it: "Pit chiuso fine (min)", de: "Pit geschlossen Ende (Min)" },
  "config.rainMode": { es: "Modo lluvia", en: "Rain mode", it: "Modalita pioggia", de: "Regenmodus" },
  "config.rainHint": { es: "(desactiva filtro de outliers)", en: "(disables outlier filter)", it: "(disattiva filtro outlier)", de: "(deaktiviert Ausreisser-Filter)" },
  "config.saving": { es: "Guardando...", en: "Saving...", it: "Salvataggio...", de: "Speichern..." },
  "config.updateSession": { es: "Actualizar sesion", en: "Update session", it: "Aggiorna sessione", de: "Sitzung aktualisieren" },
  "config.createSession": { es: "Crear sesion", en: "Create session", it: "Crea sessione", de: "Sitzung erstellen" },
  "config.loading": { es: "Cargando...", en: "Loading...", it: "Caricamento...", de: "Laden..." },

  // === Team Editor ===
  "teams.title": { es: "Equipos y Pilotos", en: "Teams & Drivers", it: "Squadre e Piloti", de: "Teams & Fahrer" },
  "teams.dragHint": { es: "(arrastra para reordenar)", en: "(drag to reorder)", it: "(trascina per riordinare)", de: "(zum Sortieren ziehen)" },
  "teams.loadLive": { es: "Cargar Live", en: "Load Live", it: "Carica Live", de: "Live laden" },
  "teams.importing": { es: "Importando...", en: "Importing...", it: "Importazione...", de: "Importieren..." },
  "teams.addTeam": { es: "+ Equipo", en: "+ Team", it: "+ Squadra", de: "+ Team" },
  "teams.save": { es: "Guardar", en: "Save", it: "Salva", de: "Speichern" },
  "teams.saving": { es: "Guardando...", en: "Saving...", it: "Salvataggio...", de: "Speichern..." },
  "teams.loadingTeams": { es: "Cargando equipos...", en: "Loading teams...", it: "Caricamento squadre...", de: "Teams laden..." },
  "teams.noTeams": { es: "Sin equipos. Pulsa \"Cargar del LiveTiming\" para importar o \"+ Equipo\" para crear manualmente.", en: "No teams. Click \"Load Live\" to import or \"+ Team\" to create manually.", it: "Nessuna squadra. Premi \"Carica Live\" per importare o \"+ Squadra\" per creare manualmente.", de: "Keine Teams. Klicke \"Live laden\" zum Importieren oder \"+ Team\" zum manuellen Erstellen." },
  "teams.noPilots": { es: "sin pilotos", en: "no drivers", it: "senza piloti", de: "keine Fahrer" },
  "teams.pilots": { es: "piloto(s)", en: "driver(s)", it: "pilota/i", de: "Fahrer" },
  "teams.dragReorder": { es: "Arrastrar para reordenar", en: "Drag to reorder", it: "Trascina per riordinare", de: "Zum Sortieren ziehen" },
  "teams.teamPlaceholder": { es: "Equipo", en: "Team", it: "Squadra", de: "Team" },
  "teams.driverPlaceholder": { es: "Piloto", en: "Driver", it: "Pilota", de: "Fahrer" },
  "teams.addDriver": { es: "+ Piloto", en: "+ Driver", it: "+ Pilota", de: "+ Fahrer" },
  "teams.driversHint": { es: "Pilotos \u2014 Diferencial positivo = mas lento que la referencia", en: "Drivers \u2014 Positive differential = slower than reference", it: "Piloti \u2014 Differenziale positivo = piu lento del riferimento", de: "Fahrer \u2014 Positives Differential = langsamer als Referenz" },
  "teams.noPilotsHint": { es: "Sin pilotos. Pulsa \"Cargar del LiveTiming\" o anade manualmente.", en: "No drivers. Click \"Load Live\" or add manually.", it: "Nessun pilota. Premi \"Carica Live\" o aggiungi manualmente.", de: "Keine Fahrer. Klicke \"Live laden\" oder fuege manuell hinzu." },
  "teams.errorSaving": { es: "Error guardando", en: "Error saving", it: "Errore nel salvataggio", de: "Fehler beim Speichern" },
  "teams.noLiveTeams": { es: "No hay equipos en el live timing. Asegurate de estar conectado a Apex.", en: "No teams in live timing. Make sure you are connected to Apex.", it: "Nessun team nel live timing. Assicurati di essere connesso ad Apex.", de: "Keine Teams im Live-Timing. Stellen Sie sicher, dass Sie mit Apex verbunden sind." },
  "teams.importedWithDrivers": { es: "Importados {count} equipos con pilotos.", en: "Imported {count} teams with drivers.", it: "Importati {count} team con piloti.", de: "{count} Teams mit Fahrern importiert." },
  "teams.importedNoDrivers": { es: "Importados {count} equipos. Sin desglose de pilotos en esta carrera.", en: "Imported {count} teams. No driver breakdown in this race.", it: "Importati {count} team. Nessun dettaglio piloti in questa gara.", de: "{count} Teams importiert. Keine Fahreraufschlusselung in diesem Rennen." },
  "teams.errorImporting": { es: "Error importando", en: "Error importing", it: "Errore nell'importazione", de: "Fehler beim Importieren" },

  // === Admin: Tabs ===
  "admin.users": { es: "Usuarios", en: "Users", it: "Utenti", de: "Benutzer" },
  "admin.circuits": { es: "Circuitos", en: "Circuits", it: "Circuiti", de: "Strecken" },
  "admin.hub": { es: "CircuitHub", en: "CircuitHub", it: "CircuitHub", de: "CircuitHub" },
  "admin.replay": { es: "Replay", en: "Replay", it: "Replay", de: "Replay" },
  "admin.analytics": { es: "Kart Analytics", en: "Kart Analytics", it: "Kart Analytics", de: "Kart Analytics" },

  // === Admin: Users ===
  "admin.usersTitle": { es: "Usuarios", en: "Users", it: "Utenti", de: "Benutzer" },
  "admin.userPlaceholder": { es: "Usuario", en: "Username", it: "Utente", de: "Benutzer" },
  "admin.devicesShort": { es: "Disp.", en: "Dev.", it: "Disp.", de: "Ger." },
  "admin.devicesTitle": { es: "Max dispositivos", en: "Max devices", it: "Max dispositivi", de: "Max Gerate" },
  "admin.create": { es: "Crear", en: "Create", it: "Crea", de: "Erstellen" },
  "admin.delete": { es: "Eliminar", en: "Delete", it: "Elimina", de: "Loschen" },
  "admin.deleteUser": { es: "Eliminar usuario?", en: "Delete user?", it: "Eliminare utente?", de: "Benutzer loschen?" },

  // === Admin: Access ===
  "admin.circuitAccess": { es: "Acceso a Circuitos", en: "Circuit Access", it: "Accesso ai Circuiti", de: "Streckenzugang" },
  "admin.selectCircuitPlaceholder": { es: "Circuito...", en: "Circuit...", it: "Circuito...", de: "Strecke..." },
  "admin.grantAccess": { es: "Dar acceso", en: "Grant access", it: "Concedi accesso", de: "Zugang gewahren" },
  "admin.from": { es: "Desde", en: "From", it: "Da", de: "Von" },
  "admin.until": { es: "Hasta", en: "Until", it: "A", de: "Bis" },
  "admin.revoke": { es: "Revocar", en: "Revoke", it: "Revoca", de: "Widerrufen" },
  "admin.noAccess": { es: "Sin acceso a circuitos", en: "No circuit access", it: "Nessun accesso ai circuiti", de: "Kein Streckenzugang" },
  "admin.activeSessions": { es: "Sesiones activas", en: "Active sessions", it: "Sessioni attive", de: "Aktive Sitzungen" },
  "admin.killSession": { es: "Cerrar sesion", en: "Kill session", it: "Chiudi sessione", de: "Sitzung beenden" },
  "admin.killAll": { es: "Cerrar todas", en: "Kill all", it: "Chiudi tutte", de: "Alle beenden" },
  "admin.killAllSessionsConfirm": { es: "Cerrar todas las sesiones de este usuario?", en: "Close all sessions for this user?", it: "Chiudere tutte le sessioni di questo utente?", de: "Alle Sitzungen dieses Benutzers schliessen?" },
  "admin.noSessions": { es: "Sin sesiones activas", en: "No active sessions", it: "Nessuna sessione attiva", de: "Keine aktiven Sitzungen" },
  "admin.selectUserHint": { es: "Selecciona un usuario para gestionar su acceso", en: "Select a user to manage access", it: "Seleziona un utente per gestire l'accesso", de: "Wahle einen Benutzer um den Zugang zu verwalten" },
  "admin.tabs": { es: "Pestanas", en: "Tabs", it: "Schede", de: "Tabs" },
  "admin.allTabs": { es: "Todas", en: "All", it: "Tutte", de: "Alle" },
  "admin.newUser": { es: "Nuevo usuario", en: "New user", it: "Nuovo utente", de: "Neuer Benutzer" },
  "admin.noUsers": { es: "No hay usuarios", en: "No users", it: "Nessun utente", de: "Keine Benutzer" },

  // === Admin: Circuits ===
  "admin.circuitCatalog": { es: "Catalogo de Circuitos", en: "Circuit Catalog", it: "Catalogo Circuiti", de: "Streckenkatalog" },
  "admin.new": { es: "Nuevo", en: "New", it: "Nuovo", de: "Neu" },
  "admin.editCircuit": { es: "Editar circuito", en: "Edit circuit", it: "Modifica circuito", de: "Strecke bearbeiten" },
  "admin.newCircuit": { es: "Nuevo circuito", en: "New circuit", it: "Nuovo circuito", de: "Neue Strecke" },
  "admin.name": { es: "Nombre", en: "Name", it: "Nome", de: "Name" },
  "admin.namePlaceholder": { es: "Nombre del circuito", en: "Circuit name", it: "Nome del circuito", de: "Streckenname" },
  "admin.wsPort": { es: "WS Port (wss)", en: "WS Port (wss)", it: "WS Port (wss)", de: "WS Port (wss)" },
  "admin.wsPortData": { es: "WS Data (ws)", en: "WS Data (ws)", it: "WS Data (ws)", de: "WS Data (ws)" },
  "admin.length": { es: "Longitud (m)", en: "Length (m)", it: "Lunghezza (m)", de: "Lange (m)" },
  "admin.pitTime": { es: "Pit Time (s)", en: "Pit Time (s)", it: "Pit Time (s)", de: "Pit-Zeit (s)" },
  "admin.phpApiPort": { es: "PHP API Port", en: "PHP API Port", it: "PHP API Port", de: "PHP API Port" },
  "admin.lapsDiscard": { es: "Vtas. descarte", en: "Discard laps", it: "Giri scarto", de: "Verwerf. Runden" },
  "admin.lapDifferential": { es: "Diferencial (ms)", en: "Differential (ms)", it: "Differenziale (ms)", de: "Differential (ms)" },
  "admin.retentionDays": { es: "Retención (días)", en: "Retention (days)", it: "Conservazione (gg)", de: "Aufbewahrung (Tage)" },
  "admin.save": { es: "Guardar", en: "Save", it: "Salva", de: "Speichern" },
  "admin.cancel": { es: "Cancelar", en: "Cancel", it: "Annulla", de: "Abbrechen" },
  "admin.deleteCircuit": { es: "Eliminar este circuito", en: "Delete this circuit", it: "Elimina questo circuito", de: "Diese Strecke loschen" },
  "admin.confirmDeleteCircuit": { es: "Eliminar circuito? Se perderan los accesos asociados.", en: "Delete circuit? Associated access will be lost.", it: "Eliminare circuito? Gli accessi associati andranno persi.", de: "Strecke loschen? Zugehorige Zugangsrechte gehen verloren." },
  "admin.noCircuits": { es: "No hay circuitos", en: "No circuits", it: "Nessun circuito", de: "Keine Strecken" },

  // === Admin: CircuitHub ===
  "hub.title": { es: "CircuitHub \u2014 Estado en tiempo real", en: "CircuitHub \u2014 Real-time status", it: "CircuitHub \u2014 Stato in tempo reale", de: "CircuitHub \u2014 Echtzeit-Status" },
  "hub.connected": { es: "conectados", en: "connected", it: "connessi", de: "verbunden" },
  "hub.subscribers": { es: "suscriptores", en: "subscribers", it: "abbonati", de: "Abonnenten" },
  "hub.status": { es: "Estado", en: "Status", it: "Stato", de: "Status" },
  "hub.circuit": { es: "Circuito", en: "Circuit", it: "Circuito", de: "Strecke" },
  "hub.messages": { es: "Mensajes", en: "Messages", it: "Messaggi", de: "Nachrichten" },
  "hub.usersCol": { es: "Usuarios", en: "Users", it: "Utenti", de: "Benutzer" },
  "hub.action": { es: "Accion", en: "Action", it: "Azione", de: "Aktion" },
  "hub.stop": { es: "Parar", en: "Stop", it: "Ferma", de: "Stoppen" },
  "hub.start": { es: "Arrancar", en: "Start", it: "Avvia", de: "Starten" },
  "hub.loading": { es: "Cargando...", en: "Loading...", it: "Caricamento...", de: "Laden..." },

  // === Admin: Replay ===
  "replay.title": { es: "Replay de Carreras", en: "Race Replay", it: "Replay delle Gare", de: "Rennwiedergabe" },
  "replay.circuit": { es: "Circuito", en: "Circuit", it: "Circuito", de: "Strecke" },
  "replay.date": { es: "Fecha", en: "Date", it: "Data", de: "Datum" },
  "replay.select": { es: "Seleccionar...", en: "Select...", it: "Seleziona...", de: "Auswahlen..." },
  "replay.showLegacy": { es: "Mostrar", en: "Show", it: "Mostra", de: "Zeige" },
  "replay.hideLegacy": { es: "Ocultar", en: "Hide", it: "Nascondi", de: "Verberge" },
  "replay.oldRecordings": { es: "grabaciones antiguas", en: "old recordings", it: "registrazioni vecchie", de: "alte Aufnahmen" },
  "replay.selectOldLog": { es: "Seleccionar log antiguo...", en: "Select old log...", it: "Seleziona log vecchio...", de: "Altes Log auswahlen..." },
  "replay.blocks": { es: "bloques", en: "blocks", it: "blocchi", de: "Blocke" },
  "replay.clickToSeek": { es: "Click para posicionarte", en: "Click to seek", it: "Clicca per posizionarti", de: "Klicke zum Spulen" },
  "replay.raceN": { es: "Carrera", en: "Race", it: "Gara", de: "Rennen" },
  "replay.analyzing": { es: "Analizando fichero...", en: "Analyzing file...", it: "Analisi del file...", de: "Datei analysieren..." },
  "replay.speed": { es: "Velocidad", en: "Speed", it: "Velocita", de: "Geschwindigkeit" },
  "replay.start": { es: "Iniciar", en: "Start", it: "Avvia", de: "Starten" },
  "replay.resume": { es: "Reanudar", en: "Resume", it: "Riprendi", de: "Fortsetzen" },
  "replay.pause": { es: "Pausar", en: "Pause", it: "Pausa", de: "Pause" },
  "replay.stopBtn": { es: "Parar", en: "Stop", it: "Ferma", de: "Stoppen" },
  "replay.daysRecorded": { es: "dias grabados", en: "days recorded", it: "giorni registrati", de: "aufgezeichnete Tage" },
  "replay.daysShort": { es: "dias", en: "days", it: "giorni", de: "Tage" },
  "replay.noRecordings": { es: "No hay grabaciones disponibles", en: "No recordings available", it: "Nessuna registrazione disponibile", de: "Keine Aufnahmen verfugbar" },
  "replay.noDaysInRange": { es: "No hay grabaciones en el rango seleccionado", en: "No recordings in the selected range", it: "Nessuna registrazione nell'intervallo selezionato", de: "Keine Aufnahmen im ausgewahlten Zeitraum" },
  "replay.noData": { es: "Sin datos", en: "No data", it: "Nessun dato", de: "Keine Daten" },

  // === Admin: Kart Analytics ===
  "analytics.title": { es: "Analisis de Karts por Circuito", en: "Kart Analysis by Circuit", it: "Analisi Kart per Circuito", de: "Kart-Analyse nach Strecke" },
  "analytics.circuit": { es: "Circuito", en: "Circuit", it: "Circuito", de: "Strecke" },
  "analytics.select": { es: "Seleccionar...", en: "Select...", it: "Seleziona...", de: "Auswahlen..." },
  "analytics.from": { es: "Desde", en: "From", it: "Da", de: "Von" },
  "analytics.to": { es: "Hasta", en: "To", it: "A", de: "Bis" },
  "analytics.search": { es: "Buscar", en: "Search", it: "Cerca", de: "Suchen" },
  "analytics.loading": { es: "Cargando...", en: "Loading...", it: "Caricamento...", de: "Laden..." },
  "analytics.racesFound": { es: "carreras encontradas", en: "races found", it: "gare trovate", de: "Rennen gefunden" },
  "analytics.karts": { es: "karts", en: "karts", it: "kart", de: "Karts" },
  "analytics.validLaps": { es: "vueltas validas", en: "valid laps", it: "giri validi", de: "gultige Runden" },
  "analytics.performance": { es: "Rendimiento de Karts", en: "Kart Performance", it: "Prestazioni dei Kart", de: "Kart-Leistung" },
  "analytics.sortedByTop5": { es: "ordenados por media top 5", en: "sorted by top 5 avg", it: "ordinati per media top 5", de: "sortiert nach Top 5 Durchschnitt" },
  "analytics.top5Avg": { es: "Top 5 Media", en: "Top 5 Avg", it: "Top 5 Media", de: "Top 5 Schn." },
  "analytics.generalAvg": { es: "Media General", en: "General Avg", it: "Media Generale", de: "Allg. Schn." },
  "analytics.bestLap": { es: "Mejor Vuelta", en: "Best Lap", it: "Miglior Giro", de: "Beste Runde" },
  "analytics.races": { es: "Carreras", en: "Races", it: "Gare", de: "Rennen" },
  "analytics.lapsCol": { es: "Vueltas", en: "Laps", it: "Giri", de: "Runden" },
  "analytics.teams": { es: "Equipos", en: "Teams", it: "Squadre", de: "Teams" },
  "analytics.fast": { es: "Rapido", en: "Fast", it: "Veloce", de: "Schnell" },
  "analytics.goodPace": { es: "Buen ritmo", en: "Good pace", it: "Buon ritmo", de: "Gutes Tempo" },
  "analytics.normal": { es: "Normal", en: "Normal", it: "Normale", de: "Normal" },
  "analytics.slow": { es: "Lento", en: "Slow", it: "Lento", de: "Langsam" },
  "analytics.verySlow": { es: "Muy lento", en: "Very slow", it: "Molto lento", de: "Sehr langsam" },
  "analytics.noData": { es: "No hay datos de carreras para este circuito en el rango seleccionado.", en: "No race data for this circuit in the selected range.", it: "Nessun dato di gara per questo circuito nell'intervallo selezionato.", de: "Keine Renndaten fur diese Strecke im ausgewahlten Zeitraum." },
  "analytics.autoSaveHint": { es: "Los datos se guardan automaticamente al finalizar cada sesion de monitoreo.", en: "Data is saved automatically when each monitoring session ends.", it: "I dati vengono salvati automaticamente al termine di ogni sessione di monitoraggio.", de: "Daten werden automatisch gespeichert, wenn jede Uberwachungssitzung endet." },
  "analytics.retention": { es: "Retención", en: "Retention", it: "Conservazione", de: "Aufbewahrung" },
  "analytics.days": { es: "días", en: "days", it: "giorni", de: "Tage" },
  "analytics.circuitsCol": { es: "Circuitos", en: "Circuits", it: "Circuiti", de: "Strecken" },
  "analytics.racesShort": { es: "carreras", en: "races", it: "gare", de: "Rennen" },
  "analytics.lapsShort": { es: "vueltas", en: "laps", it: "giri", de: "Runden" },

  // === Driver View ===
  "driver.title": { es: "Vista Piloto", en: "Driver View", it: "Vista Pilota", de: "Fahreransicht" },
  "driver.noKart": { es: "No hay kart seleccionado", en: "No kart selected", it: "Nessun kart selezionato", de: "Kein Kart ausgewahlt" },
  "driver.noKartHint": { es: "Selecciona tu kart en Configuracion", en: "Select your kart in Config", it: "Seleziona il tuo kart in Configurazione", de: "Wahle dein Kart in Einstellungen" },
  "driver.pace": { es: "Ritmo", en: "Pace", it: "Ritmo", de: "Tempo" },
  "driver.lastLap": { es: "Ultima vuelta", en: "Last lap", it: "Ultimo giro", de: "Letzte Runde" },
  "driver.fasterLap": { es: "Mas rapida", en: "Faster", it: "Piu veloce", de: "Schneller" },
  "driver.slowerLap": { es: "Mas lenta", en: "Slower", it: "Piu lenta", de: "Langsamer" },
  "driver.pacePosition": { es: "Pos. Ritmo", en: "Pace Pos.", it: "Pos. Ritmo", de: "Tempo Pos." },
  "driver.gapAhead": { es: "Delante", en: "Ahead", it: "Davanti", de: "Vorne" },
  "driver.gapBehind": { es: "Detras", en: "Behind", it: "Dietro", de: "Hinten" },
  "driver.last": { es: "Ultimo", en: "Last", it: "Ultimo", de: "Letzter" },
  "driver.realPosition": { es: "Pos. Real", en: "Real Pos.", it: "Pos. Reale", de: "Echte Pos." },
  "driver.boxScore": { es: "Punt. Box", en: "Box Score", it: "Punt. Box", de: "Box Punkt." },
  "driver.dragHint": { es: "Arrastra para reordenar", en: "Drag to reorder", it: "Trascina per riordinare", de: "Ziehen zum Umsortieren" },
  "driver.open": { es: "Piloto", en: "Driver", it: "Pilota", de: "Fahrer" },
  "driver.connecting": { es: "Conectando...", en: "Connecting...", it: "Connessione...", de: "Verbindung..." },
  "driver.boxAlert": { es: "BOX BOX BOX", en: "BOX BOX BOX", it: "BOX BOX BOX", de: "BOX BOX BOX" },
  "driver.tapDismiss": { es: "Toca para cerrar", en: "Tap to dismiss", it: "Tocca per chiudere", de: "Tippen zum Schliessen" },

  // BOX call button
  "box.callBox": { es: "Llamar a BOX", en: "Call BOX", it: "Chiama BOX", de: "BOX rufen" },
  "box.sent": { es: "Enviado!", en: "Sent!", it: "Inviato!", de: "Gesendet!" },

  // === Common ===
  "common.loading": { es: "Cargando...", en: "Loading...", it: "Caricamento...", de: "Laden..." },
  "common.error": { es: "Error", en: "Error", it: "Errore", de: "Fehler" },
  "common.close": { es: "Cerrar", en: "Close", it: "Chiudi", de: "Schliessen" },
  "common.yes": { es: "SI", en: "YES", it: "SI", de: "JA" },
};

/**
 * Get translation function for current language.
 * Usage: const t = useT(); t("key") or t("key", { count: 5 })
 */
export function useT(): (key: string, params?: Record<string, string | number>) => string {
  const lang = useLangStore((s) => s.lang);
  return (key: string, params?: Record<string, string | number>) => {
    const entry = translations[key];
    let text = entry?.[lang] ?? entry?.["es"] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  };
}
