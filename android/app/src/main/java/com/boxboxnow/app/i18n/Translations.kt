package com.boxboxnow.app.i18n

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf

/**
 * Lightweight i18n layer mirroring the web's `lib/i18n.ts` model
 * and the iOS `I18n.swift` companion: a single global dictionary of
 * `key -> {lang: text}`, a reactive holder that persists the user's
 * choice to SharedPreferences, and a composable `t(...)` reader.
 *
 * Rollout is gradual — anything not in `translations` keeps its
 * hard-coded Spanish text. Migrate one screen at a time without
 * breaking untouched screens.
 */

enum class Language(val code: String, val flag: String, val label: String) {
    ES("es", "🇪🇸", "Español"),
    EN("en", "🇬🇧", "English"),
    IT("it", "🇮🇹", "Italiano"),
    DE("de", "🇩🇪", "Deutsch"),
    FR("fr", "🇫🇷", "Français");

    companion object {
        fun fromCode(code: String?): Language =
            entries.firstOrNull { it.code == code } ?: ES
    }
}

/**
 * Singleton holder for the active language. State is exposed as a
 * Compose `MutableState<Language>` so every `t(...)` call site
 * automatically recomposes when the user flips language from the
 * picker.
 *
 * Initialised lazily — the first call reads the persisted code from
 * SharedPreferences (key `bbn_lang`, same as iOS's `bbn_lang` key
 * for cross-platform parity).
 */
object LanguageStore {
    private const val PREFS_NAME = "bbn_lang_prefs"
    private const val KEY_LANG = "bbn_lang"

    /** Backing state. Reads from SharedPreferences on first access. */
    private var _state: MutableState<Language>? = null

    /** Hydrate from SharedPreferences. Idempotent. */
    fun init(context: Context) {
        if (_state != null) return
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val code = prefs.getString(KEY_LANG, null)
        _state = mutableStateOf(Language.fromCode(code))
    }

    val state: MutableState<Language>
        get() = _state ?: error("LanguageStore not initialised — call LanguageStore.init(context) at App startup")

    /** Update + persist. Composable observers re-render automatically. */
    fun set(context: Context, lang: Language) {
        state.value = lang
        context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_LANG, lang.code)
            .apply()
    }
}

/**
 * CompositionLocal that exposes the active language to descendants.
 * Provided once at the app root after `LanguageStore.init(...)`.
 */
val LocalLanguage = staticCompositionLocalOf { Language.ES }

/**
 * Translate a key in the active language. Falls back to Spanish, and
 * if neither exists returns the key itself — same fail-soft
 * behaviour as the web / iOS layers.
 *
 * Use the no-params overload for static strings; use `t(key, "name"
 * to "value", ...)` for templates with `{placeholders}`.
 */
@Composable
fun t(key: String): String {
    val lang = LocalLanguage.current
    val entry = translations[key] ?: return key
    return entry[lang] ?: entry[Language.ES] ?: key
}

@Composable
fun t(key: String, vararg params: Pair<String, String>): String {
    var out = t(key)
    for ((k, v) in params) {
        out = out.replace("{$k}", v)
    }
    return out
}

// MARK: - Translation catalog

