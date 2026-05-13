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
)
