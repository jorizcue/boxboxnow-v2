import Combine
import Foundation
import SwiftUI

/// Lightweight i18n layer mirroring the web's `lib/i18n.ts` model:
/// a single global dictionary of `key -> {lang: text}`, a tiny store
/// that persists the user's choice to UserDefaults, and a `t(_:)`
/// free function that the views read from.
///
/// Not every visible string is keyed yet — the rollout is gradual.
/// Anything not in `translations` keeps its hard-coded Spanish text;
/// callers can migrate one screen at a time without breaking
/// untouched screens.

enum Language: String, CaseIterable, Identifiable {
    case es, en, it, de, fr

    var id: String { rawValue }

    var flag: String {
        switch self {
        case .es: return "🇪🇸"
        case .en: return "🇬🇧"
        case .it: return "🇮🇹"
        case .de: return "🇩🇪"
        case .fr: return "🇫🇷"
        }
    }

    var label: String {
        switch self {
        case .es: return "Español"
        case .en: return "English"
        case .it: return "Italiano"
        case .de: return "Deutsch"
        case .fr: return "Français"
        }
    }
}

/// Reactive store for the current language. Mounted at the App root
/// as a `@StateObject` and consumed via `@EnvironmentObject` (or via
/// the `t(_:)` free function, which reads from the shared singleton).
final class LanguageStore: ObservableObject {
    static let shared = LanguageStore()

    /// Persisted to UserDefaults under the iOS-equivalent of the web's
    /// `boxboxnow-lang` localStorage key. Defaults to Spanish when
    /// no value is stored yet.
    @Published var lang: Language {
        didSet {
            UserDefaults.standard.set(lang.rawValue, forKey: Self.defaultsKey)
        }
    }

    private static let defaultsKey = "bbn_lang"

    private init() {
        let raw = UserDefaults.standard.string(forKey: Self.defaultsKey) ?? ""
        self.lang = Language(rawValue: raw) ?? .es
    }
}

/// Translate a key in the active language. Falls back to the Spanish
/// entry, and if neither exists returns the key itself — same
/// behaviour as the web hook so a missing translation is visible to
/// the dev but never crashes the screen.
func t(_ key: String) -> String {
    let lang = LanguageStore.shared.lang
    let entry = translations[key]
    return entry?[lang] ?? entry?[.es] ?? key
}

/// Translate with `{name}` placeholder substitution. Mirrors the
/// `t(key, params)` shape of the web hook.
func t(_ key: String, _ params: [String: String]) -> String {
    var out = t(key)
    for (k, v) in params {
        out = out.replacingOccurrences(of: "{\(k)}", with: v)
    }
    return out
}

// MARK: - Translation catalog