private val translations: Map<String, Map<Language, String>> = mapOf(
    // Common
    "common.cancel"    to mapOf(Language.ES to "Cancelar",     Language.EN to "Cancel",       Language.IT to "Annulla",        Language.DE to "Abbrechen",   Language.FR to "Annuler"),
    "common.save"      to mapOf(Language.ES to "Guardar",      Language.EN to "Save",         Language.IT to "Salva",          Language.DE to "Speichern",   Language.FR to "Enregistrer"),
    "common.delete"    to mapOf(Language.ES to "Eliminar",     Language.EN to "Delete",       Language.IT to "Elimina",        Language.DE to "Löschen",     Language.FR to "Supprimer"),
    "common.edit"      to mapOf(Language.ES to "Editar",       Language.EN to "Edit",         Language.IT to "Modifica",       Language.DE to "Bearbeiten",  Language.FR to "Modifier"),
    "common.done"      to mapOf(Language.ES to "Listo",        Language.EN to "Done",         Language.IT to "Fatto",          Language.DE to "Fertig",      Language.FR to "OK"),
    "common.loading"   to mapOf(Language.ES to "Cargando...",  Language.EN to "Loading...",   Language.IT to "Caricamento...", Language.DE to "Laden...",    Language.FR to "Chargement..."),
    "common.close"     to mapOf(Language.ES to "Cerrar",       Language.EN to "Close",        Language.IT to "Chiudi",         Language.DE to "Schließen",   Language.FR to "Fermer"),
    "common.error"     to mapOf(Language.ES to "Error",        Language.EN to "Error",        Language.IT to "Errore",         Language.DE to "Fehler",      Language.FR to "Erreur"),
    "common.ok"        to mapOf(Language.ES to "OK",           Language.EN to "OK",           Language.IT to "OK",             Language.DE to "OK",          Language.FR to "OK"),
    "common.yes"       to mapOf(Language.ES to "Sí",           Language.EN to "Yes",          Language.IT to "Sì",             Language.DE to "Ja",          Language.FR to "Oui"),
    "common.no"        to mapOf(Language.ES to "No",           Language.EN to "No",           Language.IT to "No",             Language.DE to "Nein",        Language.FR to "Non"),
    "common.add"       to mapOf(Language.ES to "Añadir",       Language.EN to "Add",          Language.IT to "Aggiungi",       Language.DE to "Hinzufügen",  Language.FR to "Ajouter"),
    "common.language"  to mapOf(Language.ES to "Idioma",       Language.EN to "Language",     Language.IT to "Lingua",         Language.DE to "Sprache",     Language.FR to "Langue"),

    // Login
    "login.title"      to mapOf(Language.ES to "Iniciar sesión",         Language.EN to "Sign in",             Language.IT to "Accedi",                Language.DE to "Anmelden",            Language.FR to "Connexion"),
    "login.email"      to mapOf(Language.ES to "Email",                  Language.EN to "Email",               Language.IT to "Email",                 Language.DE to "E-Mail",              Language.FR to "Email"),
    "login.password"   to mapOf(Language.ES to "Contraseña",             Language.EN to "Password",            Language.IT to "Password",              Language.DE to "Passwort",            Language.FR to "Mot de passe"),
    "login.signIn"     to mapOf(Language.ES to "Iniciar sesión",         Language.EN to "Sign in",             Language.IT to "Accedi",                Language.DE to "Anmelden",            Language.FR to "Se connecter"),
    "login.loading"    to mapOf(Language.ES to "Entrando...",            Language.EN to "Signing in...",       Language.IT to "Accesso...",            Language.DE to "Anmelden...",         Language.FR to "Connexion..."),
    "login.forgotPassword" to mapOf(Language.ES to "¿Olvidaste tu contraseña?", Language.EN to "Forgot your password?", Language.IT to "Password dimenticata?", Language.DE to "Passwort vergessen?", Language.FR to "Mot de passe oublié ?"),

    // Home
    "home.viewPilot"        to mapOf(Language.ES to "Vista Piloto",      Language.EN to "Driver View",         Language.IT to "Vista Pilota",          Language.DE to "Fahreransicht",       Language.FR to "Vue Pilote"),
    "home.fullScreen"       to mapOf(Language.ES to "Pantalla completa", Language.EN to "Fullscreen",          Language.IT to "Schermo intero",        Language.DE to "Vollbild",            Language.FR to "Plein écran"),
    "home.config"           to mapOf(Language.ES to "Configuración",     Language.EN to "Settings",            Language.IT to "Impostazioni",          Language.DE to "Einstellungen",       Language.FR to "Configuration"),
    "home.configSubtitle"   to mapOf(Language.ES to "Carrera, Plantillas, GPS", Language.EN to "Race, Templates, GPS", Language.IT to "Gara, Modelli, GPS", Language.DE to "Rennen, Vorlagen, GPS", Language.FR to "Course, Plantillas, GPS"),
    "home.configureSession" to mapOf(Language.ES to "Configura la sesión antes de entrar", Language.EN to "Set up the session first", Language.IT to "Configura la sessione prima", Language.DE to "Sitzung zuerst einrichten", Language.FR to "Configurez la session avant"),
    "home.needKartAndDuration" to mapOf(Language.ES to "Necesitas definir al menos el kart y la duración", Language.EN to "You need at least kart number and duration", Language.IT to "Almeno il kart e la durata", Language.DE to "Mindestens Kart und Dauer", Language.FR to "Au minimum kart et durée"),
    "home.signOut"          to mapOf(Language.ES to "Cerrar sesión",     Language.EN to "Sign out",            Language.IT to "Esci",                  Language.DE to "Abmelden",            Language.FR to "Déconnexion"),

    // Config / Session
    "session.title"         to mapOf(Language.ES to "Sesión de carrera", Language.EN to "Race session",        Language.IT to "Sessione di gara",      Language.DE to "Rennsitzung",         Language.FR to "Session de course"),
    "session.update"        to mapOf(Language.ES to "ACTUALIZAR SESIÓN", Language.EN to "UPDATE SESSION",      Language.IT to "AGGIORNA SESSIONE",     Language.DE to "SITZUNG AKTUALISIEREN", Language.FR to "METTRE À JOUR"),
    "session.saved"         to mapOf(Language.ES to "GUARDADO ✓",        Language.EN to "SAVED ✓",             Language.IT to "SALVATO ✓",             Language.DE to "GESPEICHERT ✓",       Language.FR to "ENREGISTRÉ ✓"),
    "session.sectionRace"   to mapOf(Language.ES to "CARRERA",           Language.EN to "RACE",                Language.IT to "GARA",                  Language.DE to "RENNEN",              Language.FR to "COURSE"),
    "session.sectionPit"    to mapOf(Language.ES to "PIT STOPS",         Language.EN to "PIT STOPS",           Language.IT to "PIT STOP",              Language.DE to "BOXENSTOPPS",         Language.FR to "ARRÊTS AU BOX"),
    "session.sectionStints" to mapOf(Language.ES to "STINTS Y PILOTOS",  Language.EN to "STINTS & DRIVERS",    Language.IT to "STINT E PILOTI",        Language.DE to "STINTS & FAHRER",     Language.FR to "RELAIS ET PILOTES"),
    "session.sectionRain"   to mapOf(Language.ES to "MODO LLUVIA",       Language.EN to "RAIN MODE",           Language.IT to "MODALITÀ PIOGGIA",      Language.DE to "REGENMODUS",          Language.FR to "MODE PLUIE"),
    "session.rainOn"        to mapOf(Language.ES to "Activado",          Language.EN to "On",                  Language.IT to "Attivato",              Language.DE to "Ein",                 Language.FR to "Activé"),
    "session.rainOff"       to mapOf(Language.ES to "Desactivado",       Language.EN to "Off",                 Language.IT to "Disattivato",           Language.DE to "Aus",                 Language.FR to "Désactivé"),
    "session.circuit"       to mapOf(Language.ES to "CIRCUITO",          Language.EN to "CIRCUIT",             Language.IT to "CIRCUITO",              Language.DE to "STRECKE",             Language.FR to "CIRCUIT"),

    // BOX call
    "box.callBox"           to mapOf(Language.ES to "Llamar a BOX",      Language.EN to "Call BOX",            Language.IT to "Chiama BOX",            Language.DE to "BOX rufen",           Language.FR to "Appeler au BOX"),
    "box.sent"              to mapOf(Language.ES to "¡Enviado!",         Language.EN to "Sent!",               Language.IT to "Inviato!",              Language.DE to "Gesendet!",           Language.FR to "Envoyé !"),

    // ── Extended common ──
    "common.next"           to mapOf(Language.ES to "Siguiente",        Language.EN to "Next",          Language.IT to "Avanti",           Language.DE to "Weiter",          Language.FR to "Suivant"),
    "common.back"           to mapOf(Language.ES to "Atras",            Language.EN to "Back",          Language.IT to "Indietro",         Language.DE to "Zurück",          Language.FR to "Retour"),
    "common.info"           to mapOf(Language.ES to "Info",             Language.EN to "Info",          Language.IT to "Info",             Language.DE to "Info",            Language.FR to "Info"),
    "common.saving"         to mapOf(Language.ES to "GUARDANDO...",     Language.EN to "SAVING...",     Language.IT to "SALVATAGGIO...",   Language.DE to "SPEICHERN...",    Language.FR to "ENREGISTREMENT..."),
    "common.searching"      to mapOf(Language.ES to "Buscando dispositivos...", Language.EN to "Searching devices...", Language.IT to "Ricerca dispositivi...", Language.DE to "Geräte suchen...", Language.FR to "Recherche d'appareils..."),

    // Home extras
    "home.brandingTagline"  to mapOf(Language.ES to "ESTRATEGIA DE KARTING EN TIEMPO REAL", Language.EN to "REAL-TIME KARTING STRATEGY", Language.IT to "STRATEGIA KART IN TEMPO REALE", Language.DE to "ECHTZEIT-KART-STRATEGIE", Language.FR to "STRATÉGIE KART EN TEMPS RÉEL"),
    "home.brandingSubtitle" to mapOf(Language.ES to "VISTA PILOTO",     Language.EN to "DRIVER VIEW",   Language.IT to "VISTA PILOTA",     Language.DE to "FAHRERANSICHT",   Language.FR to "VUE PILOTE"),
    "home.activeSession"    to mapOf(Language.ES to "SESIÓN ACTIVA",    Language.EN to "ACTIVE SESSION", Language.IT to "SESSIONE ATTIVA", Language.DE to "AKTIVE SITZUNG",  Language.FR to "SESSION ACTIVE"),
    "home.pillKart"         to mapOf(Language.ES to "KART",             Language.EN to "KART",          Language.IT to "KART",             Language.DE to "KART",            Language.FR to "KART"),
    "home.pillDuration"     to mapOf(Language.ES to "DURACIÓN",         Language.EN to "DURATION",      Language.IT to "DURATA",           Language.DE to "DAUER",           Language.FR to "DURÉE"),
    "home.pillPits"         to mapOf(Language.ES to "PITS",             Language.EN to "PITS",          Language.IT to "PIT",              Language.DE to "BOXEN",           Language.FR to "ARRÊTS"),
    "home.pillCircuit"      to mapOf(Language.ES to "CIRCUITO",         Language.EN to "CIRCUIT",       Language.IT to "CIRCUITO",         Language.DE to "STRECKE",         Language.FR to "CIRCUIT"),
    "home.pillMaxStint"     to mapOf(Language.ES to "MAX STINT",        Language.EN to "MAX STINT",     Language.IT to "MAX STINT",        Language.DE to "MAX STINT",       Language.FR to "MAX RELAIS"),
    "home.noCircuit"        to mapOf(Language.ES to "Sin circuito",     Language.EN to "No circuit",    Language.IT to "Nessun circuito",  Language.DE to "Keine Strecke",   Language.FR to "Aucun circuit"),
    "home.viewPilotSubtitle" to mapOf(Language.ES to "Kart #{kart} · {min} min", Language.EN to "Kart #{kart} · {min} min", Language.IT to "Kart #{kart} · {min} min", Language.DE to "Kart #{kart} · {min} min", Language.FR to "Kart #{kart} · {min} min"),

    // ── Config (hub) ──
    "config.title"          to mapOf(Language.ES to "Configuración",    Language.EN to "Settings",      Language.IT to "Impostazioni",     Language.DE to "Einstellungen",   Language.FR to "Configuration"),
    "config.session"        to mapOf(Language.ES to "Sesión",           Language.EN to "Session",       Language.IT to "Sessione",         Language.DE to "Sitzung",         Language.FR to "Session"),
    "config.sessionSubtitle" to mapOf(Language.ES to "Duración, stints, pits y kart", Language.EN to "Duration, stints, pits and kart", Language.IT to "Durata, stint, pit e kart", Language.DE to "Dauer, Stints, Boxen und Kart", Language.FR to "Durée, relais, arrêts et kart"),
    "config.box"            to mapOf(Language.ES to "Box",              Language.EN to "Box",           Language.IT to "Box",              Language.DE to "Box",             Language.FR to "Box"),
    "config.boxSubtitle"    to mapOf(Language.ES to "Equipos y pilotos", Language.EN to "Teams and drivers", Language.IT to "Squadre e piloti", Language.DE to "Teams und Fahrer", Language.FR to "Équipes et pilotes"),
    "config.presets"        to mapOf(Language.ES to "Plantillas",       Language.EN to "Templates",     Language.IT to "Modelli",          Language.DE to "Vorlagen",        Language.FR to "Plantillas"),
    "config.presetsSubtitle" to mapOf(Language.ES to "Guarda y aplica configuraciones", Language.EN to "Save and apply configs", Language.IT to "Salva e applica configurazioni", Language.DE to "Konfigurationen speichern und anwenden", Language.FR to "Enregistre et applique des configurations"),
    "config.gps"            to mapOf(Language.ES to "GPS / RaceBox",    Language.EN to "GPS / RaceBox", Language.IT to "GPS / RaceBox",    Language.DE to "GPS / RaceBox",   Language.FR to "GPS / RaceBox"),
    "config.gpsSubtitle"    to mapOf(Language.ES to "Linea de meta y telemetria", Language.EN to "Finish line and telemetry", Language.IT to "Linea del traguardo e telemetria", Language.DE to "Ziellinie und Telemetrie", Language.FR to "Ligne d'arrivée et télémétrie"),

    // ── Session extras (number cards) ──
    "session.selectCircuit"     to mapOf(Language.ES to "Seleccionar",  Language.EN to "Select",        Language.IT to "Seleziona",        Language.DE to "Auswählen",       Language.FR to "Sélectionner"),
    "session.kartTitle"         to mapOf(Language.ES to "NUESTRO KART", Language.EN to "OUR KART",      Language.IT to "NOSTRO KART",      Language.DE to "UNSER KART",      Language.FR to "NOTRE KART"),
    "session.kartTooltip"       to mapOf(Language.ES to "Numero del kart de tu equipo", Language.EN to "Your team's kart number", Language.IT to "Numero del kart della squadra", Language.DE to "Kartnummer deines Teams", Language.FR to "Numéro du kart de ton équipe"),
    "session.durationTitle"     to mapOf(Language.ES to "DURACION (MIN)", Language.EN to "DURATION (MIN)", Language.IT to "DURATA (MIN)",  Language.DE to "DAUER (MIN)",     Language.FR to "DURÉE (MIN)"),
    "session.durationTooltip"   to mapOf(Language.ES to "Duracion total de la carrera en minutos", Language.EN to "Total race duration in minutes", Language.IT to "Durata totale della gara in minuti", Language.DE to "Gesamte Renndauer in Minuten", Language.FR to "Durée totale de la course en minutes"),
    "session.minPitsTitle"      to mapOf(Language.ES to "PITS MINIMOS", Language.EN to "MIN PITS",      Language.IT to "PIT MINIMI",       Language.DE to "MIN. BOXENSTOPPS", Language.FR to "ARRÊTS MIN"),
    "session.minPitsTooltip"    to mapOf(Language.ES to "Paradas obligatorias minimas segun reglamento", Language.EN to "Minimum mandatory pit stops per regulation", Language.IT to "Pit stop minimi obbligatori da regolamento", Language.DE to "Mindestpflichtboxenstopps laut Reglement", Language.FR to "Arrêts au stand minimum imposés par le règlement"),
    "session.pitTimeTitle"      to mapOf(Language.ES to "TIEMPO PIT (S)", Language.EN to "PIT TIME (S)", Language.IT to "TEMPO PIT (S)",  Language.DE to "BOXENZEIT (S)",   Language.FR to "TEMPS ARRÊT (S)"),
    "session.pitTimeTooltip"    to mapOf(Language.ES to "Segundos que tardas en hacer una parada en boxes", Language.EN to "Seconds for one pit stop", Language.IT to "Secondi per un pit stop", Language.DE to "Sekunden für einen Boxenstopp", Language.FR to "Secondes pour un arrêt au stand"),
    "session.pitClosedStartTitle" to mapOf(Language.ES to "PIT CERRADO\nINICIO (MIN)", Language.EN to "PIT CLOSED\nSTART (MIN)", Language.IT to "PIT CHIUSO\nINIZIO (MIN)", Language.DE to "BOX ZU\nSTART (MIN)", Language.FR to "ARRÊT FERMÉ\nDÉBUT (MIN)"),
    "session.pitClosedStartTooltip" to mapOf(Language.ES to "Minuto en el que se cierra la ventana de pit", Language.EN to "Minute the pit window closes", Language.IT to "Minuto in cui si chiude la finestra pit", Language.DE to "Minute, ab der das Boxenfenster schließt", Language.FR to "Minute à laquelle la fenêtre d'arrêt ferme"),
    "session.pitClosedEndTitle" to mapOf(Language.ES to "PIT CERRADO\nFINAL (MIN)", Language.EN to "PIT CLOSED\nEND (MIN)", Language.IT to "PIT CHIUSO\nFINE (MIN)", Language.DE to "BOX ZU\nENDE (MIN)", Language.FR to "ARRÊT FERMÉ\nFIN (MIN)"),
    "session.pitClosedEndTooltip" to mapOf(Language.ES to "Minuto en el que se reabre la ventana de pit", Language.EN to "Minute the pit window reopens", Language.IT to "Minuto in cui si riapre la finestra pit", Language.DE to "Minute, ab der das Boxenfenster wieder öffnet", Language.FR to "Minute à laquelle la fenêtre d'arrêt rouvre"),
    "session.minStintTitle"     to mapOf(Language.ES to "STINT MIN (MIN)", Language.EN to "MIN STINT (MIN)", Language.IT to "STINT MIN (MIN)", Language.DE to "MIN. STINT (MIN)", Language.FR to "RELAIS MIN (MIN)"),
    "session.minStintTooltip"   to mapOf(Language.ES to "Tiempo mínimo que un piloto debe estar en pista", Language.EN to "Minimum time a driver must be on track", Language.IT to "Tempo minimo che un pilota deve stare in pista", Language.DE to "Mindestzeit eines Fahrers auf der Strecke", Language.FR to "Temps minimum qu'un pilote doit passer en piste"),
    "session.maxStintTitle"     to mapOf(Language.ES to "STINT MAX (MIN)", Language.EN to "MAX STINT (MIN)", Language.IT to "STINT MAX (MIN)", Language.DE to "MAX. STINT (MIN)", Language.FR to "RELAIS MAX (MIN)"),
    "session.maxStintTooltip"   to mapOf(Language.ES to "Tiempo máximo que un piloto puede estar en pista", Language.EN to "Maximum time a driver can be on track", Language.IT to "Tempo massimo che un pilota può stare in pista", Language.DE to "Höchstzeit eines Fahrers auf der Strecke", Language.FR to "Temps maximum qu'un pilote peut passer en piste"),
    "session.minDriverTimeTitle" to mapOf(Language.ES to "TIEMPO MIN\nPILOTO (MIN)", Language.EN to "MIN DRIVER\nTIME (MIN)", Language.IT to "TEMPO MIN\nPILOTA (MIN)", Language.DE to "MIN. FAHRER-\nZEIT (MIN)", Language.FR to "TEMPS MIN\nPILOTE (MIN)"),
    "session.minDriverTimeTooltip" to mapOf(Language.ES to "Tiempo mínimo total que cada piloto debe conducir", Language.EN to "Minimum total drive time per driver", Language.IT to "Tempo totale minimo che ogni pilota deve guidare", Language.DE to "Mindestgesamtfahrzeit pro Fahrer", Language.FR to "Temps de conduite total minimum par pilote"),
    "session.teamDriversTitle"  to mapOf(Language.ES to "PILOTOS\nDEL EQUIPO", Language.EN to "TEAM\nDRIVERS", Language.IT to "PILOTI\nSQUADRA", Language.DE to "TEAM-\nFAHRER", Language.FR to "PILOTES\nDE L'ÉQUIPE"),
    "session.teamDriversTooltip" to mapOf(Language.ES to "Número de pilotos del equipo. 0 = automático según Apex.", Language.EN to "Number of drivers on the team. 0 = auto from Apex.", Language.IT to "Numero di piloti della squadra. 0 = automatico via Apex.", Language.DE to "Anzahl Teamfahrer. 0 = automatisch über Apex.", Language.FR to "Nombre de pilotes de l'équipe. 0 = auto via Apex."),
    "session.rainHint"          to mapOf(Language.ES to "Desactiva el filtro de outliers en las medias para que la lluvia no falsee el ritmo.", Language.EN to "Disables outlier filtering in averages so rain doesn't skew pace.", Language.IT to "Disattiva il filtro degli outlier nelle medie affinché la pioggia non alteri il ritmo.", Language.DE to "Deaktiviert die Ausreißerfilterung in Durchschnitten, damit Regen das Tempo nicht verfälscht.", Language.FR to "Désactive le filtre d'outliers dans les moyennes pour que la pluie ne fausse pas le rythme."),
    "session.updateSession"     to mapOf(Language.ES to "ACTUALIZAR SESION", Language.EN to "UPDATE SESSION", Language.IT to "AGGIORNA SESSIONE", Language.DE to "SITZUNG AKTUALISIEREN", Language.FR to "METTRE À JOUR LA SESSION"),

    // ── Box (Teams & drivers) ──
    "box.title"             to mapOf(Language.ES to "Configuración Box", Language.EN to "Box Settings", Language.IT to "Impostazioni Box", Language.DE to "Box-Einstellungen", Language.FR to "Paramètres Box"),
    "box.autoLoadTitle"     to mapOf(Language.ES to "Auto-cargar al iniciar", Language.EN to "Auto-load on start", Language.IT to "Auto-caricamento all'avvio", Language.DE to "Beim Start automatisch laden", Language.FR to "Charger auto au démarrage"),
    "box.autoLoadSubtitle"  to mapOf(Language.ES to "Refresca equipos desde Live Timing al arrancar la carrera.", Language.EN to "Refreshes teams from Live Timing when the race starts.", Language.IT to "Aggiorna le squadre da Live Timing all'inizio della gara.", Language.DE to "Aktualisiert Teams aus Live Timing beim Rennstart.", Language.FR to "Actualise les équipes depuis Live Timing au départ de la course."),
    "box.liveTiming"        to mapOf(Language.ES to "Live Timing",      Language.EN to "Live Timing",   Language.IT to "Live Timing",      Language.DE to "Live Timing",     Language.FR to "Live Timing"),
    "box.team"              to mapOf(Language.ES to "Equipo",           Language.EN to "Team",          Language.IT to "Squadra",          Language.DE to "Team",            Language.FR to "Équipe"),
    "box.teamsHeader"       to mapOf(Language.ES to "EQUIPOS ({count})", Language.EN to "TEAMS ({count})", Language.IT to "SQUADRE ({count})", Language.DE to "TEAMS ({count})", Language.FR to "ÉQUIPES ({count})"),
    "box.empty"             to mapOf(Language.ES to "No hay equipos. Cargalos desde Live Timing o anadilos manualmente.", Language.EN to "No teams. Load from Live Timing or add them manually.", Language.IT to "Nessuna squadra. Caricale da Live Timing o aggiungile manualmente.", Language.DE to "Keine Teams. Aus Live Timing laden oder manuell hinzufügen.", Language.FR to "Aucune équipe. Charge-les depuis Live Timing ou ajoute-les à la main."),
    "box.saveChanges"       to mapOf(Language.ES to "GUARDAR CAMBIOS",  Language.EN to "SAVE CHANGES",  Language.IT to "SALVA MODIFICHE",  Language.DE to "ÄNDERUNGEN SPEICHERN", Language.FR to "ENREGISTRER"),
    "box.addTeamTitle"      to mapOf(Language.ES to "Anadir equipo",    Language.EN to "Add team",      Language.IT to "Aggiungi squadra", Language.DE to "Team hinzufügen",  Language.FR to "Ajouter une équipe"),
    "box.addTeamPrompt"     to mapOf(Language.ES to "Nombre y número de kart del nuevo equipo.", Language.EN to "Name and kart number for the new team.", Language.IT to "Nome e numero kart della nuova squadra.", Language.DE to "Name und Kartnummer des neuen Teams.", Language.FR to "Nom et numéro de kart de la nouvelle équipe."),
    "box.fieldName"         to mapOf(Language.ES to "Nombre",           Language.EN to "Name",          Language.IT to "Nome",             Language.DE to "Name",            Language.FR to "Nom"),
    "box.fieldKart"         to mapOf(Language.ES to "Kart",             Language.EN to "Kart",          Language.IT to "Kart",             Language.DE to "Kart",            Language.FR to "Kart"),
    "box.addConfirm"        to mapOf(Language.ES to "Anadir",           Language.EN to "Add",           Language.IT to "Aggiungi",         Language.DE to "Hinzufügen",      Language.FR to "Ajouter"),
    "box.reorderDescription" to mapOf(Language.ES to "Reordenar",       Language.EN to "Reorder",       Language.IT to "Riordina",         Language.DE to "Neu ordnen",      Language.FR to "Réordonner"),
    "box.driverPlaceholder" to mapOf(Language.ES to "Nombre",           Language.EN to "Name",          Language.IT to "Nome",             Language.DE to "Name",            Language.FR to "Nom"),
    "box.driverNoName"      to mapOf(Language.ES to "Sin nombre",       Language.EN to "No name",       Language.IT to "Senza nome",       Language.DE to "Ohne Namen",      Language.FR to "Sans nom"),
    "box.pilotCount"        to mapOf(Language.ES to "{count} piloto",   Language.EN to "{count} driver", Language.IT to "{count} pilota",  Language.DE to "{count} Fahrer",  Language.FR to "{count} pilote"),
    "box.pilotCountPlural"  to mapOf(Language.ES to "{count} pilotos",  Language.EN to "{count} drivers", Language.IT to "{count} piloti", Language.DE to "{count} Fahrer",  Language.FR to "{count} pilotes"),
    "box.addPilot"          to mapOf(Language.ES to "Piloto",           Language.EN to "Driver",        Language.IT to "Pilota",           Language.DE to "Fahrer",          Language.FR to "Pilote"),

    // ── GPS / RaceBox ──
    "gps.title"             to mapOf(Language.ES to "GPS / RaceBox",    Language.EN to "GPS / RaceBox", Language.IT to "GPS / RaceBox",    Language.DE to "GPS / RaceBox",   Language.FR to "GPS / RaceBox"),
    "gps.source"            to mapOf(Language.ES to "Fuente GPS",       Language.EN to "GPS Source",    Language.IT to "Sorgente GPS",     Language.DE to "GPS-Quelle",      Language.FR to "Source GPS"),
    "gps.raceboxBle"        to mapOf(Language.ES to "RaceBox BLE",      Language.EN to "RaceBox BLE",   Language.IT to "RaceBox BLE",      Language.DE to "RaceBox BLE",     Language.FR to "RaceBox BLE"),
    "gps.raceboxName"       to mapOf(Language.ES to "RaceBox",          Language.EN to "RaceBox",       Language.IT to "RaceBox",          Language.DE to "RaceBox",         Language.FR to "RaceBox"),
    "gps.disconnect"        to mapOf(Language.ES to "Desconectar",      Language.EN to "Disconnect",    Language.IT to "Disconnetti",      Language.DE to "Trennen",         Language.FR to "Déconnecter"),
    "gps.noDevices"         to mapOf(Language.ES to "No se encontraron dispositivos", Language.EN to "No devices found", Language.IT to "Nessun dispositivo trovato", Language.DE to "Keine Geräte gefunden", Language.FR to "Aucun appareil trouvé"),
    "gps.noDevicesHint"     to mapOf(Language.ES to "Asegurate de que tu RaceBox esta encendido y cerca", Language.EN to "Make sure your RaceBox is on and nearby", Language.IT to "Assicurati che il tuo RaceBox sia acceso e vicino", Language.DE to "Stelle sicher, dass dein RaceBox eingeschaltet und in der Nähe ist", Language.FR to "Assure-toi que ton RaceBox est allumé et proche"),
    "gps.searchDevices"     to mapOf(Language.ES to "Buscar dispositivos", Language.EN to "Search devices", Language.IT to "Cerca dispositivi", Language.DE to "Geräte suchen",   Language.FR to "Chercher des appareils"),
    "gps.displaySection"    to mapOf(Language.ES to "Pantalla",         Language.EN to "Display",       Language.IT to "Schermo",          Language.DE to "Anzeige",         Language.FR to "Écran"),
    "gps.deltaFrequency"    to mapOf(Language.ES to "Frecuencia delta", Language.EN to "Delta frequency", Language.IT to "Frequenza delta", Language.DE to "Delta-Frequenz",  Language.FR to "Fréquence delta"),
    "gps.deltaHint"         to mapOf(Language.ES to "Cuantas veces por segundo se actualiza el delta en pantalla. Mas Hz = mas reactivo, pero el ultimo decimal puede bailar mas. 2 Hz es el equilibrio recomendado.", Language.EN to "How many times per second the delta updates on screen. More Hz = more reactive but the last decimal jitters more. 2 Hz is the recommended balance.", Language.IT to "Quante volte al secondo si aggiorna il delta sullo schermo. Più Hz = più reattivo ma l'ultimo decimale balla di più. 2 Hz è l'equilibrio consigliato.", Language.DE to "Wie oft pro Sekunde der Delta-Wert aktualisiert wird. Mehr Hz = reaktiver, aber die letzte Stelle flackert mehr. 2 Hz ist die empfohlene Balance.", Language.FR to "Combien de fois par seconde le delta se met à jour. Plus de Hz = plus réactif, mais la dernière décimale bouge plus. 2 Hz est l'équilibre recommandé."),
    "gps.status"            to mapOf(Language.ES to "Estado",           Language.EN to "Status",        Language.IT to "Stato",            Language.DE to "Status",          Language.FR to "État"),
    "gps.connected"         to mapOf(Language.ES to "Conectado",        Language.EN to "Connected",     Language.IT to "Connesso",         Language.DE to "Verbunden",       Language.FR to "Connecté"),
    "gps.signal"            to mapOf(Language.ES to "Senal",            Language.EN to "Signal",        Language.IT to "Segnale",          Language.DE to "Signal",          Language.FR to "Signal"),
    "gps.satellites"        to mapOf(Language.ES to "Satelites",        Language.EN to "Satellites",    Language.IT to "Satelliti",        Language.DE to "Satelliten",      Language.FR to "Satellites"),
    "gps.frequency"         to mapOf(Language.ES to "Frecuencia",       Language.EN to "Frequency",     Language.IT to "Frequenza",        Language.DE to "Frequenz",        Language.FR to "Fréquence"),
    "gps.battery"           to mapOf(Language.ES to "Bateria RaceBox",  Language.EN to "RaceBox Battery", Language.IT to "Batteria RaceBox", Language.DE to "RaceBox-Akku",  Language.FR to "Batterie RaceBox"),
    "gps.imuTitle"          to mapOf(Language.ES to "Calibracion IMU",  Language.EN to "IMU Calibration", Language.IT to "Calibrazione IMU", Language.DE to "IMU-Kalibrierung", Language.FR to "Calibration IMU"),
    "gps.phase"             to mapOf(Language.ES to "Fase",             Language.EN to "Phase",         Language.IT to "Fase",             Language.DE to "Phase",           Language.FR to "Phase"),
    "gps.phaseIdle"         to mapOf(Language.ES to "Sin calibrar",     Language.EN to "Not calibrated", Language.IT to "Non calibrato",   Language.DE to "Nicht kalibriert", Language.FR to "Non calibré"),
    "gps.phaseSampling"     to mapOf(Language.ES to "Capturando gravedad...", Language.EN to "Capturing gravity...", Language.IT to "Acquisizione gravità...", Language.DE to "Schwerkraft erfassen...", Language.FR to "Capture de la gravité..."),
    "gps.phaseReady"        to mapOf(Language.ES to "Gravedad OK — alineando", Language.EN to "Gravity OK — aligning", Language.IT to "Gravità OK — allineamento", Language.DE to "Schwerkraft OK — Ausrichtung", Language.FR to "Gravité OK — alignement"),
    "gps.phaseAligned"      to mapOf(Language.ES to "Calibrado",        Language.EN to "Calibrated",    Language.IT to "Calibrato",        Language.DE to "Kalibriert",      Language.FR to "Calibré"),
    "gps.samples"           to mapOf(Language.ES to "Muestras: {pct}%", Language.EN to "Samples: {pct}%", Language.IT to "Campioni: {pct}%", Language.DE to "Proben: {pct}%",  Language.FR to "Échantillons : {pct} %"),
    "gps.driveHint"         to mapOf(Language.ES to "Conduce a mas de 15 km/h para alinear los ejes del dispositivo", Language.EN to "Drive over 15 km/h to align the device axes", Language.IT to "Guida sopra i 15 km/h per allineare gli assi del dispositivo", Language.DE to "Über 15 km/h fahren, um die Geräteachsen auszurichten", Language.FR to "Roule au-dessus de 15 km/h pour aligner les axes de l'appareil"),
    "gps.calibrationComplete" to mapOf(Language.ES to "Calibracion completa", Language.EN to "Calibration complete", Language.IT to "Calibrazione completata", Language.DE to "Kalibrierung abgeschlossen", Language.FR to "Calibration terminée"),
    "gps.startCalibration"  to mapOf(Language.ES to "Iniciar calibracion", Language.EN to "Start calibration", Language.IT to "Avvia calibrazione", Language.DE to "Kalibrierung starten", Language.FR to "Démarrer la calibration"),
    "gps.connectFirst"      to mapOf(Language.ES to "Conecta un RaceBox para calibrar", Language.EN to "Connect a RaceBox to calibrate", Language.IT to "Connetti un RaceBox per calibrare", Language.DE to "Schließe einen RaceBox an, um zu kalibrieren", Language.FR to "Connecte un RaceBox pour calibrer"),
    "gps.holdStill"         to mapOf(Language.ES to "Manten el kart quieto...", Language.EN to "Hold the kart still...", Language.IT to "Tieni il kart fermo...", Language.DE to "Halte den Kart still...", Language.FR to "Garde le kart immobile..."),
    "gps.skipAlign"         to mapOf(Language.ES to "Omitir alineacion", Language.EN to "Skip alignment", Language.IT to "Salta allineamento", Language.DE to "Ausrichtung überspringen", Language.FR to "Sauter l'alignement"),
    "gps.recalibrate"       to mapOf(Language.ES to "Recalibrar",       Language.EN to "Recalibrate",   Language.IT to "Ricalibra",        Language.DE to "Neu kalibrieren", Language.FR to "Recalibrer"),
    "gps.resetCalibration"  to mapOf(Language.ES to "Resetear calibracion", Language.EN to "Reset calibration", Language.IT to "Reimposta calibrazione", Language.DE to "Kalibrierung zurücksetzen", Language.FR to "Réinitialiser la calibration"),

    // ── Presets ──
    "preset.title"          to mapOf(Language.ES to "Plantillas",       Language.EN to "Templates",     Language.IT to "Modelli",          Language.DE to "Vorlagen",        Language.FR to "Plantillas"),
    "preset.header"         to mapOf(Language.ES to "PLANTILLAS ({count}/{max})", Language.EN to "TEMPLATES ({count}/{max})", Language.IT to "MODELLI ({count}/{max})", Language.DE to "VORLAGEN ({count}/{max})", Language.FR to "PLANTILLAS ({count}/{max})"),
    "preset.empty"          to mapOf(Language.ES to "No tienes plantillas guardadas. Usa el botón de abajo para guardar la configuración actual.", Language.EN to "You have no saved templates. Use the button below to save the current setup.", Language.IT to "Nessun modello salvato. Usa il pulsante in basso per salvare la configurazione attuale.", Language.DE to "Du hast keine gespeicherten Vorlagen. Verwende die Schaltfläche unten, um die aktuelle Konfiguration zu speichern.", Language.FR to "Aucun modèle enregistré. Utilise le bouton ci-dessous pour enregistrer la configuration actuelle."),
    "preset.createNew"      to mapOf(Language.ES to "Crear nueva plantilla", Language.EN to "Create new template", Language.IT to "Crea nuovo modello", Language.DE to "Neue Vorlage erstellen", Language.FR to "Créer un nouveau modèle"),
    "preset.deleteTitle"    to mapOf(Language.ES to "Eliminar plantilla", Language.EN to "Delete template", Language.IT to "Elimina modello", Language.DE to "Vorlage löschen", Language.FR to "Supprimer le modèle"),
    "preset.deleteConfirm"  to mapOf(Language.ES to "¿Quitar '{name}'? Esta acción no se puede deshacer.", Language.EN to "Remove '{name}'? This cannot be undone.", Language.IT to "Rimuovere '{name}'? Questa azione non può essere annullata.", Language.DE to "'{name}' entfernen? Diese Aktion kann nicht rückgängig gemacht werden.", Language.FR to "Supprimer « {name} » ? Cette action est irréversible."),
    "preset.cards"          to mapOf(Language.ES to "{count} tarjetas", Language.EN to "{count} cards",  Language.IT to "{count} schede",  Language.DE to "{count} Karten",  Language.FR to "{count} cartes"),
    "preset.starOn"         to mapOf(Language.ES to "Quitar predefinida", Language.EN to "Unstar default", Language.IT to "Rimuovi predefinito", Language.DE to "Standard entfernen", Language.FR to "Retirer comme défaut"),
    "preset.starOff"        to mapOf(Language.ES to "Marcar predefinida", Language.EN to "Set as default", Language.IT to "Imposta come predefinito", Language.DE to "Als Standard markieren", Language.FR to "Définir par défaut"),

    // ── Template wizard ──
    "wizard.titleNew"       to mapOf(Language.ES to "Nueva plantilla",  Language.EN to "New template",  Language.IT to "Nuovo modello",    Language.DE to "Neue Vorlage",    Language.FR to "Nouveau modèle"),
    "wizard.titleEdit"      to mapOf(Language.ES to "Editar plantilla", Language.EN to "Edit template", Language.IT to "Modifica modello", Language.DE to "Vorlage bearbeiten", Language.FR to "Modifier le modèle"),
    "wizard.stepName"       to mapOf(Language.ES to "Nombre",           Language.EN to "Name",          Language.IT to "Nome",             Language.DE to "Name",            Language.FR to "Nom"),
    "wizard.stepVisibility" to mapOf(Language.ES to "Tarjetas visibles", Language.EN to "Visible cards", Language.IT to "Schede visibili", Language.DE to "Sichtbare Karten", Language.FR to "Cartes visibles"),
    "wizard.stepOrder"      to mapOf(Language.ES to "Orden de tarjetas", Language.EN to "Card order",  Language.IT to "Ordine schede",    Language.DE to "Kartenreihenfolge", Language.FR to "Ordre des cartes"),
    "wizard.stepOptions"    to mapOf(Language.ES to "Opciones de pantalla", Language.EN to "Display options", Language.IT to "Opzioni schermo", Language.DE to "Anzeigeoptionen", Language.FR to "Options d'affichage"),
    "wizard.progress"       to mapOf(Language.ES to "Paso {current} de {total} — {label}", Language.EN to "Step {current} of {total} — {label}", Language.IT to "Passo {current} di {total} — {label}", Language.DE to "Schritt {current} von {total} — {label}", Language.FR to "Étape {current} sur {total} — {label}"),
    "wizard.namePrompt"     to mapOf(Language.ES to "Elige un nombre para tu plantilla", Language.EN to "Choose a name for your template", Language.IT to "Scegli un nome per il tuo modello", Language.DE to "Wähle einen Namen für deine Vorlage", Language.FR to "Choisis un nom pour ton modèle"),
    "wizard.nameLabel"      to mapOf(Language.ES to "Nombre de la plantilla", Language.EN to "Template name", Language.IT to "Nome del modello", Language.DE to "Vorlagenname", Language.FR to "Nom du modèle"),
    "wizard.requiresGps"    to mapOf(Language.ES to "Requiere GPS / RaceBox", Language.EN to "Requires GPS / RaceBox", Language.IT to "Richiede GPS / RaceBox", Language.DE to "Erfordert GPS / RaceBox", Language.FR to "Nécessite GPS / RaceBox"),
    "wizard.emptyVisible"   to mapOf(Language.ES to "No hay tarjetas visibles. Vuelve al paso anterior para activar alguna.", Language.EN to "No visible cards. Go back to enable some.", Language.IT to "Nessuna scheda visibile. Torna indietro per attivarne alcune.", Language.DE to "Keine sichtbaren Karten. Gehe zurück, um welche zu aktivieren.", Language.FR to "Aucune carte visible. Reviens en arrière pour en activer."),
    "wizard.swapHint"       to mapOf(Language.ES to "Toca otra tarjeta para intercambiar", Language.EN to "Tap another card to swap", Language.IT to "Tocca un'altra scheda per scambiare", Language.DE to "Tippe auf eine andere Karte, um zu tauschen", Language.FR to "Touche une autre carte pour échanger"),
    "wizard.dragHint"       to mapOf(Language.ES to "Mantén pulsada una tarjeta y arrástrala para reordenar", Language.EN to "Long-press a card and drag to reorder", Language.IT to "Tieni premuta una scheda e trascina per riordinare", Language.DE to "Karte lange drücken und ziehen, um neu zu ordnen", Language.FR to "Maintiens une carte et fais-la glisser pour réordonner"),
    "wizard.contrast"       to mapOf(Language.ES to "CONTRASTE",        Language.EN to "CONTRAST",      Language.IT to "CONTRASTO",        Language.DE to "KONTRAST",        Language.FR to "CONTRASTE"),
    "wizard.orientation"    to mapOf(Language.ES to "ORIENTACION",      Language.EN to "ORIENTATION",   Language.IT to "ORIENTAMENTO",     Language.DE to "AUSRICHTUNG",     Language.FR to "ORIENTATION"),
    "wizard.audio"          to mapOf(Language.ES to "AUDIO",            Language.EN to "AUDIO",         Language.IT to "AUDIO",            Language.DE to "AUDIO",           Language.FR to "AUDIO"),
    "wizard.audioOn"        to mapOf(Language.ES to "Audio activado",   Language.EN to "Audio on",      Language.IT to "Audio attivato",   Language.DE to "Audio ein",       Language.FR to "Audio activé"),
    "wizard.audioOff"       to mapOf(Language.ES to "Audio desactivado", Language.EN to "Audio off",    Language.IT to "Audio disattivato", Language.DE to "Audio aus",      Language.FR to "Audio désactivé"),
    "wizard.saveTemplate"   to mapOf(Language.ES to "GUARDAR PLANTILLA", Language.EN to "SAVE TEMPLATE", Language.IT to "SALVA MODELLO",  Language.DE to "VORLAGE SPEICHERN", Language.FR to "ENREGISTRER LE MODÈLE"),
    "wizard.updateTemplate" to mapOf(Language.ES to "ACTUALIZAR PLANTILLA", Language.EN to "UPDATE TEMPLATE", Language.IT to "AGGIORNA MODELLO", Language.DE to "VORLAGE AKTUALISIEREN", Language.FR to "METTRE À JOUR LE MODÈLE"),

    // ── Card order preview screen ──
    "cardOrder.title"       to mapOf(Language.ES to "Orden y vista previa", Language.EN to "Order & preview", Language.IT to "Ordine e anteprima", Language.DE to "Reihenfolge & Vorschau", Language.FR to "Ordre et aperçu"),
    "cardOrder.empty"       to mapOf(Language.ES to "No hay tarjetas visibles. Activa alguna en 'Tarjetas visibles'.", Language.EN to "No visible cards. Enable some in 'Visible cards'.", Language.IT to "Nessuna scheda visibile. Attivane alcune in 'Schede visibili'.", Language.DE to "Keine sichtbaren Karten. Aktiviere welche in 'Sichtbare Karten'.", Language.FR to "Aucune carte visible. Active-en dans « Cartes visibles »."),
    "cardOrder.preview"     to mapOf(Language.ES to "VISTA PREVIA",     Language.EN to "PREVIEW",       Language.IT to "ANTEPRIMA",        Language.DE to "VORSCHAU",        Language.FR to "APERÇU"),
    "cardOrder.moveUp"      to mapOf(Language.ES to "Subir",            Language.EN to "Move up",       Language.IT to "Su",               Language.DE to "Nach oben",       Language.FR to "Monter"),
    "cardOrder.moveDown"    to mapOf(Language.ES to "Bajar",            Language.EN to "Move down",     Language.IT to "Giù",              Language.DE to "Nach unten",      Language.FR to "Descendre"),

    // ── Driver screen / overlays ──
    "driver.noPresetTitle"  to mapOf(Language.ES to "Necesitas una plantilla", Language.EN to "You need a template", Language.IT to "Ti serve un modello", Language.DE to "Du benötigst eine Vorlage", Language.FR to "Il te faut un modèle"),
    "driver.noPresetBody"   to mapOf(Language.ES to "Crea al menos una plantilla en Configuración → Plantillas para usar la vista del piloto.", Language.EN to "Create at least one template in Settings → Templates to use the driver view.", Language.IT to "Crea almeno un modello in Impostazioni → Modelli per usare la vista pilota.", Language.DE to "Erstelle mindestens eine Vorlage in Einstellungen → Vorlagen, um die Fahreransicht zu nutzen.", Language.FR to "Crée au moins un modèle dans Configuration → Plantillas pour utiliser la vue pilote."),
    "driver.back"           to mapOf(Language.ES to "Volver",           Language.EN to "Back",          Language.IT to "Indietro",         Language.DE to "Zurück",          Language.FR to "Retour"),
    "driver.reconnecting"   to mapOf(Language.ES to "Reconectando...",  Language.EN to "Reconnecting...", Language.IT to "Riconnessione...", Language.DE to "Verbinden...",   Language.FR to "Reconnexion..."),
    "driver.pitInProgress"  to mapOf(Language.ES to "PIT EN CURSO",     Language.EN to "PIT IN PROGRESS", Language.IT to "PIT IN CORSO",   Language.DE to "BOXENSTOPP LÄUFT", Language.FR to "ARRÊT EN COURS"),
    "driver.audioOn"        to mapOf(Language.ES to "Audio activado",   Language.EN to "Audio on",      Language.IT to "Audio attivato",   Language.DE to "Audio ein",       Language.FR to "Audio activé"),
    "driver.cardFaltan"     to mapOf(Language.ES to "Faltan {count}",   Language.EN to "Missing {count}", Language.IT to "Mancano {count}", Language.DE to "Fehlen {count}",  Language.FR to "Reste {count}"),
    "driver.cardInactive"   to mapOf(Language.ES to "inactivo",         Language.EN to "inactive",      Language.IT to "inattivo",         Language.DE to "inaktiv",         Language.FR to "inactif"),
    "driver.cardLast"       to mapOf(Language.ES to "Ultimo",           Language.EN to "Last",          Language.IT to "Ultimo",           Language.DE to "Letzter",         Language.FR to "Dernier"),
    "driver.cardLeader"     to mapOf(Language.ES to "LIDER",            Language.EN to "LEADER",        Language.IT to "LEADER",           Language.DE to "FÜHREND",         Language.FR to "EN TÊTE"),
    "driver.cardReal"       to mapOf(Language.ES to "Real: {time}",     Language.EN to "Real: {time}",  Language.IT to "Reale: {time}",    Language.DE to "Real: {time}",    Language.FR to "Réel : {time}"),
    "driver.cardLat"        to mapOf(Language.ES to "Lat: {value}",     Language.EN to "Lat: {value}",  Language.IT to "Lat: {value}",     Language.DE to "Lat: {value}",    Language.FR to "Lat : {value}"),
    "driver.cardBrake"      to mapOf(Language.ES to "Fren: {value}",    Language.EN to "Brake: {value}", Language.IT to "Frenata: {value}", Language.DE to "Brems: {value}", Language.FR to "Frein : {value}"),

    // ── Driver menu overlay ──
    "driver.menuTitle"      to mapOf(Language.ES to "Menu",             Language.EN to "Menu",          Language.IT to "Menu",             Language.DE to "Menü",            Language.FR to "Menu"),
    "driver.menuTemplate"   to mapOf(Language.ES to "PLANTILLA",        Language.EN to "TEMPLATE",      Language.IT to "MODELLO",          Language.DE to "VORLAGE",         Language.FR to "MODÈLE"),
    "driver.menuNone"       to mapOf(Language.ES to "Ninguna",          Language.EN to "None",          Language.IT to "Nessuno",          Language.DE to "Keine",           Language.FR to "Aucun"),
    "driver.menuTemplateActive" to mapOf(Language.ES to "Plantilla activa", Language.EN to "Active template", Language.IT to "Modello attivo", Language.DE to "Aktive Vorlage", Language.FR to "Modèle actif"),
    "driver.menuContrast"   to mapOf(Language.ES to "CONTRASTE",        Language.EN to "CONTRAST",      Language.IT to "CONTRASTO",        Language.DE to "KONTRAST",        Language.FR to "CONTRASTE"),
    "driver.menuNormal"     to mapOf(Language.ES to "Normal",           Language.EN to "Normal",        Language.IT to "Normale",          Language.DE to "Normal",          Language.FR to "Normal"),
    "driver.menuOrientation" to mapOf(Language.ES to "ORIENTACION",     Language.EN to "ORIENTATION",   Language.IT to "ORIENTAMENTO",     Language.DE to "AUSRICHTUNG",     Language.FR to "ORIENTATION"),
    "driver.menuAudio"      to mapOf(Language.ES to "AUDIO",            Language.EN to "AUDIO",         Language.IT to "AUDIO",            Language.DE to "AUDIO",           Language.FR to "AUDIO"),
    "driver.narrationOn"    to mapOf(Language.ES to "Narración activada", Language.EN to "Narration on", Language.IT to "Narrazione attivata", Language.DE to "Narration ein", Language.FR to "Narration activée"),
    "driver.narrationOff"   to mapOf(Language.ES to "Narración desactivada", Language.EN to "Narration off", Language.IT to "Narrazione disattivata", Language.DE to "Narration aus", Language.FR to "Narration désactivée"),
    "driver.menuExit"       to mapOf(Language.ES to "Salir",            Language.EN to "Exit",          Language.IT to "Esci",             Language.DE to "Beenden",         Language.FR to "Quitter"),

    // ── Box call overlay ──
    "boxCall.tapToClose"    to mapOf(Language.ES to "Toca para cerrar", Language.EN to "Tap to close",  Language.IT to "Tocca per chiudere", Language.DE to "Tippen zum Schließen", Language.FR to "Touche pour fermer"),
    "boxCall.autoClose"     to mapOf(Language.ES to "Se cierra automáticamente", Language.EN to "Closes automatically", Language.IT to "Si chiude automaticamente", Language.DE to "Schließt automatisch", Language.FR to "Se ferme automatiquement"),

    // ── Login extras ──
    "login.openingGoogle"   to mapOf(Language.ES to "Abriendo Google...", Language.EN to "Opening Google...", Language.IT to "Apertura Google...", Language.DE to "Google öffnen...", Language.FR to "Ouverture de Google..."),
    "login.continueGoogle"  to mapOf(Language.ES to "Continuar con Google", Language.EN to "Continue with Google", Language.IT to "Continua con Google", Language.DE to "Mit Google fortfahren", Language.FR to "Continuer avec Google"),
    "login.or"              to mapOf(Language.ES to "o",                Language.EN to "or",            Language.IT to "o",                Language.DE to "oder",            Language.FR to "ou"),

    // ── Update prompt ──
    "update.title"          to mapOf(Language.ES to "Actualización requerida", Language.EN to "Update required", Language.IT to "Aggiornamento richiesto", Language.DE to "Aktualisierung erforderlich", Language.FR to "Mise à jour requise"),
    "update.body"           to mapOf(Language.ES to "Actualiza la app para continuar.", Language.EN to "Update the app to continue.", Language.IT to "Aggiorna l'app per continuare.", Language.DE to "Aktualisiere die App, um fortzufahren.", Language.FR to "Mets à jour l'app pour continuer."),
    "update.installed"      to mapOf(Language.ES to "Versión instalada", Language.EN to "Installed version", Language.IT to "Versione installata", Language.DE to "Installierte Version", Language.FR to "Version installée"),
    "update.minRequired"    to mapOf(Language.ES to "Versión mínima requerida", Language.EN to "Minimum required version", Language.IT to "Versione minima richiesta", Language.DE to "Mindestversion", Language.FR to "Version minimale requise"),
    "update.latest"         to mapOf(Language.ES to "Última versión disponible", Language.EN to "Latest available version", Language.IT to "Ultima versione disponibile", Language.DE to "Neueste verfügbare Version", Language.FR to "Dernière version disponible"),
    "update.openStore"      to mapOf(Language.ES to "Abrir Play Store", Language.EN to "Open Play Store", Language.IT to "Apri Play Store", Language.DE to "Play Store öffnen", Language.FR to "Ouvrir le Play Store"),

    // Driver-card labels — shared key set with web (lib/i18n.ts) and iOS
    // (I18n.swift) so the pilot view translates fully. Rendered via
    // t(card.labelKey); DriverCard.display stays as the ES fallback.
    "card.raceTimer"        to mapOf(Language.ES to "Tiempo de carrera", Language.EN to "Race time", Language.IT to "Tempo di gara", Language.DE to "Rennzeit", Language.FR to "Temps de course"),
    "card.lastLap"          to mapOf(Language.ES to "Última vuelta", Language.EN to "Last lap", Language.IT to "Ultimo giro", Language.DE to "Letzte Runde", Language.FR to "Dernier tour"),
    "card.bestStintLap"     to mapOf(Language.ES to "Mejor vuelta stint", Language.EN to "Best stint lap", Language.IT to "Miglior giro stint", Language.DE to "Beste Stint-Runde", Language.FR to "Meilleur tour relais"),
    "card.apexPosition"     to mapOf(Language.ES to "Posición Apex", Language.EN to "Apex position", Language.IT to "Posizione Apex", Language.DE to "Apex-Position", Language.FR to "Position Apex"),
    "card.intervalAhead"    to mapOf(Language.ES to "Intervalo kart delante", Language.EN to "Gap to kart ahead", Language.IT to "Distacco kart davanti", Language.DE to "Abstand Kart vorne", Language.FR to "Écart kart devant"),
    "card.intervalBehind"   to mapOf(Language.ES to "Intervalo kart detrás", Language.EN to "Gap to kart behind", Language.IT to "Distacco kart dietro", Language.DE to "Abstand Kart hinten", Language.FR to "Écart kart derrière"),
    "card.currentLapTime"   to mapOf(Language.ES to "Vuelta actual (tiempo real)", Language.EN to "Current lap (real time)", Language.IT to "Giro attuale (tempo reale)", Language.DE to "Aktuelle Runde (Echtzeit)", Language.FR to "Tour actuel (temps réel)"),
    "card.avgLap20"         to mapOf(Language.ES to "Vuelta media (20v)", Language.EN to "Avg lap (last 20)", Language.IT to "Giro medio (20 giri)", Language.DE to "Ø Runde (letzte 20)", Language.FR to "Tour moyen (20 derniers)"),
    "card.best3"            to mapOf(Language.ES to "Media Mejor 3 v", Language.EN to "Avg of best 3 laps", Language.IT to "Media dei 3 migliori giri", Language.DE to "Ø der 3 besten Runden", Language.FR to "Moy. des 3 meilleurs tours"),
    "card.position"         to mapOf(Language.ES to "Posición (tiempos medios)", Language.EN to "Position (avg times)", Language.IT to "Posizione (tempi medi)", Language.DE to "Position (Ø-Zeiten)", Language.FR to "Position (temps moyens)"),
    "card.realPos"          to mapOf(Language.ES to "Posición (clasif. real)", Language.EN to "Position (real classification)", Language.IT to "Posizione (classifica reale)", Language.DE to "Position (echte Klassifizierung)", Language.FR to "Position (classement réel)"),
    "card.gapAhead"         to mapOf(Language.ES to "Gap Real Kart delante", Language.EN to "Real gap kart ahead", Language.IT to "Gap reale kart davanti", Language.DE to "Echter Abstand Kart vorne", Language.FR to "Écart réel kart devant"),
    "card.gapBehind"        to mapOf(Language.ES to "Gap Real Kart detrás", Language.EN to "Real gap kart behind", Language.IT to "Gap reale kart dietro", Language.DE to "Echter Abstand Kart hinten", Language.FR to "Écart réel kart derrière"),
    "card.avgFutureStint"   to mapOf(Language.ES to "Media stint futuro", Language.EN to "Future stint average", Language.IT to "Media stint futuro", Language.DE to "Ø zukünftiger Stint", Language.FR to "Moy. relais futur"),
    "card.lapsToMaxStint"   to mapOf(Language.ES to "Vueltas hasta stint máximo", Language.EN to "Laps to max stint", Language.IT to "Giri al stint massimo", Language.DE to "Runden bis Max-Stint", Language.FR to "Tours jusqu'au relais max"),
    "card.theoreticalBestLap" to mapOf(Language.ES to "Mejor vuelta teórica sectores", Language.EN to "Theoretical best lap (sectors)", Language.IT to "Miglior giro teorico (settori)", Language.DE to "Theoretisch beste Runde (Sektoren)", Language.FR to "Meilleur tour théorique (secteurs)"),
    "card.deltaBestS1"      to mapOf(Language.ES to "Δ Mejor S1", Language.EN to "Δ Best S1", Language.IT to "Δ Migliore S1", Language.DE to "Δ Beste S1", Language.FR to "Δ Meilleur S1"),
    "card.deltaBestS2"      to mapOf(Language.ES to "Δ Mejor S2", Language.EN to "Δ Best S2", Language.IT to "Δ Migliore S2", Language.DE to "Δ Beste S2", Language.FR to "Δ Meilleur S2"),
    "card.deltaBestS3"      to mapOf(Language.ES to "Δ Mejor S3", Language.EN to "Δ Best S3", Language.IT to "Δ Migliore S3", Language.DE to "Δ Beste S3", Language.FR to "Δ Meilleur S3"),
    "card.deltaSectors"     to mapOf(Language.ES to "Δ Sectores", Language.EN to "Δ Sectors", Language.IT to "Δ Settori", Language.DE to "Δ Sektoren", Language.FR to "Δ Secteurs"),
    "card.deltaCurrentS1"   to mapOf(Language.ES to "Δ Actual S1", Language.EN to "Δ Current S1", Language.IT to "Δ Attuale S1", Language.DE to "Δ Aktuell S1", Language.FR to "Δ Actuel S1"),
    "card.deltaCurrentS2"   to mapOf(Language.ES to "Δ Actual S2", Language.EN to "Δ Current S2", Language.IT to "Δ Attuale S2", Language.DE to "Δ Aktuell S2", Language.FR to "Δ Actuel S2"),
    "card.deltaCurrentS3"   to mapOf(Language.ES to "Δ Actual S3", Language.EN to "Δ Current S3", Language.IT to "Δ Attuale S3", Language.DE to "Δ Aktuell S3", Language.FR to "Δ Actuel S3"),
    "card.deltaSectorsCurrent" to mapOf(Language.ES to "Δ Sectores Actual", Language.EN to "Δ Current Sectors", Language.IT to "Δ Settori Attuale", Language.DE to "Δ Aktuelle Sektoren", Language.FR to "Δ Secteurs Actuels"),
    "card.currentPit"       to mapOf(Language.ES to "Pit en curso", Language.EN to "Current pit", Language.IT to "Pit in corso", Language.DE to "Laufender Pit", Language.FR to "Pit en cours"),
    "card.pitCount"         to mapOf(Language.ES to "PITS (realizados / mínimos)", Language.EN to "PITS (done / min)", Language.IT to "PITS (effettuati / minimi)", Language.DE to "PITS (gemacht / min)", Language.FR to "PITS (effectués / mini)"),
    "card.boxScore"         to mapOf(Language.ES to "Puntuación Box", Language.EN to "Box score", Language.IT to "Punteggio Box", Language.DE to "Box-Score", Language.FR to "Score Box"),
    "card.pitWindow"        to mapOf(Language.ES to "Ventana de pit (open/closed)", Language.EN to "Pit window (open/closed)", Language.IT to "Finestra pit (aperta/chiusa)", Language.DE to "Pit-Fenster (offen/zu)", Language.FR to "Fenêtre pit (ouverte/fermée)"),
    "card.deltaBestLap"     to mapOf(Language.ES to "Delta vs Best Lap (GPS)", Language.EN to "Delta vs Best Lap (GPS)", Language.IT to "Delta vs Miglior Giro (GPS)", Language.DE to "Delta zu Bester Runde (GPS)", Language.FR to "Delta vs meilleur tour (GPS)"),
    "card.gpsLapDelta"      to mapOf(Language.ES to "Delta vuelta anterior GPS", Language.EN to "Delta to previous lap (GPS)", Language.IT to "Delta giro precedente (GPS)", Language.DE to "Delta zur vorigen Runde (GPS)", Language.FR to "Delta tour précédent (GPS)"),
    "card.gForceRadar"      to mapOf(Language.ES to "G-Force (diana)", Language.EN to "G-Force (target)", Language.IT to "G-Force (bersaglio)", Language.DE to "G-Force (Zielscheibe)", Language.FR to "G-Force (cible)"),
    "card.gpsGForce"        to mapOf(Language.ES to "G-Force (números)", Language.EN to "G-Force (numbers)", Language.IT to "G-Force (numeri)", Language.DE to "G-Force (Zahlen)", Language.FR to "G-Force (chiffres)"),
    "card.gpsSpeed"         to mapOf(Language.ES to "Velocidad GPS", Language.EN to "GPS speed", Language.IT to "Velocità GPS", Language.DE to "GPS-Geschwindigkeit", Language.FR to "Vitesse GPS"),
)
