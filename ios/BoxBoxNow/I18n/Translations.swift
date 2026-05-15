import Foundation
import SwiftUI
import Combine

/**
 * iOS i18n layer — mirror of the Android `Translations.kt` system and the
 * web `lib/i18n.ts`. Same key naming, same five languages (ES default,
 * EN, IT, DE, FR), same fail-soft semantics (missing key → return key
 * itself).
 *
 * SwiftUI integration:
 *   - `LanguageStore.shared` is an `ObservableObject` published at the
 *     app root via `.environmentObject(LanguageStore.shared)`.
 *   - Views observe with `@EnvironmentObject var lang: LanguageStore` and
 *     read `lang.current` whenever they need a translation.
 *   - The free-function `t(_ key:_ lang:)` is the actual translator.
 *
 * The state is persisted in `UserDefaults` under key `bbn_lang` —
 * intentionally the same key Android uses, so a user signed in on both
 * platforms with the same Apple ID keeps a consistent preference if
 * Apple syncs UserDefaults via iCloud.
 */

// MARK: - Language enum

enum Language: String, CaseIterable, Codable {
    case es, en, it, de, fr

    var code: String { rawValue }

    /// Emoji flag glyph used by the language picker.
    var flag: String {
        switch self {
        case .es: return "🇪🇸"
        case .en: return "🇬🇧"
        case .it: return "🇮🇹"
        case .de: return "🇩🇪"
        case .fr: return "🇫🇷"
        }
    }

    /// Native-name label shown in the picker dropdown.
    var label: String {
        switch self {
        case .es: return "Español"
        case .en: return "English"
        case .it: return "Italiano"
        case .de: return "Deutsch"
        case .fr: return "Français"
        }
    }

    /// Parse a stored code with a safe fallback. `nil` and anything
    /// unrecognised map to Spanish — same behaviour as Android.
    static func from(code: String?) -> Language {
        guard let c = code, let l = Language(rawValue: c.lowercased()) else { return .es }
        return l
    }
}

// MARK: - LanguageStore

/// App-wide language preference. Read by views via `@EnvironmentObject`.
/// Flipping `current` automatically recomposes every view that observes
/// it (SwiftUI's `@Published` re-renders dependent views).
@MainActor
final class LanguageStore: ObservableObject {
    static let shared = LanguageStore()

    private static let prefKey = "bbn_lang"

    @Published var current: Language

    private init() {
        let saved = UserDefaults.standard.string(forKey: Self.prefKey)
        self.current = Language.from(code: saved)
    }

    /// Update + persist. Triggers re-render of all observers.
    func set(_ lang: Language) {
        current = lang
        UserDefaults.standard.set(lang.code, forKey: Self.prefKey)
    }
}

// MARK: - Translator

/// Translate a key in the given language. Falls back to Spanish, then to
/// the key itself if nothing matches — same fail-soft as Android/web.
func t(_ key: String, _ lang: Language) -> String {
    guard let entry = translations[key] else { return key }
    return entry[lang] ?? entry[.es] ?? key
}

/// Convenience overload for templates with `{placeholder}` substitution.
/// Used for strings like `"{count} pilotos"` where the parameter needs
/// to be interpolated after translation.
func t(_ key: String, _ lang: Language, params: [String: String]) -> String {
    var out = t(key, lang)
    for (k, v) in params {
        out = out.replacingOccurrences(of: "{\(k)}", with: v)
    }
    return out
}

// MARK: - View helper

/// Convenience wrapper that pulls the active language from the
/// environment and renders a `Text` view with the translated string.
/// Lets call sites stay terse:  `T("common.save")`  instead of
/// `Text(t("common.save", langStore.current))` everywhere.
struct T: View {
    let key: String
    @EnvironmentObject private var lang: LanguageStore

    init(_ key: String) {
        self.key = key
    }

    var body: some View {
        Text(t(key, lang.current))
    }
}

// MARK: - Translation catalog
//
// Keys are shared with Android (see `Translations.kt`). When adding a
// key here, also add it there — both apps should always have parity.
// Same five languages, same fail-soft semantics.

