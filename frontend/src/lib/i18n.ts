"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Language = "es" | "en" | "it" | "de" | "fr";

export const LANGUAGES: { code: Language; label: string; flag: string }[] = [
  { code: "es", label: "Espanol", flag: "🇪🇸" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
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
  "status.race": { es: "Carrera", en: "Race", it: "Gara", de: "Rennen", fr: "Course" },
  "status.devices": { es: "Dispositivos", en: "Devices", it: "Dispositivi", de: "Gerate", fr: "Appareils" },
  "status.logout": { es: "Salir", en: "Logout", it: "Esci", de: "Abmelden", fr: "Déconnexion" },
  "status.noCircuit": { es: "Sin circuito", en: "No circuit", it: "Nessun circuito", de: "Keine Strecke", fr: "Aucun circuit" },
  "status.replayPaused": { es: "Replay (pausa)", en: "Replay (paused)", it: "Replay (pausa)", de: "Replay (Pause)", fr: "Replay (pause)" },
  "status.pitClosed": { es: "PIT CERRADO", en: "PIT CLOSED", it: "PIT CHIUSO", de: "PIT GESCHL.", fr: "BOX FERMÉ" },
  "status.pitOpen": { es: "PIT ABIERTO", en: "PIT OPEN", it: "PIT APERTO", de: "PIT OFFEN", fr: "BOX OUVERT" },
  "status.pitReason.regulation_start": { es: "Ventana inicial", en: "Opening window", it: "Finestra iniziale", de: "Startfenster", fr: "Fenêtre initiale" },
  "status.pitReason.regulation_end": { es: "Ventana final", en: "Closing window", it: "Finestra finale", de: "Endfenster", fr: "Fenêtre finale" },
  "status.pitReason.stint_too_short": { es: "Stint mínimo no alcanzado", en: "Stint min not reached", it: "Stint min non raggiunto", de: "Stint-Min nicht erreicht", fr: "Stint min non atteint" },
  "status.pitReason.stint_too_long": { es: "¡Pita ya! Stint máximo superado", en: "Pit now! Stint max exceeded", it: "Box ora! Stint max superato", de: "Sofort Box! Stint-Max überschritten", fr: "Au box ! Stint max dépassé" },
  "status.pitReason.driver_min_time_short": { es: "tiempo mínimo piloto", en: "min driver time", it: "tempo min pilota", de: "Min Fahrerzeit", fr: "temps min pilote" },
  // Generic fallback for closeReason == "driver_min_time" when we don't
  // have a usable blocking_driver + remaining_ms tuple to build the
  // personalized long template. Without this entry the badge subtitle
  // rendered the raw i18n key "status.pitReason.driver_min_time".
  "status.pitReason.driver_min_time": { es: "Tiempo mínimo por piloto no alcanzado", en: "Min driver time not met", it: "Tempo min pilota non raggiunto", de: "Min Fahrerzeit nicht erreicht", fr: "Temps min pilote non atteint" },
  // Fired when the algorithm pads with a ghost "Driver N" because the
  // strategist's `team_drivers_count` is larger than the number of
  // pilots Apex has actually shown driving. Surfacing this in the
  // badge text saves a support request — the fix is for the user to
  // edit team_drivers_count in Configuración → Sesión.
  "status.pitReason.ghost_driver": { es: "Hay un piloto del equipo sin tiempo. Revisa “Pilotos del equipo” en config.", en: "A team driver has no track time. Check “Team drivers” in config.", it: "Un pilota del team senza tempo. Controlla “Piloti del team” in config.", de: "Ein Teamfahrer ohne Zeit. Prüfe “Team-Fahrer” in Konfig.", fr: "Un pilote sans temps de piste. Vérifie « Pilotes de l'équipe » dans config." },
  // Fired when `compute_pit_status` raised an exception and the
  // wrapper fell back to the safe CLOSED state. Helps support
  // distinguish a genuine domain constraint from a backend bug.
  "status.pitReason.compute_error": { es: "Error al calcular el estado del pit", en: "Error computing pit status", it: "Errore nel calcolo dello stato pit", de: "Fehler beim Berechnen des Pit-Status", fr: "Erreur de calcul de l'état du box" },
  // Used as a subtitle when closeReason == "driver_min_time". Receives the
  // blocking driver name + remaining minutes via simple substitution.
  "status.pitReason.driver_min_time_long": {
    es: "{driver} necesita {minutes} min más",
    en: "{driver} needs {minutes} more min",
    it: "{driver} ha bisogno di {minutes} min in più",
    de: "{driver} braucht {minutes} Min mehr",
    fr: "{driver} a besoin de {minutes} min de plus",
  },
  "pit.openIn": { es: "Pit abre en", en: "Pit opens in", it: "Box apre tra", de: "Box öffnet in", fr: "Box ouvre dans" },

  // === Navbar ===
  "nav.race": { es: "Carrera", en: "Race", it: "Gara", de: "Rennen", fr: "Course" },
  "nav.box": { es: "Box", en: "Box", it: "Box", de: "Box", fr: "Box" },
  "nav.live": { es: "Live", en: "Live", it: "Live", de: "Live", fr: "Live" },
  "nav.classification": { es: "Clasificacion", en: "Classification", it: "Classifica", de: "Klassifizierung", fr: "Classement" },
  "nav.config": { es: "Config", en: "Config", it: "Config", de: "Config", fr: "Config" },
  "nav.admin": { es: "Admin", en: "Admin", it: "Admin", de: "Admin", fr: "Admin" },
  "nav.account": { es: "Mi cuenta", en: "My account", it: "Il mio account", de: "Mein Konto", fr: "Mon compte" },
  "nav.adjusted": { es: "Clasif. Real", en: "Real Class.", it: "Class. Reale", de: "Echte Klass.", fr: "Class. Réel" },
  "nav.driver": { es: "Vista Piloto", en: "Driver View", it: "Vista Pilota", de: "Fahreransicht", fr: "Vue Pilote" },
  "nav.driverView": { es: "Vista en vivo", en: "Live View", it: "Vista live", de: "Live-Ansicht", fr: "Vue en direct" },
  "nav.driverConfig": { es: "Configuración", en: "Configuration", it: "Configurazione", de: "Konfiguration", fr: "Configuration" },
  "nav.clasificacion": { es: "Clasificacion", en: "Classification", it: "Classifica", de: "Klassifizierung", fr: "Classement" },
  "nav.adjustedShort": { es: "C.Real", en: "Real", it: "Reale", de: "Echt", fr: "Réel" },
  "nav.replay": { es: "Replay", en: "Replay", it: "Replay", de: "Replay", fr: "Replay" },
  "nav.analytics": { es: "Kart Analytics", en: "Kart Analytics", it: "Kart Analytics", de: "Kart Analytics", fr: "Analyse Kart" },
  "nav.analyticsShort": { es: "Karts", en: "Karts", it: "Karts", de: "Karts", fr: "Karts" },
  "nav.analysis": { es: "Análisis", en: "Analysis", it: "Analisi", de: "Analyse", fr: "Analyse" },
  "nav.insights": { es: "GPS Insights", en: "GPS Insights", it: "GPS Insights", de: "GPS Insights", fr: "GPS Insights" },

  // === Login ===
  "login.username": { es: "Usuario", en: "Username", it: "Utente", de: "Benutzer", fr: "Identifiant" },
  "login.password": { es: "Contrasena", en: "Password", it: "Password", de: "Passwort", fr: "Mot de passe" },
  "login.enter": { es: "ENTRAR", en: "LOGIN", it: "ACCEDI", de: "ANMELDEN", fr: "CONNEXION" },
  "login.entering": { es: "ENTRANDO...", en: "LOGGING IN...", it: "ACCESSO...", de: "ANMELDEN...", fr: "CONNEXION..." },
  "login.wrongCredentials": { es: "Usuario o contrasena incorrectos", en: "Invalid username or password", it: "Utente o password errati", de: "Falscher Benutzer oder Passwort", fr: "Identifiant ou mot de passe incorrect" },
  "login.errorClosingSession": { es: "Error al cerrar la sesion", en: "Error closing session", it: "Errore nella chiusura della sessione", de: "Fehler beim Schliessen der Sitzung", fr: "Erreur lors de la fermeture de la session" },
  "login.deviceLimit": { es: "LIMITE DE DISPOSITIVOS", en: "DEVICE LIMIT", it: "LIMITE DISPOSITIVI", de: "GERATELIMIT", fr: "LIMITE D'APPAREILS" },
  "login.activeSessions": { es: "Sesiones activas", en: "Active sessions", it: "Sessioni attive", de: "Aktive Sitzungen", fr: "Sessions actives" },
  "login.close": { es: "Cerrar", en: "Close", it: "Chiudi", de: "Schliessen", fr: "Fermer" },
  "login.backToLogin": { es: "Volver al login", en: "Back to login", it: "Torna al login", de: "Zuruck zum Login", fr: "Retour à la connexion" },
  "login.noCircuitAccess": { es: "No tienes acceso a ningun circuito. Contacta con el administrador.", en: "You don't have access to any circuit. Contact the administrator.", it: "Non hai accesso a nessun circuito. Contatta l'amministratore.", de: "Sie haben keinen Zugang zu einer Strecke. Kontaktieren Sie den Administrator.", fr: "Vous n'avez accès à aucun circuit. Contactez l'administrateur." },
  "login.mfaPrompt": { es: "Introduce el codigo de tu app de autenticacion", en: "Enter the code from your authenticator app", it: "Inserisci il codice dalla tua app di autenticazione", de: "Geben Sie den Code aus Ihrer Authenticator-App ein", fr: "Saisissez le code de votre application d'authentification" },
  "login.mfaCode": { es: "Codigo MFA", en: "MFA Code", it: "Codice MFA", de: "MFA-Code", fr: "Code MFA" },
  "login.invalidMfaCode": { es: "Codigo MFA invalido", en: "Invalid MFA code", it: "Codice MFA non valido", de: "Ungultiger MFA-Code", fr: "Code MFA invalide" },
  "login.verify": { es: "VERIFICAR", en: "VERIFY", it: "VERIFICA", de: "VERIFIZIEREN", fr: "VÉRIFIER" },

  // === Session Manager ===
  "sessions.connectedDevices": { es: "Dispositivos conectados", en: "Connected devices", it: "Dispositivi collegati", de: "Verbundene Gerate", fr: "Appareils connectés" },
  "sessions.maxDevices": { es: "Maximo", en: "Maximum", it: "Massimo", de: "Maximum", fr: "Maximum" },
  "sessions.devices": { es: "dispositivo(s)", en: "device(s)", it: "dispositivo/i", de: "Gerat(e)", fr: "appareil(s)" },
  "sessions.active": { es: "activo(s)", en: "active", it: "attivo/i", de: "aktiv", fr: "actif(s)" },
  "sessions.loading": { es: "Cargando...", en: "Loading...", it: "Caricamento...", de: "Laden...", fr: "Chargement..." },
  "sessions.thisDevice": { es: "Este dispositivo", en: "This device", it: "Questo dispositivo", de: "Dieses Gerat", fr: "Cet appareil" },
  "sessions.close": { es: "Cerrar", en: "Close", it: "Chiudi", de: "Schliessen", fr: "Fermer" },
  "sessions.closeAllOthers": { es: "Cerrar todas las demas sesiones", en: "Close all other sessions", it: "Chiudi tutte le altre sessioni", de: "Alle anderen Sitzungen schliessen", fr: "Fermer toutes les autres sessions" },

  // === Race Table ===
  "race.noData": { es: "Sin datos de carrera", en: "No race data", it: "Nessun dato di gara", de: "Keine Renndaten", fr: "Pas de données de course" },
  "race.connectHint": { es: "Conecta al WebSocket de Apex o inicia un replay", en: "Connect to Apex WebSocket or start a replay", it: "Connettiti al WebSocket di Apex o avvia un replay", de: "Verbinde dich mit dem Apex WebSocket oder starte ein Replay", fr: "Connectez-vous au WebSocket d'Apex ou démarrez un replay" },
  "race.kart": { es: "Kart", en: "Kart", it: "Kart", de: "Kart", fr: "Kart" },
  "race.team": { es: "Equipo", en: "Team", it: "Squadra", de: "Team", fr: "Équipe" },
  "race.driver": { es: "Piloto", en: "Driver", it: "Pilota", de: "Fahrer", fr: "Pilote" },
  "race.avg20": { es: "Med.20", en: "Avg.20", it: "Med.20", de: "Schn.20", fr: "Moy.20" },
  "race.avg20Title": { es: "Media ultimas 20 vueltas", en: "Average last 20 laps", it: "Media ultime 20 giri", de: "Durchschnitt letzte 20 Runden", fr: "Moyenne des 20 derniers tours" },
  "race.best3": { es: "Mej.3", en: "Best.3", it: "Mig.3", de: "Best.3", fr: "Meil.3" },
  "race.best3Title": { es: "Media 3 mejores vueltas", en: "Average best 3 laps", it: "Media 3 migliori giri", de: "Durchschnitt beste 3 Runden", fr: "Moyenne des 3 meilleurs tours" },
  "race.last": { es: "Ult.", en: "Last", it: "Ult.", de: "Letzt.", fr: "Dern." },
  "race.best": { es: "Mejor", en: "Best", it: "Migliore", de: "Beste", fr: "Meilleur" },
  "race.laps": { es: "Vlt", en: "Laps", it: "Giri", de: "Rnd", fr: "Tours" },
  "race.pit": { es: "Pit", en: "Pit", it: "Pit", de: "Pit", fr: "Box" },
  "race.stint": { es: "Stint", en: "Stint", it: "Stint", de: "Stint", fr: "Relais" },
  "race.inPit": { es: "En boxes", en: "In pit", it: "Ai box", de: "In der Box", fr: "Au box" },
  "race.onTrack": { es: "En pista", en: "On track", it: "In pista", de: "Auf der Strecke", fr: "En piste" },

  // === Stint metrics ===
  "metric.metric": { es: "Metrica", en: "Metric", it: "Metrica", de: "Metrik", fr: "Métrique" },
  "metric.value": { es: "Valor", en: "Value", it: "Valore", de: "Wert", fr: "Valeur" },
  "metric.currentStint": { es: "Stint en curso", en: "Current stint", it: "Stint in corso", de: "Aktueller Stint", fr: "Relais en cours" },
  "metric.timeToMaxStint": { es: "Tiempo hasta stint maximo", en: "Time to max stint", it: "Tempo al stint massimo", de: "Zeit bis max Stint", fr: "Temps jusqu'au relais max" },
  "metric.lapsToMaxStint": { es: "Vueltas hasta stint maximo", en: "Laps to max stint", it: "Giri al stint massimo", de: "Runden bis max Stint", fr: "Tours jusqu'au relais max" },
  "metric.kartsNearPit": { es: "Karts cerca de PIT", en: "Karts near PIT", it: "Kart vicini al PIT", de: "Karts nahe PIT", fr: "Karts proches du BOX" },
  "metric.maxStint": { es: "Stint maximo", en: "Max stint", it: "Stint massimo", de: "Max Stint", fr: "Relais max" },
  "metric.minStint": { es: "Stint minimo", en: "Min stint", it: "Stint minimo", de: "Min Stint", fr: "Relais min" },
  "metric.driverLastLap": { es: "Piloto / Ult. vuelta", en: "Driver / Last lap", it: "Pilota / Ultimo giro", de: "Fahrer / Letzte Runde", fr: "Pilote / Dern. tour" },
  "metric.avgLap": { es: "Media 20v", en: "Avg 20 laps", it: "Media 20 giri", de: "Schnitt 20 Rnd", fr: "Moy. 20 tours" },
  "metric.avgPosition": { es: "Posicion por media", en: "Pos. by avg", it: "Pos. per media", de: "Pos. nach Schnitt", fr: "Pos. par moyenne" },

  // === Driver info ===
  "driver.driver": { es: "Piloto", en: "Driver", it: "Pilota", de: "Fahrer", fr: "Pilote" },
  "driver.info": { es: "Info", en: "Info", it: "Info", de: "Info", fr: "Info" },
  "driver.currentDriver": { es: "Piloto actual", en: "Current driver", it: "Pilota attuale", de: "Aktueller Fahrer", fr: "Pilote actuel" },
  "driver.driverTime": { es: "Tiempo piloto", en: "Driver time", it: "Tempo pilota", de: "Fahrerzeit", fr: "Temps pilote" },
  "driver.driverDiffTime": { es: "Dif. Tiempo piloto", en: "Driver time diff.", it: "Diff. Tempo pilota", de: "Fahrerzeit Diff.", fr: "Diff. temps pilote" },
  "driver.stintLaps": { es: "Vueltas en stint", en: "Stint laps", it: "Giri nello stint", de: "Stint-Runden", fr: "Tours dans le relais" },
  "driver.avgPace": { es: "Ritmo medio", en: "Avg pace", it: "Ritmo medio", de: "Durchschn. Tempo", fr: "Rythme moyen" },
  "driver.bestAvg3": { es: "Mejor media (3 mejores)", en: "Best avg (3 best)", it: "Miglior media (3 migliori)", de: "Beste Schn. (3 beste)", fr: "Meilleure moy. (3 meilleurs)" },
  "driver.totalTime": { es: "Tiempo total", en: "Total time", it: "Tempo totale", de: "Gesamtzeit", fr: "Temps total" },
  "driver.avgLap": { es: "Media vuelta", en: "Avg lap", it: "Media giro", de: "Schnitt Runde", fr: "Moy. tour" },
  "driver.remainingMin": { es: "Restante min.", en: "Remaining min.", it: "Minimo restante", de: "Verbleibend Min.", fr: "Min. restant" },
  "driver.minPerDriver": { es: "Min. por piloto", en: "Min. per driver", it: "Min. per pilota", de: "Min. pro Fahrer", fr: "Min. par pilote" },

  // === Pit / FIFO ===
  "pit.pits": { es: "Pits", en: "Pits", it: "Pit", de: "Pits", fr: "Box" },
  "pit.currentPit": { es: "Pit en curso", en: "Current pit", it: "Pit in corso", de: "Aktueller Pit", fr: "Box en cours" },
  "pit.minPitTime": { es: "Tiempo minimo de pit", en: "Min pit time", it: "Tempo minimo di pit", de: "Min Pit-Zeit", fr: "Temps min au box" },
  "pit.pitCount": { es: "Numero de pits", en: "Pit count", it: "Numero di pit", de: "Anzahl Pits", fr: "Nombre de box" },
  "pit.stintLaps": { es: "Vueltas de stint", en: "Stint laps", it: "Giri stint", de: "Stint-Runden", fr: "Tours de relais" },
  "pit.minPitCount": { es: "Numero minimo de pits", en: "Min pit count", it: "Numero minimo di pit", de: "Min Pit-Anzahl", fr: "Nombre min de box" },
  "pit.avgFutureStint": { es: "Media stint futuro", en: "Avg future stint", it: "Media stint futuro", de: "Durchschn. Stint", fr: "Moy. relais futur" },
  "pit.history": { es: "Historial de entradas en box", en: "Pit entry history", it: "Storico ingressi ai box", de: "Boxen-Einfahrts-Historie", fr: "Historique des entrées au box" },
  "pit.time": { es: "Hora", en: "Time", it: "Ora", de: "Zeit", fr: "Heure" },
  "pit.queue": { es: "Cola", en: "Queue", it: "Coda", de: "Warteschlange", fr: "File d'attente" },
  "pit.recentLaps": { es: "Últimas vueltas", en: "Recent laps", it: "Ultimi giri", de: "Letzte Runden", fr: "Derniers tours" },
  "pit.lapNumber": { es: "Vuelta", en: "Lap", it: "Giro", de: "Runde", fr: "Tour" },
  "pit.lapTime": { es: "Tiempo", en: "Time", it: "Tempo", de: "Zeit", fr: "Temps" },
  "pit.lapDriver": { es: "Piloto", en: "Driver", it: "Pilota", de: "Fahrer", fr: "Pilote" },

  // === Classification ===
  "class.noData": { es: "Sin datos de clasificacion", en: "No classification data", it: "Nessun dato di classifica", de: "Keine Klassifizierungsdaten", fr: "Pas de données de classement" },
  "class.pos": { es: "Pos", en: "Pos", it: "Pos", de: "Pos", fr: "Pos" },
  "class.gap": { es: "Gap", en: "Gap", it: "Gap", de: "Gap", fr: "Écart" },
  "class.interval": { es: "Int.", en: "Int.", it: "Int.", de: "Int.", fr: "Int." },
  "class.avg": { es: "Media", en: "Avg", it: "Media", de: "Schn.", fr: "Moy." },

  // === Adjusted Classification ===
  "adjusted.title": { es: "Clasificacion Ajustada", en: "Adjusted Classification", it: "Classifica Corretta", de: "Bereinigte Klassifizierung", fr: "Classement Ajusté" },
  "adjusted.missingPits": { es: "Pits pend.", en: "Missing pits", it: "Pit manc.", de: "Fehl. Pits", fr: "Box manq." },
  "adjusted.adjustedLaps": { es: "Vlt. Ajust.", en: "Adj. Laps", it: "Giri Corr.", de: "Ber. Runden", fr: "Tours Ajust." },
  "adjusted.adjustedDist": { es: "Dist. Ajust.", en: "Adj. Dist.", it: "Dist. Corr.", de: "Ber. Dist.", fr: "Dist. Ajust." },
  "adjusted.noData": { es: "Sin datos de carrera", en: "No race data", it: "Nessun dato di gara", de: "Keine Renndaten", fr: "Pas de données de course" },
  "adjusted.explanation": { es: "Pits oblig.: {minPits} · Ref. pit: {pitRef}s · Carrera: {raceTime}", en: "Mandatory pits: {minPits} · Pit ref: {pitRef}s · Race: {raceTime}", it: "Pit oblig.: {minPits} · Rif. pit: {pitRef}s · Gara: {raceTime}", de: "Pflicht-Pits: {minPits} · Pit Ref: {pitRef}s · Rennen: {raceTime}", fr: "Box oblig. : {minPits} · Réf. box : {pitRef}s · Course : {raceTime}" },
  "adjusted.pendingPits": { es: "Pendient.", en: "Pending", it: "In sospeso", de: "Ausstehend", fr: "En attente" },
  "adjusted.inPit": { es: "en box", en: "in pit", it: "in pit", de: "in Box", fr: "au box" },
  "adjusted.gapMeters": { es: "Dif. (m)", en: "Gap (m)", it: "Diff. (m)", de: "Abst. (m)", fr: "Écart (m)" },
  "adjusted.gapSeconds": { es: "Dif. (s)", en: "Gap (s)", it: "Diff. (s)", de: "Abst. (s)", fr: "Écart (s)" },
  "adjusted.intMeters": { es: "Int. (m)", en: "Int. (m)", it: "Int. (m)", de: "Int. (m)", fr: "Int. (m)" },
  "adjusted.intSeconds": { es: "Int. (s)", en: "Int. (s)", it: "Int. (s)", de: "Int. (s)", fr: "Int. (s)" },

  // === Live Timing ===
  "live.loading": { es: "Cargando...", en: "Loading...", it: "Caricamento...", de: "Laden...", fr: "Chargement..." },
  "live.noUrl": { es: "No hay URL de live timing configurada para este circuito.", en: "No live timing URL configured for this circuit.", it: "Nessun URL di live timing configurato per questo circuito.", de: "Keine Live-Timing-URL fur diese Strecke konfiguriert.", fr: "Aucune URL de live timing configurée pour ce circuit." },
  "live.configHint": { es: "Configura el campo \"Live Timing URL\" en Admin > Circuitos.", en: "Configure the \"Live Timing URL\" field in Admin > Circuits.", it: "Configura il campo \"Live Timing URL\" in Admin > Circuiti.", de: "Konfiguriere das Feld \"Live Timing URL\" unter Admin > Strecken.", fr: "Configurez le champ « Live Timing URL » dans Admin > Circuits." },

  // === Config Panel ===
  "config.raceSession": { es: "Sesion de Carrera", en: "Race Session", it: "Sessione di Gara", de: "Rennsitzung", fr: "Session de Course" },
  "config.sectionRace": { es: "Carrera", en: "Race", it: "Gara", de: "Rennen", fr: "Course" },
  "config.sectionPitStops": { es: "Pit Stops", en: "Pit Stops", it: "Pit Stop", de: "Boxenstopps", fr: "Arrêts au box" },
  "config.sectionStints": { es: "Stints y Pilotos", en: "Stints & Drivers", it: "Stint e Piloti", de: "Stints & Fahrer", fr: "Relais et Pilotes" },
  "config.active": { es: "Activa", en: "Active", it: "Attiva", de: "Aktiv", fr: "Active" },
  "config.circuit": { es: "Circuito", en: "Circuit", it: "Circuito", de: "Strecke", fr: "Circuit" },
  "config.selectCircuit": { es: "Seleccionar circuito...", en: "Select circuit...", it: "Seleziona circuito...", de: "Strecke auswahlen...", fr: "Sélectionner un circuit..." },
  "config.wsPort": { es: "Puerto WS", en: "WS Port", it: "Porta WS", de: "WS Port", fr: "Port WS" },
  "config.duration": { es: "Duracion (min)", en: "Duration (min)", it: "Durata (min)", de: "Dauer (Min)", fr: "Durée (min)" },
  "config.ourKart": { es: "Nuestro kart", en: "Our kart", it: "Il nostro kart", de: "Unser Kart", fr: "Notre kart" },
  "config.minStint": { es: "Stint min (min)", en: "Min stint (min)", it: "Stint min (min)", de: "Min Stint (Min)", fr: "Relais min (min)" },
  "config.maxStint": { es: "Stint max (min)", en: "Max stint (min)", it: "Stint max (min)", de: "Max Stint (Min)", fr: "Relais max (min)" },
  "config.minPits": { es: "Pits minimos", en: "Min pits", it: "Pit minimi", de: "Min Pits", fr: "Box min" },
  "config.pitTime": { es: "Tiempo pit (s)", en: "Pit time (s)", it: "Tempo pit (s)", de: "Pit-Zeit (s)", fr: "Temps box (s)" },
  "config.minDriverTime": { es: "Tiempo min piloto (min)", en: "Min driver time (min)", it: "Tempo min pilota (min)", de: "Min Fahrerzeit (Min)", fr: "Temps min pilote (min)" },
  "config.teamDriversCount": { es: "Pilotos del equipo", en: "Team drivers", it: "Piloti del team", de: "Team-Fahrer", fr: "Pilotes de l'équipe" },
  "config.refresh": { es: "Refresh (s)", en: "Refresh (s)", it: "Refresh (s)", de: "Refresh (s)", fr: "Refresh (s)" },
  "config.boxLines": { es: "Lineas box", en: "Box lines", it: "Linee box", de: "Box-Reihen", fr: "Lignes box" },
  "config.boxKarts": { es: "Karts en box", en: "Karts in box", it: "Kart nel box", de: "Karts in Box", fr: "Karts au box" },
  "config.pitClosedStart": { es: "Pit cerrado inicio (min)", en: "Pit closed start (min)", it: "Pit chiuso inizio (min)", de: "Pit geschlossen Start (Min)", fr: "Box fermé début (min)" },
  "config.pitClosedEnd": { es: "Pit cerrado final (min)", en: "Pit closed end (min)", it: "Pit chiuso fine (min)", de: "Pit geschlossen Ende (Min)", fr: "Box fermé fin (min)" },
  "config.rainMode": { es: "Modo lluvia", en: "Rain mode", it: "Modalita pioggia", de: "Regenmodus", fr: "Mode pluie" },
  "config.rainHint": { es: "(desactiva filtro de outliers)", en: "(disables outlier filter)", it: "(disattiva filtro outlier)", de: "(deaktiviert Ausreisser-Filter)", fr: "(désactive le filtre d'outliers)" },
  "config.saving": { es: "Guardando...", en: "Saving...", it: "Salvataggio...", de: "Speichern...", fr: "Enregistrement..." },
  "config.updateSession": { es: "Actualizar sesion", en: "Update session", it: "Aggiorna sessione", de: "Sitzung aktualisieren", fr: "Mettre à jour la session" },
  "config.createSession": { es: "Crear sesion", en: "Create session", it: "Crea sessione", de: "Sitzung erstellen", fr: "Créer une session" },
  "config.loading": { es: "Cargando...", en: "Loading...", it: "Caricamento...", de: "Laden...", fr: "Chargement..." },

  // === Team Editor ===
  "teams.title": { es: "Equipos y Pilotos", en: "Teams & Drivers", it: "Squadre e Piloti", de: "Teams & Fahrer", fr: "Équipes et Pilotes" },
  "teams.dragHint": { es: "(arrastra para reordenar)", en: "(drag to reorder)", it: "(trascina per riordinare)", de: "(zum Sortieren ziehen)", fr: "(glisser pour réorganiser)" },
  "teams.autoLoad": { es: "Auto", en: "Auto", it: "Auto", de: "Auto", fr: "Auto" },
  "teams.autoLoadHint": { es: "Cargar equipos automáticamente al iniciar carrera", en: "Auto-load teams on race start", it: "Caricamento automatico squadre all'avvio gara", de: "Teams automatisch beim Rennstart laden", fr: "Charger les équipes automatiquement au départ" },
  "teams.loadLive": { es: "Cargar Live", en: "Load Live", it: "Carica Live", de: "Live laden", fr: "Charger Live" },
  "teams.importing": { es: "Importando...", en: "Importing...", it: "Importazione...", de: "Importieren...", fr: "Importation..." },
  "teams.addTeam": { es: "+ Equipo", en: "+ Team", it: "+ Squadra", de: "+ Team", fr: "+ Équipe" },
  "teams.save": { es: "Guardar", en: "Save", it: "Salva", de: "Speichern", fr: "Enregistrer" },
  "teams.saving": { es: "Guardando...", en: "Saving...", it: "Salvataggio...", de: "Speichern...", fr: "Enregistrement..." },
  "teams.loadingTeams": { es: "Cargando equipos...", en: "Loading teams...", it: "Caricamento squadre...", de: "Teams laden...", fr: "Chargement des équipes..." },
  "teams.noTeams": { es: "Sin equipos. Pulsa \"Cargar del LiveTiming\" para importar o \"+ Equipo\" para crear manualmente.", en: "No teams. Click \"Load Live\" to import or \"+ Team\" to create manually.", it: "Nessuna squadra. Premi \"Carica Live\" per importare o \"+ Squadra\" per creare manualmente.", de: "Keine Teams. Klicke \"Live laden\" zum Importieren oder \"+ Team\" zum manuellen Erstellen.", fr: "Aucune équipe. Cliquez sur « Charger Live » pour importer ou « + Équipe » pour créer manuellement." },
  "teams.noPilots": { es: "sin pilotos", en: "no drivers", it: "senza piloti", de: "keine Fahrer", fr: "sans pilotes" },
  "teams.pilots": { es: "piloto(s)", en: "driver(s)", it: "pilota/i", de: "Fahrer", fr: "pilote(s)" },
  "teams.dragReorder": { es: "Arrastrar para reordenar", en: "Drag to reorder", it: "Trascina per riordinare", de: "Zum Sortieren ziehen", fr: "Glisser pour réorganiser" },
  "teams.teamPlaceholder": { es: "Equipo", en: "Team", it: "Squadra", de: "Team", fr: "Équipe" },
  "teams.driverPlaceholder": { es: "Piloto", en: "Driver", it: "Pilota", de: "Fahrer", fr: "Pilote" },
  "teams.addDriver": { es: "+ Piloto", en: "+ Driver", it: "+ Pilota", de: "+ Fahrer", fr: "+ Pilote" },
  "teams.driversHint": { es: "Pilotos — Diferencial positivo = mas lento que la referencia", en: "Drivers — Positive differential = slower than reference", it: "Piloti — Differenziale positivo = piu lento del riferimento", de: "Fahrer — Positives Differential = langsamer als Referenz", fr: "Pilotes — Différentiel positif = plus lent que la référence" },
  "teams.noPilotsHint": { es: "Sin pilotos. Pulsa \"Cargar del LiveTiming\" o anade manualmente.", en: "No drivers. Click \"Load Live\" or add manually.", it: "Nessun pilota. Premi \"Carica Live\" o aggiungi manualmente.", de: "Keine Fahrer. Klicke \"Live laden\" oder fuege manuell hinzu.", fr: "Aucun pilote. Cliquez sur « Charger Live » ou ajoutez manuellement." },
  "teams.errorSaving": { es: "Error guardando", en: "Error saving", it: "Errore nel salvataggio", de: "Fehler beim Speichern", fr: "Erreur lors de l'enregistrement" },
  "teams.noLiveTeams": { es: "No hay equipos en el live timing. Asegurate de estar conectado a Apex.", en: "No teams in live timing. Make sure you are connected to Apex.", it: "Nessun team nel live timing. Assicurati di essere connesso ad Apex.", de: "Keine Teams im Live-Timing. Stellen Sie sicher, dass Sie mit Apex verbunden sind.", fr: "Aucune équipe dans le live timing. Vérifiez que vous êtes connecté à Apex." },
  "teams.importedWithDrivers": { es: "Importados {count} equipos con pilotos.", en: "Imported {count} teams with drivers.", it: "Importati {count} team con piloti.", de: "{count} Teams mit Fahrern importiert.", fr: "{count} équipes importées avec pilotes." },
  "teams.importedNoDrivers": { es: "Importados {count} equipos. Sin desglose de pilotos en esta carrera.", en: "Imported {count} teams. No driver breakdown in this race.", it: "Importati {count} team. Nessun dettaglio piloti in questa gara.", de: "{count} Teams importiert. Keine Fahreraufschlusselung in diesem Rennen.", fr: "{count} équipes importées. Pas de détail des pilotes pour cette course." },
  "teams.errorImporting": { es: "Error importando", en: "Error importing", it: "Errore nell'importazione", de: "Fehler beim Importieren", fr: "Erreur lors de l'importation" },

  // === Admin: Tabs ===
  "admin.users": { es: "Usuarios", en: "Users", it: "Utenti", de: "Benutzer", fr: "Utilisateurs" },
  "admin.circuits": { es: "Circuitos", en: "Circuits", it: "Circuiti", de: "Strecken", fr: "Circuits" },
  "admin.hub": { es: "CircuitHub", en: "CircuitHub", it: "CircuitHub", de: "CircuitHub", fr: "CircuitHub" },
  "admin.replay": { es: "Replay", en: "Replay", it: "Replay", de: "Replay", fr: "Replay" },
  "admin.analytics": { es: "Kart Analytics", en: "Kart Analytics", it: "Kart Analytics", de: "Kart Analytics", fr: "Analyse Kart" },

  // === Admin: Users ===
  "admin.usersTitle": { es: "Usuarios", en: "Users", it: "Utenti", de: "Benutzer", fr: "Utilisateurs" },
  "admin.userPlaceholder": { es: "Usuario", en: "Username", it: "Utente", de: "Benutzer", fr: "Identifiant" },
  "admin.devicesShort": { es: "Disp.", en: "Dev.", it: "Disp.", de: "Ger.", fr: "App." },
  "admin.devicesTitle": { es: "Max dispositivos", en: "Max devices", it: "Max dispositivi", de: "Max Gerate", fr: "Max appareils" },
  "admin.create": { es: "Crear", en: "Create", it: "Crea", de: "Erstellen", fr: "Créer" },
  "admin.delete": { es: "Eliminar", en: "Delete", it: "Elimina", de: "Loschen", fr: "Supprimer" },
  "admin.deleteUser": { es: "Eliminar usuario?", en: "Delete user?", it: "Eliminare utente?", de: "Benutzer loschen?", fr: "Supprimer l'utilisateur ?" },

  // === Admin: Access ===
  "admin.circuitAccess": { es: "Acceso a Circuitos", en: "Circuit Access", it: "Accesso ai Circuiti", de: "Streckenzugang", fr: "Accès aux Circuits" },
  "admin.selectCircuitPlaceholder": { es: "Circuito...", en: "Circuit...", it: "Circuito...", de: "Strecke...", fr: "Circuit..." },
  "admin.selectAll": { es: "Seleccionar todos", en: "Select all", it: "Seleziona tutti", de: "Alle auswählen", fr: "Tout sélectionner" },
  "admin.grantAccess": { es: "Dar acceso", en: "Grant access", it: "Concedi accesso", de: "Zugang gewahren", fr: "Accorder l'accès" },
  "admin.from": { es: "Desde", en: "From", it: "Da", de: "Von", fr: "Du" },
  "admin.until": { es: "Hasta", en: "Until", it: "A", de: "Bis", fr: "Au" },
  "admin.revoke": { es: "Revocar", en: "Revoke", it: "Revoca", de: "Widerrufen", fr: "Révoquer" },
  "admin.noAccess": { es: "Sin acceso a circuitos", en: "No circuit access", it: "Nessun accesso ai circuiti", de: "Kein Streckenzugang", fr: "Pas d'accès aux circuits" },
  "admin.activeSessions": { es: "Sesiones activas", en: "Active sessions", it: "Sessioni attive", de: "Aktive Sitzungen", fr: "Sessions actives" },
  "admin.killSession": { es: "Cerrar sesion", en: "Kill session", it: "Chiudi sessione", de: "Sitzung beenden", fr: "Fermer la session" },
  "admin.killAll": { es: "Cerrar todas", en: "Kill all", it: "Chiudi tutte", de: "Alle beenden", fr: "Tout fermer" },
  "admin.killAllSessionsConfirm": { es: "Cerrar todas las sesiones de este usuario?", en: "Close all sessions for this user?", it: "Chiudere tutte le sessioni di questo utente?", de: "Alle Sitzungen dieses Benutzers schliessen?", fr: "Fermer toutes les sessions de cet utilisateur ?" },
  "admin.noSessions": { es: "Sin sesiones activas", en: "No active sessions", it: "Nessuna sessione attiva", de: "Keine aktiven Sitzungen", fr: "Aucune session active" },
  "admin.selectUserHint": { es: "Selecciona un usuario para gestionar su acceso", en: "Select a user to manage access", it: "Seleziona un utente per gestire l'accesso", de: "Wahle einen Benutzer um den Zugang zu verwalten", fr: "Sélectionnez un utilisateur pour gérer son accès" },
  "admin.tabs": { es: "Pestanas", en: "Tabs", it: "Schede", de: "Tabs", fr: "Onglets" },
  "admin.allTabs": { es: "Todas", en: "All", it: "Tutte", de: "Alle", fr: "Toutes" },
  "admin.newUser": { es: "Nuevo usuario", en: "New user", it: "Nuovo utente", de: "Neuer Benutzer", fr: "Nouvel utilisateur" },
  "admin.noUsers": { es: "No hay usuarios", en: "No users", it: "Nessun utente", de: "Keine Benutzer", fr: "Aucun utilisateur" },

  // === Admin: Circuits ===
  "admin.circuitCatalog": { es: "Catalogo de Circuitos", en: "Circuit Catalog", it: "Catalogo Circuiti", de: "Streckenkatalog", fr: "Catalogue des Circuits" },
  "admin.new": { es: "Nuevo", en: "New", it: "Nuovo", de: "Neu", fr: "Nouveau" },
  "admin.editCircuit": { es: "Editar circuito", en: "Edit circuit", it: "Modifica circuito", de: "Strecke bearbeiten", fr: "Modifier le circuit" },
  "admin.newCircuit": { es: "Nuevo circuito", en: "New circuit", it: "Nuovo circuito", de: "Neue Strecke", fr: "Nouveau circuit" },
  "admin.name": { es: "Nombre", en: "Name", it: "Nome", de: "Name", fr: "Nom" },
  "admin.namePlaceholder": { es: "Nombre del circuito", en: "Circuit name", it: "Nome del circuito", de: "Streckenname", fr: "Nom du circuit" },
  "admin.wsPort": { es: "WS Port (wss)", en: "WS Port (wss)", it: "WS Port (wss)", de: "WS Port (wss)", fr: "WS Port (wss)" },
  "admin.wsPortData": { es: "WS Data (ws)", en: "WS Data (ws)", it: "WS Data (ws)", de: "WS Data (ws)", fr: "WS Data (ws)" },
  "admin.length": { es: "Longitud (m)", en: "Length (m)", it: "Lunghezza (m)", de: "Lange (m)", fr: "Longueur (m)" },
  "admin.pitTime": { es: "Pit Time (s)", en: "Pit Time (s)", it: "Pit Time (s)", de: "Pit-Zeit (s)", fr: "Temps box (s)" },
  "admin.phpApiPort": { es: "PHP API Port", en: "PHP API Port", it: "PHP API Port", de: "PHP API Port", fr: "PHP API Port" },
  "admin.lapsDiscard": { es: "Vtas. descarte", en: "Discard laps", it: "Giri scarto", de: "Verwerf. Runden", fr: "Tours écartés" },
  "admin.lapDifferential": { es: "Diferencial (ms)", en: "Differential (ms)", it: "Differenziale (ms)", de: "Differential (ms)", fr: "Différentiel (ms)" },
  "admin.retentionDays": { es: "Retención (días)", en: "Retention (days)", it: "Conservazione (gg)", de: "Aufbewahrung (Tage)", fr: "Conservation (jours)" },
  "admin.warmupLapsToSkip": { es: "Vueltas calentamiento descartadas (media 20v)", en: "Warm-up laps to skip (20-lap avg)", it: "Giri di riscaldamento scartati (media 20)", de: "Warm-up Runden ausgeschlossen (20-Runden-Mittel)", fr: "Tours de chauffe écartés (moy. 20 tours)" },
  "admin.save": { es: "Guardar", en: "Save", it: "Salva", de: "Speichern", fr: "Enregistrer" },
  "admin.cancel": { es: "Cancelar", en: "Cancel", it: "Annulla", de: "Abbrechen", fr: "Annuler" },
  "admin.deleteCircuit": { es: "Eliminar este circuito", en: "Delete this circuit", it: "Elimina questo circuito", de: "Diese Strecke loschen", fr: "Supprimer ce circuit" },
  "admin.confirmDeleteCircuit": { es: "Eliminar circuito? Se perderan los accesos asociados.", en: "Delete circuit? Associated access will be lost.", it: "Eliminare circuito? Gli accessi associati andranno persi.", de: "Strecke loschen? Zugehorige Zugangsrechte gehen verloren.", fr: "Supprimer le circuit ? Les accès associés seront perdus." },
  "admin.noCircuits": { es: "No hay circuitos", en: "No circuits", it: "Nessun circuito", de: "Keine Strecken", fr: "Aucun circuit" },

  // === Admin: CircuitHub ===
  "hub.title": { es: "CircuitHub — Estado en tiempo real", en: "CircuitHub — Real-time status", it: "CircuitHub — Stato in tempo reale", de: "CircuitHub — Echtzeit-Status", fr: "CircuitHub — État en temps réel" },
  "hub.connected": { es: "conectados", en: "connected", it: "connessi", de: "verbunden", fr: "connectés" },
  "hub.subscribers": { es: "suscriptores", en: "subscribers", it: "abbonati", de: "Abonnenten", fr: "abonnés" },
  "hub.status": { es: "Estado", en: "Status", it: "Stato", de: "Status", fr: "État" },
  "hub.circuit": { es: "Circuito", en: "Circuit", it: "Circuito", de: "Strecke", fr: "Circuit" },
  "hub.messages": { es: "Mensajes", en: "Messages", it: "Messaggi", de: "Nachrichten", fr: "Messages" },
  "hub.usersCol": { es: "Usuarios", en: "Users", it: "Utenti", de: "Benutzer", fr: "Utilisateurs" },
  "hub.action": { es: "Accion", en: "Action", it: "Azione", de: "Aktion", fr: "Action" },
  "hub.stop": { es: "Parar", en: "Stop", it: "Ferma", de: "Stoppen", fr: "Arrêter" },
  "hub.start": { es: "Arrancar", en: "Start", it: "Avvia", de: "Starten", fr: "Démarrer" },
  "hub.loading": { es: "Cargando...", en: "Loading...", it: "Caricamento...", de: "Laden...", fr: "Chargement..." },

  // === Admin: Replay ===
  "replay.title": { es: "Replay de Carreras", en: "Race Replay", it: "Replay delle Gare", de: "Rennwiedergabe", fr: "Replay des Courses" },
  "replay.circuit": { es: "Circuito", en: "Circuit", it: "Circuito", de: "Strecke", fr: "Circuit" },
  "replay.date": { es: "Fecha", en: "Date", it: "Data", de: "Datum", fr: "Date" },
  "replay.select": { es: "Seleccionar...", en: "Select...", it: "Seleziona...", de: "Auswahlen...", fr: "Sélectionner..." },
  "replay.showLegacy": { es: "Mostrar", en: "Show", it: "Mostra", de: "Zeige", fr: "Afficher" },
  "replay.hideLegacy": { es: "Ocultar", en: "Hide", it: "Nascondi", de: "Verberge", fr: "Masquer" },
  "replay.oldRecordings": { es: "grabaciones antiguas", en: "old recordings", it: "registrazioni vecchie", de: "alte Aufnahmen", fr: "anciens enregistrements" },
  "replay.selectOldLog": { es: "Seleccionar log antiguo...", en: "Select old log...", it: "Seleziona log vecchio...", de: "Altes Log auswahlen...", fr: "Sélectionner un ancien log..." },
  "replay.blocks": { es: "bloques", en: "blocks", it: "blocchi", de: "Blocke", fr: "blocs" },
  "replay.clickToSeek": { es: "Click para posicionarte", en: "Click to seek", it: "Clicca per posizionarti", de: "Klicke zum Spulen", fr: "Cliquez pour vous positionner" },
  "replay.raceN": { es: "Carrera", en: "Race", it: "Gara", de: "Rennen", fr: "Course" },
  "replay.analyzing": { es: "Analizando fichero...", en: "Analyzing file...", it: "Analisi del file...", de: "Datei analysieren...", fr: "Analyse du fichier..." },
  "replay.speed": { es: "Velocidad", en: "Speed", it: "Velocita", de: "Geschwindigkeit", fr: "Vitesse" },
  "replay.start": { es: "Iniciar", en: "Start", it: "Avvia", de: "Starten", fr: "Démarrer" },
  "replay.resume": { es: "Reanudar", en: "Resume", it: "Riprendi", de: "Fortsetzen", fr: "Reprendre" },
  "replay.pause": { es: "Pausar", en: "Pause", it: "Pausa", de: "Pause", fr: "Pause" },
  "replay.stopBtn": { es: "Parar", en: "Stop", it: "Ferma", de: "Stoppen", fr: "Arrêter" },
  "replay.daysRecorded": { es: "dias grabados", en: "days recorded", it: "giorni registrati", de: "aufgezeichnete Tage", fr: "jours enregistrés" },
  "replay.daysShort": { es: "dias", en: "days", it: "giorni", de: "Tage", fr: "jours" },
  "replay.noRecordings": { es: "No hay grabaciones disponibles", en: "No recordings available", it: "Nessuna registrazione disponibile", de: "Keine Aufnahmen verfugbar", fr: "Aucun enregistrement disponible" },
  "replay.noDaysInRange": { es: "No hay grabaciones en el rango seleccionado", en: "No recordings in the selected range", it: "Nessuna registrazione nell'intervallo selezionato", de: "Keine Aufnahmen im ausgewahlten Zeitraum", fr: "Aucun enregistrement dans la plage sélectionnée" },
  "replay.noData": { es: "Sin datos", en: "No data", it: "Nessun dato", de: "Keine Daten", fr: "Aucune donnée" },
  "replay.play": { es: "Reproducir", en: "Play", it: "Riproduci", de: "Abspielen", fr: "Lire" },
  "replay.download": { es: "Descargar", en: "Download", it: "Scarica", de: "Herunterladen", fr: "Télécharger" },

  // === Admin: Kart Analytics ===
  "analytics.title": { es: "Analisis de Karts por Circuito", en: "Kart Analysis by Circuit", it: "Analisi Kart per Circuito", de: "Kart-Analyse nach Strecke", fr: "Analyse des Karts par Circuit" },
  "analytics.circuit": { es: "Circuito", en: "Circuit", it: "Circuito", de: "Strecke", fr: "Circuit" },
  "analytics.select": { es: "Seleccionar...", en: "Select...", it: "Seleziona...", de: "Auswahlen...", fr: "Sélectionner..." },
  "analytics.from": { es: "Desde", en: "From", it: "Da", de: "Von", fr: "Du" },
  "analytics.to": { es: "Hasta", en: "To", it: "A", de: "Bis", fr: "Au" },
  "analytics.search": { es: "Buscar", en: "Search", it: "Cerca", de: "Suchen", fr: "Rechercher" },
  "analytics.loading": { es: "Cargando...", en: "Loading...", it: "Caricamento...", de: "Laden...", fr: "Chargement..." },
  "analytics.racesFound": { es: "carreras encontradas", en: "races found", it: "gare trovate", de: "Rennen gefunden", fr: "courses trouvées" },
  "analytics.karts": { es: "karts", en: "karts", it: "kart", de: "Karts", fr: "karts" },
  "analytics.validLaps": { es: "vueltas validas", en: "valid laps", it: "giri validi", de: "gultige Runden", fr: "tours valides" },
  "analytics.performance": { es: "Rendimiento de Karts", en: "Kart Performance", it: "Prestazioni dei Kart", de: "Kart-Leistung", fr: "Performance des Karts" },
  "analytics.sortedByTop5": { es: "ordenados por media top 5", en: "sorted by top 5 avg", it: "ordinati per media top 5", de: "sortiert nach Top 5 Durchschnitt", fr: "triés par moyenne top 5" },
  "analytics.top5Avg": { es: "Top 5 Media", en: "Top 5 Avg", it: "Top 5 Media", de: "Top 5 Schn.", fr: "Top 5 Moy." },
  "analytics.generalAvg": { es: "Media General", en: "General Avg", it: "Media Generale", de: "Allg. Schn.", fr: "Moy. Générale" },
  "analytics.bestLap": { es: "Mejor Vuelta", en: "Best Lap", it: "Miglior Giro", de: "Beste Runde", fr: "Meilleur Tour" },
  "analytics.races": { es: "Carreras", en: "Races", it: "Gare", de: "Rennen", fr: "Courses" },
  "analytics.lapsCol": { es: "Vueltas", en: "Laps", it: "Giri", de: "Runden", fr: "Tours" },
  "analytics.teams": { es: "Equipos", en: "Teams", it: "Squadre", de: "Teams", fr: "Équipes" },
  "analytics.fast": { es: "Rapido", en: "Fast", it: "Veloce", de: "Schnell", fr: "Rapide" },
  "analytics.goodPace": { es: "Buen ritmo", en: "Good pace", it: "Buon ritmo", de: "Gutes Tempo", fr: "Bon rythme" },
  "analytics.normal": { es: "Normal", en: "Normal", it: "Normale", de: "Normal", fr: "Normal" },
  "analytics.slow": { es: "Lento", en: "Slow", it: "Lento", de: "Langsam", fr: "Lent" },
  "analytics.verySlow": { es: "Muy lento", en: "Very slow", it: "Molto lento", de: "Sehr langsam", fr: "Très lent" },
  "analytics.noData": { es: "No hay datos de carreras para este circuito en el rango seleccionado.", en: "No race data for this circuit in the selected range.", it: "Nessun dato di gara per questo circuito nell'intervallo selezionato.", de: "Keine Renndaten fur diese Strecke im ausgewahlten Zeitraum.", fr: "Aucune donnée de course pour ce circuit dans la plage sélectionnée." },
  "analytics.autoSaveHint": { es: "Los datos se guardan automaticamente al finalizar cada sesion de monitoreo.", en: "Data is saved automatically when each monitoring session ends.", it: "I dati vengono salvati automaticamente al termine di ogni sessione di monitoraggio.", de: "Daten werden automatisch gespeichert, wenn jede Uberwachungssitzung endet.", fr: "Les données sont enregistrées automatiquement à la fin de chaque session de suivi." },
  "analytics.retention": { es: "Retención", en: "Retention", it: "Conservazione", de: "Aufbewahrung", fr: "Conservation" },
  "analytics.days": { es: "días", en: "days", it: "giorni", de: "Tage", fr: "jours" },
  "analytics.circuitsCol": { es: "Circuitos", en: "Circuits", it: "Circuiti", de: "Strecken", fr: "Circuits" },
  "analytics.racesShort": { es: "carreras", en: "races", it: "gare", de: "Rennen", fr: "courses" },
  "analytics.lapsShort": { es: "vueltas", en: "laps", it: "giri", de: "Runden", fr: "tours" },
  "analytics.filterOutliers": { es: "Filtrar outliers (>10%)", en: "Filter outliers (>10%)", it: "Filtra outlier (>10%)", de: "Ausreißer filtern (>10%)", fr: "Filtrer les outliers (>10%)" },
  "analytics.best5Laps": { es: "Top 5 mejores vueltas", en: "Top 5 best laps", it: "Top 5 migliori giri", de: "Top 5 beste Runden", fr: "Top 5 meilleurs tours" },
  "analytics.date": { es: "Fecha", en: "Date", it: "Data", de: "Datum", fr: "Date" },
  "analytics.team": { es: "Equipo", en: "Team", it: "Squadra", de: "Team", fr: "Équipe" },
  "analytics.driver": { es: "Piloto", en: "Driver", it: "Pilota", de: "Fahrer", fr: "Pilote" },
  "analytics.time": { es: "Tiempo", en: "Time", it: "Tempo", de: "Zeit", fr: "Temps" },
  "analytics.lapNum": { es: "Vuelta", en: "Lap", it: "Giro", de: "Runde", fr: "Tour" },

  // === Driver View ===
  "driver.title": { es: "Vista Piloto", en: "Driver View", it: "Vista Pilota", de: "Fahreransicht", fr: "Vue Pilote" },
  "driver.noKart": { es: "No hay kart seleccionado", en: "No kart selected", it: "Nessun kart selezionato", de: "Kein Kart ausgewahlt", fr: "Aucun kart sélectionné" },
  "driver.noKartHint": { es: "Selecciona tu kart en Configuracion", en: "Select your kart in Config", it: "Seleziona il tuo kart in Configurazione", de: "Wahle dein Kart in Einstellungen", fr: "Sélectionnez votre kart dans Configuration" },
  "driver.pace": { es: "Ritmo", en: "Pace", it: "Ritmo", de: "Tempo", fr: "Rythme" },
  "driver.lastLap": { es: "Ultima vuelta", en: "Last lap", it: "Ultimo giro", de: "Letzte Runde", fr: "Dernier tour" },
  "driver.fasterLap": { es: "Mas rapida", en: "Faster", it: "Piu veloce", de: "Schneller", fr: "Plus rapide" },
  "driver.slowerLap": { es: "Mas lenta", en: "Slower", it: "Piu lenta", de: "Langsamer", fr: "Plus lent" },
  "driver.pacePosition": { es: "Pos. Ritmo", en: "Pace Pos.", it: "Pos. Ritmo", de: "Tempo Pos.", fr: "Pos. Rythme" },
  "driver.gapAhead": { es: "Delante", en: "Ahead", it: "Davanti", de: "Vorne", fr: "Devant" },
  "driver.gapBehind": { es: "Detras", en: "Behind", it: "Dietro", de: "Hinten", fr: "Derrière" },
  "driver.last": { es: "Ultimo", en: "Last", it: "Ultimo", de: "Letzter", fr: "Dernier" },
  "driver.realPosition": { es: "Pos. Real", en: "Real Pos.", it: "Pos. Reale", de: "Echte Pos.", fr: "Pos. Réelle" },
  "driver.boxScore": { es: "Punt. Box", en: "Box Score", it: "Punt. Box", de: "Box Punkt.", fr: "Score Box" },
  "driver.dragHint": { es: "Arrastra para reordenar", en: "Drag to reorder", it: "Trascina per riordinare", de: "Ziehen zum Umsortieren", fr: "Glisser pour réorganiser" },
  "driver.open": { es: "Piloto", en: "Driver", it: "Pilota", de: "Fahrer", fr: "Pilote" },
  "driver.openWindow": { es: "Abrir vista en ventana", en: "Open view in window", it: "Apri vista in finestra", de: "Ansicht in Fenster öffnen", fr: "Ouvrir la vue dans une fenêtre" },
  "driver.bestStintLap": { es: "Mejor vuelta stint", en: "Best stint lap", it: "Miglior giro stint", de: "Beste Stint-Runde", fr: "Meilleur tour du relais" },
  "driver.iosWarning": { es: "Safari y los navegadores de iPhone/iPad no soportan Bluetooth Web (necesario para conectar RaceBox). Si quieres usar RaceBox, necesitas el navegador Bluefy.", en: "Safari and iPhone/iPad browsers don't support Web Bluetooth (required for RaceBox). To use RaceBox, you need the Bluefy browser.", it: "Safari e i browser iPhone/iPad non supportano il Bluetooth Web (necessario per RaceBox). Per usare RaceBox, serve il browser Bluefy.", de: "Safari und iPhone/iPad-Browser unterstützen kein Web Bluetooth (für RaceBox erforderlich). Für RaceBox wird der Bluefy-Browser benötigt.", fr: "Safari et les navigateurs iPhone/iPad ne prennent pas en charge le Bluetooth Web (requis pour RaceBox). Pour utiliser RaceBox, il faut le navigateur Bluefy." },
  "driver.iosDownload": { es: "¿Quieres ir a la App Store para descargar Bluefy? (Pulsa Cancelar para abrir la vista de piloto sin RaceBox)", en: "Go to App Store to download Bluefy? (Press Cancel to open driver view without RaceBox)", it: "Vuoi andare all'App Store per scaricare Bluefy? (Premi Annulla per aprire la vista pilota senza RaceBox)", de: "Zum App Store gehen, um Bluefy herunterzuladen? (Abbrechen drücken, um die Fahreransicht ohne RaceBox zu öffnen)", fr: "Aller sur l'App Store pour télécharger Bluefy ? (Appuyez sur Annuler pour ouvrir la vue pilote sans RaceBox)" },
  "driver.gpsLapDelta": { es: "Delta vuelta anterior GPS", en: "GPS Previous Lap Delta", it: "Delta giro precedente GPS", de: "GPS Vorrundenabweichung", fr: "Delta tour précédent GPS" },
  "driver.gpsSpeed": { es: "Velocidad GPS", en: "GPS Speed", it: "Velocita GPS", de: "GPS Tempo", fr: "Vitesse GPS" },
  "driver.gpsGForce": { es: "Fuerza G", en: "G-Force", it: "Forza G", de: "G-Kraft", fr: "Force G" },
  "driver.gpsLap": { es: "Vuelta GPS", en: "GPS Lap", it: "Giro GPS", de: "GPS Runde", fr: "Tour GPS" },
  "driver.gpsConnect": { es: "Conectar RaceBox", en: "Connect RaceBox", it: "Connetti RaceBox", de: "RaceBox verbinden", fr: "Connecter RaceBox" },
  "driver.gpsDisconnect": { es: "Desconectar", en: "Disconnect", it: "Disconnetti", de: "Trennen", fr: "Déconnecter" },
  "driver.gpsSat": { es: "sat", en: "sat", it: "sat", de: "Sat", fr: "sat" },
  "driver.setFinishP1": { es: "Punto 1 meta", en: "Finish P1", it: "Punto 1 traguardo", de: "Ziel P1", fr: "Point 1 arrivée" },
  "driver.setFinishP2": { es: "Punto 2 meta", en: "Finish P2", it: "Punto 2 traguardo", de: "Ziel P2", fr: "Point 2 arrivée" },
  "driver.finishSet": { es: "Meta configurada", en: "Finish line set", it: "Traguardo configurato", de: "Ziellinie gesetzt", fr: "Ligne d'arrivée configurée" },
  "driver.noFinishLine": { es: "Sin meta", en: "No finish line", it: "Senza traguardo", de: "Keine Ziellinie", fr: "Sans ligne d'arrivée" },
  "driver.maxSpeed": { es: "Max", en: "Max", it: "Max", de: "Max", fr: "Max" },
  "driver.lateral": { es: "Lat", en: "Lat", it: "Lat", de: "Lat", fr: "Lat" },
  "driver.braking": { es: "Fren", en: "Brk", it: "Fren", de: "Brems", fr: "Frein" },
  "driver.connecting": { es: "Conectando...", en: "Connecting...", it: "Connessione...", de: "Verbindung...", fr: "Connexion..." },
  "driver.boxAlert": { es: "BOX BOX BOX", en: "BOX BOX BOX", it: "BOX BOX BOX", de: "BOX BOX BOX", fr: "BOX BOX BOX" },
  "driver.tapDismiss": { es: "Toca para cerrar", en: "Tap to dismiss", it: "Tocca per chiudere", de: "Tippen zum Schliessen", fr: "Touchez pour fermer" },
  "driver.pitWindow": { es: "Ventana Pit", en: "Pit Window", it: "Finestra Pit", de: "Pit Fenster", fr: "Fenêtre Box" },

  // BOX call button
  "box.callBox": { es: "Llamar a BOX", en: "Call BOX", it: "Chiama BOX", de: "BOX rufen", fr: "Appeler au BOX" },
  "box.sent": { es: "Enviado!", en: "Sent!", it: "Inviato!", de: "Gesendet!", fr: "Envoyé !" },

  // === MFA ===
  "mfa.title": { es: "Autenticacion en dos pasos (MFA)", en: "Two-Factor Authentication (MFA)", it: "Autenticazione a due fattori (MFA)", de: "Zwei-Faktor-Authentifizierung (MFA)", fr: "Authentification à deux facteurs (MFA)" },
  "mfa.enabled": { es: "MFA activado", en: "MFA enabled", it: "MFA attivato", de: "MFA aktiviert", fr: "MFA activé" },
  "mfa.disabled": { es: "MFA desactivado", en: "MFA disabled", it: "MFA disattivato", de: "MFA deaktiviert", fr: "MFA désactivé" },
  "mfa.enable": { es: "Activar MFA", en: "Enable MFA", it: "Attiva MFA", de: "MFA aktivieren", fr: "Activer MFA" },
  "mfa.disable": { es: "Desactivar MFA", en: "Disable MFA", it: "Disattiva MFA", de: "MFA deaktivieren", fr: "Désactiver MFA" },
  "mfa.step1": { es: "1. Escanea este codigo QR con tu app de autenticacion (Google Authenticator, Authy, etc.)", en: "1. Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)", it: "1. Scansiona questo codice QR con la tua app di autenticazione (Google Authenticator, Authy, ecc.)", de: "1. Scannen Sie diesen QR-Code mit Ihrer Authenticator-App (Google Authenticator, Authy, etc.)", fr: "1. Scannez ce QR code avec votre application d'authentification (Google Authenticator, Authy, etc.)" },
  "mfa.step2": { es: "2. Introduce el codigo de 6 digitos para verificar", en: "2. Enter the 6-digit code to verify", it: "2. Inserisci il codice a 6 cifre per verificare", de: "2. Geben Sie den 6-stelligen Code zur Verifizierung ein", fr: "2. Saisissez le code à 6 chiffres pour vérifier" },
  "mfa.manualKey": { es: "Clave manual", en: "Manual key", it: "Chiave manuale", de: "Manueller Schlussel", fr: "Clé manuelle" },
  "mfa.verifyAndEnable": { es: "Verificar y activar", en: "Verify and enable", it: "Verifica e attiva", de: "Verifizieren und aktivieren", fr: "Vérifier et activer" },
  "mfa.enterCodeToDisable": { es: "Introduce tu codigo MFA para desactivar", en: "Enter your MFA code to disable", it: "Inserisci il codice MFA per disattivare", de: "Geben Sie Ihren MFA-Code zum Deaktivieren ein", fr: "Saisissez votre code MFA pour désactiver" },
  "mfa.confirmDisable": { es: "Confirmar desactivacion", en: "Confirm disable", it: "Conferma disattivazione", de: "Deaktivierung bestatigen", fr: "Confirmer la désactivation" },
  "mfa.cancel": { es: "Cancelar", en: "Cancel", it: "Annulla", de: "Abbrechen", fr: "Annuler" },
  "mfa.setupError": { es: "Error al configurar MFA", en: "Error setting up MFA", it: "Errore nella configurazione MFA", de: "Fehler bei der MFA-Einrichtung", fr: "Erreur lors de la configuration MFA" },
  "mfa.verifyError": { es: "Codigo invalido. Intentalo de nuevo.", en: "Invalid code. Try again.", it: "Codice non valido. Riprova.", de: "Ungultiger Code. Versuchen Sie es erneut.", fr: "Code invalide. Réessayez." },
  "mfa.disableError": { es: "Codigo invalido. No se pudo desactivar.", en: "Invalid code. Could not disable.", it: "Codice non valido. Impossibile disattivare.", de: "Ungultiger Code. Konnte nicht deaktiviert werden.", fr: "Code invalide. Désactivation impossible." },
  "mfa.successEnabled": { es: "MFA activado correctamente", en: "MFA enabled successfully", it: "MFA attivato con successo", de: "MFA erfolgreich aktiviert", fr: "MFA activé avec succès" },
  "mfa.successDisabled": { es: "MFA desactivado correctamente", en: "MFA disabled successfully", it: "MFA disattivato con successo", de: "MFA erfolgreich deaktiviert", fr: "MFA désactivé avec succès" },
  "mfa.adminReset": { es: "Reset MFA", en: "Reset MFA", it: "Reset MFA", de: "MFA zurucksetzen", fr: "Réinitialiser MFA" },
  "mfa.adminResetConfirm": { es: "Desactivar MFA para este usuario?", en: "Disable MFA for this user?", it: "Disattivare MFA per questo utente?", de: "MFA fur diesen Benutzer deaktivieren?", fr: "Désactiver MFA pour cet utilisateur ?" },
  "mfa.description": { es: "Protege tu cuenta con un codigo temporal de tu telefono", en: "Protect your account with a temporary code from your phone", it: "Proteggi il tuo account con un codice temporaneo dal tuo telefono", de: "Schutzen Sie Ihr Konto mit einem temporaren Code von Ihrem Telefon", fr: "Protégez votre compte avec un code temporaire envoyé sur votre téléphone" },

  // === Common ===
  "common.loading": { es: "Cargando...", en: "Loading...", it: "Caricamento...", de: "Laden...", fr: "Chargement..." },
  "common.error": { es: "Error", en: "Error", it: "Errore", de: "Fehler", fr: "Erreur" },
  "common.close": { es: "Cerrar", en: "Close", it: "Chiudi", de: "Schliessen", fr: "Fermer" },
  "common.yes": { es: "SI", en: "YES", it: "SI", de: "JA", fr: "OUI" },
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