/// Strings shared across the iOS app. Keep it alphabetical-by-key
/// within each section so it stays scannable as it grows. The keys
/// MATCH the web's `lib/i18n.ts` keys whenever the surface is the
/// same — makes copy-paste of new translations trivial.
private let translations: [String: [Language: String]] = [
    // MARK: Common
    "common.cancel":   [.es: "Cancelar",      .en: "Cancel",     .it: "Annulla",      .de: "Abbrechen",  .fr: "Annuler"],
    "common.save":     [.es: "Guardar",       .en: "Save",       .it: "Salva",        .de: "Speichern",  .fr: "Enregistrer"],
    "common.delete":   [.es: "Eliminar",      .en: "Delete",     .it: "Elimina",      .de: "Löschen",    .fr: "Supprimer"],
    "common.edit":     [.es: "Editar",        .en: "Edit",       .it: "Modifica",     .de: "Bearbeiten", .fr: "Modifier"],
    "common.done":     [.es: "Listo",         .en: "Done",       .it: "Fatto",        .de: "Fertig",     .fr: "OK"],
    "common.loading":  [.es: "Cargando...",   .en: "Loading...", .it: "Caricamento...", .de: "Laden...", .fr: "Chargement..."],
    "common.close":    [.es: "Cerrar",        .en: "Close",      .it: "Chiudi",       .de: "Schließen",  .fr: "Fermer"],
    "common.error":    [.es: "Error",         .en: "Error",      .it: "Errore",       .de: "Fehler",     .fr: "Erreur"],
    "common.ok":       [.es: "OK",            .en: "OK",         .it: "OK",           .de: "OK",         .fr: "OK"],
    "common.yes":      [.es: "Sí",            .en: "Yes",        .it: "Sì",           .de: "Ja",         .fr: "Oui"],
    "common.no":       [.es: "No",            .en: "No",         .it: "No",           .de: "Nein",       .fr: "Non"],
    "common.add":      [.es: "Añadir",        .en: "Add",        .it: "Aggiungi",     .de: "Hinzufügen", .fr: "Ajouter"],
    "common.language": [.es: "Idioma",        .en: "Language",   .it: "Lingua",       .de: "Sprache",    .fr: "Langue"],

    // MARK: Login
    "login.title":      [.es: "Iniciar sesión",      .en: "Sign in",        .it: "Accedi",          .de: "Anmelden",        .fr: "Connexion"],
    "login.email":      [.es: "Email",               .en: "Email",          .it: "Email",           .de: "E-Mail",          .fr: "Email"],
    "login.password":   [.es: "Contraseña",          .en: "Password",       .it: "Password",        .de: "Passwort",        .fr: "Mot de passe"],
    "login.signIn":     [.es: "Iniciar sesión",      .en: "Sign in",        .it: "Accedi",          .de: "Anmelden",        .fr: "Se connecter"],
    "login.loading":    [.es: "Entrando...",         .en: "Signing in...",  .it: "Accesso...",      .de: "Anmelden...",     .fr: "Connexion..."],
    "login.withGoogle": [.es: "Continuar con Google", .en: "Continue with Google", .it: "Continua con Google", .de: "Mit Google fortfahren", .fr: "Continuer avec Google"],
    "login.forgotPassword": [.es: "¿Olvidaste tu contraseña?", .en: "Forgot your password?", .it: "Password dimenticata?", .de: "Passwort vergessen?", .fr: "Mot de passe oublié ?"],

    // MARK: Home
    "home.viewPilot":          [.es: "Vista Piloto",                     .en: "Driver View",                   .it: "Vista Pilota",                  .de: "Fahreransicht",                  .fr: "Vue Pilote"],
    "home.fullScreen":         [.es: "Pantalla completa",                .en: "Fullscreen",                    .it: "Schermo intero",                .de: "Vollbild",                       .fr: "Plein écran"],
    "home.config":             [.es: "Configuración",                    .en: "Settings",                      .it: "Impostazioni",                  .de: "Einstellungen",                  .fr: "Configuration"],
    "home.configSubtitle":     [.es: "Carrera, Plantillas, GPS",         .en: "Race, Templates, GPS",          .it: "Gara, Modelli, GPS",            .de: "Rennen, Vorlagen, GPS",          .fr: "Course, Plantillas, GPS"],
    "home.session":            [.es: "Sesión",                           .en: "Session",                       .it: "Sessione",                      .de: "Sitzung",                        .fr: "Session"],
    "home.configureSession":   [.es: "Configura la sesión antes de entrar", .en: "Set up the session first", .it: "Configura la sessione prima", .de: "Sitzung zuerst einrichten", .fr: "Configurez la session avant"],
    "home.needKartAndDuration":[.es: "Necesitas definir al menos el kart y la duración", .en: "You need at least kart number and duration", .it: "Almeno il kart e la durata", .de: "Mindestens Kart und Dauer", .fr: "Au minimum kart et durée"],
    "home.signOut":            [.es: "Cerrar sesión",                    .en: "Sign out",                      .it: "Esci",                          .de: "Abmelden",                       .fr: "Déconnexion"],

    // MARK: Config / Session
    "session.title":           [.es: "Sesión de carrera",                .en: "Race session",                  .it: "Sessione di gara",              .de: "Rennsitzung",                    .fr: "Session de course"],
    "session.update":          [.es: "Actualizar sesión",                .en: "Update session",                .it: "Aggiorna sessione",             .de: "Sitzung aktualisieren",          .fr: "Mettre à jour"],
    "session.saved":           [.es: "Guardado",                         .en: "Saved",                         .it: "Salvato",                       .de: "Gespeichert",                    .fr: "Enregistré"],
    "session.sectionRace":     [.es: "Carrera",                          .en: "Race",                          .it: "Gara",                          .de: "Rennen",                         .fr: "Course"],
    "session.sectionPit":      [.es: "Pit stops",                        .en: "Pit stops",                     .it: "Pit stop",                      .de: "Boxenstopps",                    .fr: "Arrêts au box"],
    "session.sectionStints":   [.es: "Stints y pilotos",                 .en: "Stints & drivers",              .it: "Stint e piloti",                .de: "Stints & Fahrer",                .fr: "Relais et pilotes"],
    "session.sectionRain":     [.es: "Modo lluvia",                      .en: "Rain mode",                     .it: "Modalità pioggia",              .de: "Regenmodus",                     .fr: "Mode pluie"],
    "session.rainOn":          [.es: "Activado",                         .en: "On",                            .it: "Attivato",                      .de: "Ein",                            .fr: "Activé"],
    "session.rainOff":         [.es: "Desactivado",                      .en: "Off",                           .it: "Disattivato",                   .de: "Aus",                            .fr: "Désactivé"],
    "session.rainHint":        [.es: "Desactiva el filtro de outliers en las medias para que la lluvia no falsee el ritmo.", .en: "Disables outlier filtering on rolling averages so a wet pace doesn't get rejected as noise.", .it: "Disattiva il filtro outlier sulle medie mobili per non scartare il ritmo bagnato come rumore.", .de: "Deaktiviert den Ausreißerfilter, damit ein nasser Pace nicht als Rauschen verworfen wird.", .fr: "Désactive le filtre d'outliers sur les moyennes pour que la pluie ne fausse pas le rythme."],
    "session.circuit":         [.es: "CIRCUITO",                         .en: "CIRCUIT",                       .it: "CIRCUITO",                      .de: "STRECKE",                        .fr: "CIRCUIT"],
    "session.selectCircuit":   [.es: "Seleccionar",                      .en: "Select",                        .it: "Seleziona",                     .de: "Auswählen",                      .fr: "Sélectionner"],

    // MARK: Status bar (mirrors web `status.*`)
    "status.pitOpen":          [.es: "PIT ABIERTO",                      .en: "PIT OPEN",                      .it: "PIT APERTO",                    .de: "PIT OFFEN",                      .fr: "BOX OUVERT"],
    "status.pitClosed":        [.es: "PIT CERRADO",                      .en: "PIT CLOSED",                    .it: "PIT CHIUSO",                    .de: "PIT GESCHL.",                    .fr: "BOX FERMÉ"],
    "status.race":             [.es: "Carrera",                          .en: "Race",                          .it: "Gara",                          .de: "Rennen",                         .fr: "Course"],
    "status.devices":          [.es: "Dispositivos",                     .en: "Devices",                       .it: "Dispositivi",                   .de: "Geräte",                         .fr: "Appareils"],
    "status.signOut":          [.es: "Salir",                            .en: "Sign out",                      .it: "Esci",                          .de: "Abmelden",                       .fr: "Déconnexion"],

    // MARK: BOX call
    "box.callBox":             [.es: "Llamar a BOX",                     .en: "Call BOX",                      .it: "Chiama BOX",                    .de: "BOX rufen",                      .fr: "Appeler au BOX"],
    "box.sent":                [.es: "¡Enviado!",                        .en: "Sent!",                         .it: "Inviato!",                      .de: "Gesendet!",                      .fr: "Envoyé !"],
]