private let translations: [String: [Language: String]] = [
    // ─── Common ───
    "common.cancel":   [.es: "Cancelar",     .en: "Cancel",        .it: "Annulla",         .de: "Abbrechen",   .fr: "Annuler"],
    "common.save":     [.es: "Guardar",      .en: "Save",          .it: "Salva",           .de: "Speichern",   .fr: "Enregistrer"],
    "common.delete":   [.es: "Eliminar",     .en: "Delete",        .it: "Elimina",         .de: "Löschen",     .fr: "Supprimer"],
    "common.edit":     [.es: "Editar",       .en: "Edit",          .it: "Modifica",        .de: "Bearbeiten",  .fr: "Modifier"],
    "common.done":     [.es: "Listo",        .en: "Done",          .it: "Fatto",           .de: "Fertig",      .fr: "OK"],
    "common.loading":  [.es: "Cargando...",  .en: "Loading...",    .it: "Caricamento...",  .de: "Laden...",    .fr: "Chargement..."],
    "common.close":    [.es: "Cerrar",       .en: "Close",         .it: "Chiudi",          .de: "Schließen",   .fr: "Fermer"],
    "common.error":    [.es: "Error",        .en: "Error",         .it: "Errore",          .de: "Fehler",      .fr: "Erreur"],
    "common.ok":       [.es: "OK",           .en: "OK",            .it: "OK",              .de: "OK",          .fr: "OK"],
    "common.add":      [.es: "Añadir",       .en: "Add",           .it: "Aggiungi",        .de: "Hinzufügen",  .fr: "Ajouter"],
    "common.back":     [.es: "Volver",       .en: "Back",          .it: "Indietro",        .de: "Zurück",      .fr: "Retour"],
    "common.next":     [.es: "Siguiente",    .en: "Next",          .it: "Avanti",          .de: "Weiter",      .fr: "Suivant"],
    "common.menu":     [.es: "Menú",         .en: "Menu",          .it: "Menu",            .de: "Menü",        .fr: "Menu"],
    "common.signOut":  [.es: "Salir",        .en: "Sign out",      .it: "Esci",            .de: "Abmelden",    .fr: "Déconnexion"],
    "common.unknown":  [.es: "Desconocido",  .en: "Unknown",       .it: "Sconosciuto",     .de: "Unbekannt",   .fr: "Inconnu"],
    "common.none":     [.es: "Ninguna",      .en: "None",          .it: "Nessuna",         .de: "Keine",       .fr: "Aucune"],
    "common.pending":  [.es: "Pendiente",    .en: "Pending",       .it: "In sospeso",      .de: "Ausstehend",  .fr: "En attente"],

    // ─── Login ───
    "login.title":     [.es: "Iniciar sesión",    .en: "Sign in",        .it: "Accedi",          .de: "Anmelden",     .fr: "Connexion"],
    "login.email":     [.es: "Email",             .en: "Email",          .it: "Email",           .de: "E-Mail",       .fr: "Email"],
    "login.password":  [.es: "Contraseña",        .en: "Password",       .it: "Password",        .de: "Passwort",     .fr: "Mot de passe"],
    "login.signIn":    [.es: "Iniciar sesión",    .en: "Sign in",        .it: "Accedi",          .de: "Anmelden",     .fr: "Se connecter"],
    "login.googleSso": [.es: "Continuar con Google", .en: "Continue with Google", .it: "Continua con Google", .de: "Mit Google fortfahren", .fr: "Continuer avec Google"],
    "login.mfaTitle":  [.es: "Verificación en dos pasos", .en: "Two-step verification", .it: "Verifica in due passaggi", .de: "Zwei-Faktor-Anmeldung", .fr: "Vérification en deux étapes"],
    "login.mfaCode":   [.es: "Código MFA",        .en: "MFA code",       .it: "Codice MFA",      .de: "MFA-Code",     .fr: "Code MFA"],
    "login.verify":    [.es: "Verificar",         .en: "Verify",         .it: "Verifica",        .de: "Bestätigen",   .fr: "Vérifier"],
    "login.or":        [.es: "o",                 .en: "or",             .it: "o",               .de: "oder",         .fr: "ou"],

    // ─── Home ───
    "home.config":          [.es: "Configuración",  .en: "Settings",   .it: "Impostazioni",   .de: "Einstellungen", .fr: "Configuration"],
    "home.configSubtitle":  [.es: "Carrera, Plantillas, GPS", .en: "Race, Templates, GPS", .it: "Gara, Modelli, GPS", .de: "Rennen, Vorlagen, GPS", .fr: "Course, Plantillas, GPS"],
    "home.driverView":      [.es: "Vista Piloto",   .en: "Driver View", .it: "Vista Pilota",  .de: "Fahreransicht", .fr: "Vue Pilote"],
    "home.fullScreen":      [.es: "Pantalla completa", .en: "Fullscreen", .it: "Schermo intero", .de: "Vollbild",    .fr: "Plein écran"],

    // ─── Config menu ───
    "config.session":     [.es: "Sesión",          .en: "Session",       .it: "Sessione",      .de: "Sitzung",     .fr: "Session"],
    "config.box":         [.es: "Box",             .en: "Pit",           .it: "Box",           .de: "Box",         .fr: "Stand"],
    "config.templates":   [.es: "Plantillas",      .en: "Templates",     .it: "Modelli",       .de: "Vorlagen",    .fr: "Plantillas"],
    "config.gps":         [.es: "GPS / RaceBox",   .en: "GPS / RaceBox", .it: "GPS / RaceBox", .de: "GPS / RaceBox", .fr: "GPS / RaceBox"],

    // ─── Session config ───
    "session.title":            [.es: "Sesión de carrera", .en: "Race session",     .it: "Sessione di gara", .de: "Rennsitzung", .fr: "Session de course"],
    "session.name":             [.es: "Nombre de sesión",  .en: "Session name",     .it: "Nome sessione",   .de: "Sitzungsname", .fr: "Nom de session"],
    "session.circuit":          [.es: "Circuito",          .en: "Circuit",          .it: "Circuito",        .de: "Strecke",     .fr: "Circuit"],
    "session.circuitId":        [.es: "ID del circuito",   .en: "Circuit ID",       .it: "ID circuito",     .de: "Strecken-ID", .fr: "ID du circuit"],
    "session.duration":         [.es: "Duración",          .en: "Duration",         .it: "Durata",          .de: "Dauer",       .fr: "Durée"],
    "session.totalMinutes":     [.es: "Minutos totales",   .en: "Total minutes",    .it: "Minuti totali",   .de: "Gesamtminuten", .fr: "Minutes totales"],
    "session.totalLaps":        [.es: "Vueltas totales",   .en: "Total laps",       .it: "Giri totali",     .de: "Gesamtrunden", .fr: "Tours totaux"],
    "session.kartCount":        [.es: "Karts",             .en: "Karts",            .it: "Kart",            .de: "Karts",       .fr: "Karts"],
    "session.kartCountValue":   [.es: "Karts: {count}",    .en: "Karts: {count}",   .it: "Kart: {count}",   .de: "Karts: {count}", .fr: "Karts : {count}"],

    // ─── Box (Teams) ───
    "box.title":            [.es: "BOX",            .en: "PIT",           .it: "BOX",            .de: "BOX",         .fr: "STAND"],
    "box.pitNumber":        [.es: "PARADA #{n}",    .en: "PIT #{n}",      .it: "PIT #{n}",       .de: "BOX #{n}",    .fr: "STAND #{n}"],

    // ─── Templates / Presets ───
    "preset.title":           [.es: "Plantilla",          .en: "Template",       .it: "Modello",        .de: "Vorlage",      .fr: "Plantilla"],
    "preset.titlePlural":     [.es: "Plantillas",         .en: "Templates",      .it: "Modelli",        .de: "Vorlagen",     .fr: "Plantillas"],
    "preset.cardSubtitle":    [.es: "Plantillas ({n}/{max})", .en: "Templates ({n}/{max})", .it: "Modelli ({n}/{max})", .de: "Vorlagen ({n}/{max})", .fr: "Plantillas ({n}/{max})"],
    "preset.saveCurrent":     [.es: "Guardar configuración actual", .en: "Save current setup", .it: "Salva configurazione attuale", .de: "Aktuelle Konfiguration speichern", .fr: "Enregistrer la configuration actuelle"],
    "preset.savePreset":      [.es: "Guardar plantilla",  .en: "Save template",  .it: "Salva modello",  .de: "Vorlage speichern", .fr: "Enregistrer plantilla"],
    "preset.visibleCards":    [.es: "Tarjetas visibles",  .en: "Visible cards",  .it: "Schede visibili", .de: "Sichtbare Karten", .fr: "Cartes visibles"],
    "preset.orderAndPreview": [.es: "Orden y vista previa", .en: "Order and preview", .it: "Ordine e anteprima", .de: "Reihenfolge und Vorschau", .fr: "Ordre et aperçu"],
    "preset.orientation":     [.es: "Orientación",        .en: "Orientation",    .it: "Orientamento",   .de: "Ausrichtung",  .fr: "Orientation"],
    "preset.brightness":      [.es: "Brillo",             .en: "Brightness",     .it: "Luminosità",     .de: "Helligkeit",   .fr: "Luminosité"],
    "preset.cardsCount":      [.es: "{count} tarjetas",   .en: "{count} cards",  .it: "{count} schede", .de: "{count} Karten", .fr: "{count} cartes"],

    // ─── GPS config ───
    "gps.title":              [.es: "GPS / RaceBox",      .en: "GPS / RaceBox",  .it: "GPS / RaceBox",  .de: "GPS / RaceBox", .fr: "GPS / RaceBox"],
    "gps.source":             [.es: "Fuente GPS",         .en: "GPS source",     .it: "Sorgente GPS",   .de: "GPS-Quelle",   .fr: "Source GPS"],
    "gps.sourceLabel":        [.es: "Fuente",             .en: "Source",         .it: "Sorgente",       .de: "Quelle",       .fr: "Source"],
    "gps.phone":              [.es: "GPS del teléfono",   .en: "Phone GPS",      .it: "GPS del telefono", .de: "Telefon-GPS", .fr: "GPS du téléphone"],
    "gps.raceboxBle":         [.es: "RaceBox BLE",        .en: "RaceBox BLE",    .it: "RaceBox BLE",    .de: "RaceBox BLE",  .fr: "RaceBox BLE"],
    "gps.searchDevices":      [.es: "Buscar dispositivos", .en: "Scan devices",  .it: "Cerca dispositivi", .de: "Geräte suchen", .fr: "Rechercher des appareils"],
    "gps.searching":          [.es: "Buscando dispositivos...", .en: "Scanning…",  .it: "Ricerca in corso…", .de: "Suche läuft…", .fr: "Recherche en cours…"],
    "gps.connected":          [.es: "Conectado",          .en: "Connected",      .it: "Connesso",       .de: "Verbunden",    .fr: "Connecté"],
    "gps.authorized":         [.es: "Autorizado",         .en: "Authorized",     .it: "Autorizzato",    .de: "Autorisiert",  .fr: "Autorisé"],
    "gps.status":             [.es: "Estado",             .en: "Status",         .it: "Stato",          .de: "Status",       .fr: "État"],
    "gps.signal":             [.es: "Señal",              .en: "Signal",         .it: "Segnale",        .de: "Signal",       .fr: "Signal"],
    "gps.frequency":          [.es: "Frecuencia",         .en: "Frequency",      .it: "Frequenza",      .de: "Frequenz",     .fr: "Fréquence"],
    "gps.deltaFrequency":     [.es: "Frecuencia delta",   .en: "Delta frequency", .it: "Frequenza delta", .de: "Delta-Frequenz", .fr: "Fréquence delta"],
    "gps.startCalibration":   [.es: "Iniciar calibración", .en: "Start calibration", .it: "Avvia calibrazione", .de: "Kalibrierung starten", .fr: "Démarrer l'étalonnage"],
    "gps.imuCalibration":     [.es: "Calibración IMU",    .en: "IMU calibration", .it: "Calibrazione IMU", .de: "IMU-Kalibrierung", .fr: "Étalonnage IMU"],
    "gps.history":            [.es: "Historial",          .en: "History",        .it: "Cronologia",     .de: "Verlauf",      .fr: "Historique"],
    "gps.phase":              [.es: "Fase",               .en: "Phase",          .it: "Fase",           .de: "Phase",        .fr: "Phase"],
    "gps.inProgress":         [.es: "EN CURSO",           .en: "IN PROGRESS",    .it: "IN CORSO",       .de: "LÄUFT",        .fr: "EN COURS"],

    // ─── Driver view / menu ───
    "driver.menuTap":         [.es: "Toca para cerrar",   .en: "Tap to close",   .it: "Tocca per chiudere", .de: "Zum Schließen tippen", .fr: "Toucher pour fermer"],
    "driver.menuAutoclose":   [.es: "Se cierra automáticamente", .en: "Closes automatically", .it: "Si chiude automaticamente", .de: "Schließt automatisch", .fr: "Se ferme automatiquement"],

    // ─── Driver card names (used in headers, grid preview, visibility toggle) ───
    "card.position":      [.es: "Posición",          .en: "Position",        .it: "Posizione",       .de: "Position",        .fr: "Position"],
    "card.lapCount":      [.es: "Vueltas",           .en: "Laps",            .it: "Giri",            .de: "Runden",          .fr: "Tours"],
    "card.lastLap":       [.es: "Última vuelta",     .en: "Last lap",        .it: "Ultimo giro",     .de: "Letzte Runde",    .fr: "Dernier tour"],
    "card.bestLap":       [.es: "Mejor vuelta",      .en: "Best lap",        .it: "Miglior giro",    .de: "Beste Runde",     .fr: "Meilleur tour"],
    "card.gapToLeader":   [.es: "Gap al líder",      .en: "Gap to leader",   .it: "Gap dal leader",  .de: "Abstand zum Führenden", .fr: "Écart au leader"],
    "card.gapToAhead":    [.es: "Gap al de delante", .en: "Gap to ahead",    .it: "Gap dal precedente", .de: "Abstand zum Vordermann", .fr: "Écart au précédent"],
    "card.speed":         [.es: "Velocidad",         .en: "Speed",           .it: "Velocità",        .de: "Geschwindigkeit", .fr: "Vitesse"],
    "card.gForce":        [.es: "Fuerza G",          .en: "G force",         .it: "Forza G",         .de: "G-Kraft",         .fr: "Force G"],
    "card.currentStint":  [.es: "Stint actual",      .en: "Current stint",   .it: "Stint attuale",   .de: "Aktueller Stint", .fr: "Stint actuel"],
    "card.pitStops":      [.es: "Paradas en box",    .en: "Pit stops",       .it: "Soste ai box",    .de: "Boxenstopps",     .fr: "Arrêts au stand"],
    "card.sector":        [.es: "Sector",            .en: "Sector",          .it: "Settore",         .de: "Sektor",          .fr: "Secteur"],
    "card.tireLife":      [.es: "Vida neumáticos",   .en: "Tire life",       .it: "Vita gomme",      .de: "Reifenleben",     .fr: "Usure pneus"],
    "card.fuelLevel":     [.es: "Combustible",       .en: "Fuel",            .it: "Carburante",      .de: "Kraftstoff",      .fr: "Carburant"],
    "card.weather":       [.es: "Clima",             .en: "Weather",         .it: "Meteo",           .de: "Wetter",          .fr: "Météo"],
    "card.trackTemp":     [.es: "Temp. pista",       .en: "Track temp",      .it: "Temp. pista",     .de: "Streckentemp.",   .fr: "Temp. piste"],
    "card.consistency":   [.es: "Consistencia",      .en: "Consistency",     .it: "Costanza",        .de: "Konstanz",        .fr: "Constance"],
    "card.minimap":       [.es: "Minimapa",          .en: "Minimap",         .it: "Minimappa",       .de: "Minikarte",       .fr: "Minicarte"],
    "card.lapHistory":    [.es: "Historial vueltas", .en: "Lap history",     .it: "Cronologia giri", .de: "Rundenverlauf",   .fr: "Historique tours"],
    "card.delta":         [.es: "Delta",             .en: "Delta",           .it: "Delta",           .de: "Delta",           .fr: "Delta"],

    // ─── Orientation lock ───
    "orientation.free":      [.es: "Libre",      .en: "Free",     .it: "Libero",     .de: "Frei",       .fr: "Libre"],
    "orientation.portrait":  [.es: "Vertical",   .en: "Portrait", .it: "Verticale",  .de: "Hochformat", .fr: "Portrait"],
    "orientation.landscape": [.es: "Horizontal", .en: "Landscape", .it: "Orizzontale", .de: "Querformat", .fr: "Paysage"],

    // ─── GPS source / signal quality (enum displayNames) ───
    "gps.sourceNone":     [.es: "Ninguno",     .en: "None",       .it: "Nessuno",        .de: "Keine",       .fr: "Aucune"],
    "gps.sourcePhone":    [.es: "Teléfono",    .en: "Phone",      .it: "Telefono",       .de: "Telefon",     .fr: "Téléphone"],
    "gps.signalNone":     [.es: "Sin señal",   .en: "No signal",  .it: "Nessun segnale", .de: "Kein Signal", .fr: "Aucun signal"],
    "gps.signalPoor":     [.es: "Débil",       .en: "Poor",       .it: "Debole",         .de: "Schwach",     .fr: "Faible"],
    "gps.signalFair":     [.es: "Aceptable",   .en: "Fair",       .it: "Discreto",       .de: "Mittel",      .fr: "Correct"],
    "gps.signalGood":     [.es: "Buena",       .en: "Good",       .it: "Buono",          .de: "Gut",         .fr: "Bon"],
    "gps.signalExcellent":[.es: "Excelente",   .en: "Excellent",  .it: "Eccellente",     .de: "Ausgezeichnet", .fr: "Excellent"],
]
