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

    // MARK: Common (extended)
    "common.next":      [.es: "Siguiente",  .en: "Next",    .it: "Avanti",      .de: "Weiter",        .fr: "Suivant"],
    "common.back":      [.es: "Atras",      .en: "Back",    .it: "Indietro",    .de: "Zurück",        .fr: "Retour"],
    "common.info":      [.es: "Info",       .en: "Info",    .it: "Info",        .de: "Info",          .fr: "Info"],
    "common.saving":    [.es: "GUARDANDO...", .en: "SAVING...", .it: "SALVATAGGIO...", .de: "SPEICHERN...", .fr: "ENREGISTREMENT..."],
    "common.searching": [.es: "Buscando dispositivos...", .en: "Searching devices...", .it: "Ricerca dispositivi...", .de: "Geräte suchen...", .fr: "Recherche d'appareils..."],

    // MARK: Home (extended)
    "home.brandingTagline":  [.es: "ESTRATEGIA DE KARTING EN TIEMPO REAL", .en: "REAL-TIME KARTING STRATEGY", .it: "STRATEGIA KART IN TEMPO REALE", .de: "ECHTZEIT-KART-STRATEGIE", .fr: "STRATÉGIE KART EN TEMPS RÉEL"],
    "home.brandingSubtitle": [.es: "VISTA PILOTO",  .en: "DRIVER VIEW",    .it: "VISTA PILOTA",   .de: "FAHRERANSICHT",  .fr: "VUE PILOTE"],
    "home.activeSession":    [.es: "SESIÓN ACTIVA", .en: "ACTIVE SESSION", .it: "SESSIONE ATTIVA", .de: "AKTIVE SITZUNG", .fr: "SESSION ACTIVE"],
    "home.pillKart":         [.es: "KART",       .en: "KART",      .it: "KART",      .de: "KART",      .fr: "KART"],
    "home.pillDuration":     [.es: "DURACIÓN",   .en: "DURATION",  .it: "DURATA",    .de: "DAUER",     .fr: "DURÉE"],
    "home.pillPits":         [.es: "PITS",       .en: "PITS",      .it: "PIT",       .de: "BOXEN",     .fr: "ARRÊTS"],
    "home.pillCircuit":      [.es: "CIRCUITO",   .en: "CIRCUIT",   .it: "CIRCUITO",  .de: "STRECKE",   .fr: "CIRCUIT"],
    "home.pillMaxStint":     [.es: "MAX STINT",  .en: "MAX STINT", .it: "MAX STINT", .de: "MAX STINT", .fr: "MAX RELAIS"],
    "home.noCircuit":        [.es: "Sin circuito", .en: "No circuit", .it: "Nessun circuito", .de: "Keine Strecke", .fr: "Aucun circuit"],
    "home.viewPilotSubtitle": [.es: "Kart #{kart} · {min} min", .en: "Kart #{kart} · {min} min", .it: "Kart #{kart} · {min} min", .de: "Kart #{kart} · {min} min", .fr: "Kart #{kart} · {min} min"],

    // MARK: Config (hub)
    "config.title":    [.es: "Configuración", .en: "Settings",  .it: "Impostazioni", .de: "Einstellungen", .fr: "Configuration"],
    "config.session":  [.es: "Sesión",        .en: "Session",   .it: "Sessione",     .de: "Sitzung",       .fr: "Session"],
    "config.box":      [.es: "Box",           .en: "Box",       .it: "Box",          .de: "Box",           .fr: "Box"],
    "config.presets":  [.es: "Plantillas",    .en: "Templates", .it: "Modelli",      .de: "Vorlagen",      .fr: "Plantillas"],
    "config.gps":      [.es: "GPS / RaceBox", .en: "GPS / RaceBox", .it: "GPS / RaceBox", .de: "GPS / RaceBox", .fr: "GPS / RaceBox"],

    // MARK: Session (number cards)
    "session.kartTitle":         [.es: "NUESTRO KART", .en: "OUR KART", .it: "NOSTRO KART", .de: "UNSER KART", .fr: "NOTRE KART"],
    "session.kartTooltip":       [.es: "Numero del kart de tu equipo", .en: "Your team's kart number", .it: "Numero del kart della squadra", .de: "Kartnummer deines Teams", .fr: "Numéro du kart de ton équipe"],
    "session.durationTitle":     [.es: "DURACION (MIN)", .en: "DURATION (MIN)", .it: "DURATA (MIN)", .de: "DAUER (MIN)", .fr: "DURÉE (MIN)"],
    "session.durationTooltip":   [.es: "Duracion total de la carrera en minutos", .en: "Total race duration in minutes", .it: "Durata totale della gara in minuti", .de: "Gesamte Renndauer in Minuten", .fr: "Durée totale de la course en minutes"],
    "session.minPitsTitle":      [.es: "PITS MINIMOS", .en: "MIN PITS", .it: "PIT MINIMI", .de: "MIN. BOXENSTOPPS", .fr: "ARRÊTS MIN"],
    "session.minPitsTooltip":    [.es: "Paradas obligatorias minimas segun reglamento", .en: "Minimum mandatory pit stops per regulation", .it: "Pit stop minimi obbligatori da regolamento", .de: "Mindestpflichtboxenstopps laut Reglement", .fr: "Arrêts au stand minimum imposés par le règlement"],
    "session.pitTimeTitle":      [.es: "TIEMPO PIT (S)", .en: "PIT TIME (S)", .it: "TEMPO PIT (S)", .de: "BOXENZEIT (S)", .fr: "TEMPS ARRÊT (S)"],
    "session.pitTimeTooltip":    [.es: "Segundos que tardas en hacer una parada en boxes", .en: "Seconds for one pit stop", .it: "Secondi per un pit stop", .de: "Sekunden für einen Boxenstopp", .fr: "Secondes pour un arrêt au stand"],
    "session.pitClosedStartTitle": [.es: "PIT CERRADO\nINICIO (MIN)", .en: "PIT CLOSED\nSTART (MIN)", .it: "PIT CHIUSO\nINIZIO (MIN)", .de: "BOX ZU\nSTART (MIN)", .fr: "ARRÊT FERMÉ\nDÉBUT (MIN)"],
    "session.pitClosedStartTooltip": [.es: "Minuto en el que se cierra la ventana de pit", .en: "Minute the pit window closes", .it: "Minuto in cui si chiude la finestra pit", .de: "Minute, ab der das Boxenfenster schließt", .fr: "Minute à laquelle la fenêtre d'arrêt ferme"],
    "session.pitClosedEndTitle": [.es: "PIT CERRADO\nFINAL (MIN)", .en: "PIT CLOSED\nEND (MIN)", .it: "PIT CHIUSO\nFINE (MIN)", .de: "BOX ZU\nENDE (MIN)", .fr: "ARRÊT FERMÉ\nFIN (MIN)"],
    "session.pitClosedEndTooltip": [.es: "Minuto en el que se reabre la ventana de pit", .en: "Minute the pit window reopens", .it: "Minuto in cui si riapre la finestra pit", .de: "Minute, ab der das Boxenfenster wieder öffnet", .fr: "Minute à laquelle la fenêtre d'arrêt rouvre"],
    "session.minStintTitle":     [.es: "STINT MIN (MIN)", .en: "MIN STINT (MIN)", .it: "STINT MIN (MIN)", .de: "MIN. STINT (MIN)", .fr: "RELAIS MIN (MIN)"],
    "session.minStintTooltip":   [.es: "Tiempo mínimo que un piloto debe estar en pista", .en: "Minimum time a driver must be on track", .it: "Tempo minimo che un pilota deve stare in pista", .de: "Mindestzeit eines Fahrers auf der Strecke", .fr: "Temps minimum qu'un pilote doit passer en piste"],
    "session.maxStintTitle":     [.es: "STINT MAX (MIN)", .en: "MAX STINT (MIN)", .it: "STINT MAX (MIN)", .de: "MAX. STINT (MIN)", .fr: "RELAIS MAX (MIN)"],
    "session.maxStintTooltip":   [.es: "Tiempo máximo que un piloto puede estar en pista", .en: "Maximum time a driver can be on track", .it: "Tempo massimo che un pilota può stare in pista", .de: "Höchstzeit eines Fahrers auf der Strecke", .fr: "Temps maximum qu'un pilote peut passer en piste"],
    "session.minDriverTimeTitle": [.es: "TIEMPO MIN\nPILOTO (MIN)", .en: "MIN DRIVER\nTIME (MIN)", .it: "TEMPO MIN\nPILOTA (MIN)", .de: "MIN. FAHRER-\nZEIT (MIN)", .fr: "TEMPS MIN\nPILOTE (MIN)"],
    "session.minDriverTimeTooltip": [.es: "Tiempo mínimo total que cada piloto debe conducir", .en: "Minimum total drive time per driver", .it: "Tempo totale minimo che ogni pilota deve guidare", .de: "Mindestgesamtfahrzeit pro Fahrer", .fr: "Temps de conduite total minimum par pilote"],
    "session.teamDriversTitle":  [.es: "PILOTOS\nDEL EQUIPO", .en: "TEAM\nDRIVERS", .it: "PILOTI\nSQUADRA", .de: "TEAM-\nFAHRER", .fr: "PILOTES\nDE L'ÉQUIPE"],
    "session.teamDriversTooltip": [.es: "Número de pilotos del equipo. 0 = automático según Apex.", .en: "Number of drivers on the team. 0 = auto from Apex.", .it: "Numero di piloti della squadra. 0 = automatico via Apex.", .de: "Anzahl Teamfahrer. 0 = automatisch über Apex.", .fr: "Nombre de pilotes de l'équipe. 0 = auto via Apex."],
    "session.updateSession":     [.es: "ACTUALIZAR SESION", .en: "UPDATE SESSION", .it: "AGGIORNA SESSIONE", .de: "SITZUNG AKTUALISIEREN", .fr: "METTRE À JOUR LA SESSION"],

    // MARK: Box (Teams & drivers)
    "box.title":            [.es: "Configuración Box", .en: "Box Settings", .it: "Impostazioni Box", .de: "Box-Einstellungen", .fr: "Paramètres Box"],
    "box.autoLoadTitle":    [.es: "Auto-cargar al iniciar", .en: "Auto-load on start", .it: "Auto-caricamento all'avvio", .de: "Beim Start automatisch laden", .fr: "Charger auto au démarrage"],
    "box.autoLoadSubtitle": [.es: "Refresca equipos desde Live Timing al arrancar la carrera.", .en: "Refreshes teams from Live Timing when the race starts.", .it: "Aggiorna le squadre da Live Timing all'inizio della gara.", .de: "Aktualisiert Teams aus Live Timing beim Rennstart.", .fr: "Actualise les équipes depuis Live Timing au départ de la course."],
    "box.liveTiming":       [.es: "Live Timing", .en: "Live Timing", .it: "Live Timing", .de: "Live Timing", .fr: "Live Timing"],
    "box.team":             [.es: "Equipo", .en: "Team", .it: "Squadra", .de: "Team", .fr: "Équipe"],
    "box.teamsHeader":      [.es: "EQUIPOS ({count})", .en: "TEAMS ({count})", .it: "SQUADRE ({count})", .de: "TEAMS ({count})", .fr: "ÉQUIPES ({count})"],
    "box.empty":            [.es: "No hay equipos. Cargalos desde Live Timing o anadilos manualmente.", .en: "No teams. Load from Live Timing or add them manually.", .it: "Nessuna squadra. Caricale da Live Timing o aggiungile manualmente.", .de: "Keine Teams. Aus Live Timing laden oder manuell hinzufügen.", .fr: "Aucune équipe. Charge-les depuis Live Timing ou ajoute-les à la main."],
    "box.saveChanges":      [.es: "GUARDAR CAMBIOS", .en: "SAVE CHANGES", .it: "SALVA MODIFICHE", .de: "ÄNDERUNGEN SPEICHERN", .fr: "ENREGISTRER"],
    "box.addTeamTitle":     [.es: "Anadir equipo", .en: "Add team", .it: "Aggiungi squadra", .de: "Team hinzufügen", .fr: "Ajouter une équipe"],
    "box.addTeamPrompt":    [.es: "Nombre y número de kart del nuevo equipo.", .en: "Name and kart number for the new team.", .it: "Nome e numero kart della nuova squadra.", .de: "Name und Kartnummer des neuen Teams.", .fr: "Nom et numéro de kart de la nouvelle équipe."],
    "box.fieldName":        [.es: "Nombre", .en: "Name", .it: "Nome", .de: "Name", .fr: "Nom"],
    "box.fieldKart":        [.es: "Kart", .en: "Kart", .it: "Kart", .de: "Kart", .fr: "Kart"],
    "box.addConfirm":       [.es: "Anadir", .en: "Add", .it: "Aggiungi", .de: "Hinzufügen", .fr: "Ajouter"],
    "box.driverPlaceholder": [.es: "Nombre", .en: "Name", .it: "Nome", .de: "Name", .fr: "Nom"],
    "box.driverNoName":     [.es: "Sin nombre", .en: "No name", .it: "Senza nome", .de: "Ohne Namen", .fr: "Sans nom"],
    "box.pilotCount":       [.es: "{count} piloto", .en: "{count} driver", .it: "{count} pilota", .de: "{count} Fahrer", .fr: "{count} pilote"],
    "box.pilotCountPlural": [.es: "{count} pilotos", .en: "{count} drivers", .it: "{count} piloti", .de: "{count} Fahrer", .fr: "{count} pilotes"],
    "box.addPilot":         [.es: "Piloto", .en: "Driver", .it: "Pilota", .de: "Fahrer", .fr: "Pilote"],

    // MARK: GPS / RaceBox
    "gps.title":          [.es: "GPS / RaceBox", .en: "GPS / RaceBox", .it: "GPS / RaceBox", .de: "GPS / RaceBox", .fr: "GPS / RaceBox"],
    "gps.source":         [.es: "Fuente GPS", .en: "GPS Source", .it: "Sorgente GPS", .de: "GPS-Quelle", .fr: "Source GPS"],
    "gps.raceboxBle":     [.es: "RaceBox BLE", .en: "RaceBox BLE", .it: "RaceBox BLE", .de: "RaceBox BLE", .fr: "RaceBox BLE"],
    "gps.raceboxName":    [.es: "RaceBox", .en: "RaceBox", .it: "RaceBox", .de: "RaceBox", .fr: "RaceBox"],
    "gps.disconnect":     [.es: "Desconectar", .en: "Disconnect", .it: "Disconnetti", .de: "Trennen", .fr: "Déconnecter"],
    "gps.noDevices":      [.es: "No se encontraron dispositivos", .en: "No devices found", .it: "Nessun dispositivo trovato", .de: "Keine Geräte gefunden", .fr: "Aucun appareil trouvé"],
    "gps.noDevicesHint":  [.es: "Asegurate de que tu RaceBox esta encendido y cerca", .en: "Make sure your RaceBox is on and nearby", .it: "Assicurati che il tuo RaceBox sia acceso e vicino", .de: "Stelle sicher, dass dein RaceBox eingeschaltet und in der Nähe ist", .fr: "Assure-toi que ton RaceBox est allumé et proche"],
    "gps.searchDevices":  [.es: "Buscar dispositivos", .en: "Search devices", .it: "Cerca dispositivi", .de: "Geräte suchen", .fr: "Chercher des appareils"],
    "gps.displaySection": [.es: "Pantalla", .en: "Display", .it: "Schermo", .de: "Anzeige", .fr: "Écran"],
    "gps.deltaFrequency": [.es: "Frecuencia delta", .en: "Delta frequency", .it: "Frequenza delta", .de: "Delta-Frequenz", .fr: "Fréquence delta"],
    "gps.deltaHint":      [.es: "Cuantas veces por segundo se actualiza el delta en pantalla. Mas Hz = mas reactivo, pero el ultimo decimal puede bailar mas. 2 Hz es el equilibrio recomendado.", .en: "How many times per second the delta updates on screen. More Hz = more reactive but the last decimal jitters more. 2 Hz is the recommended balance.", .it: "Quante volte al secondo si aggiorna il delta sullo schermo. Più Hz = più reattivo ma l'ultimo decimale balla di più. 2 Hz è l'equilibrio consigliato.", .de: "Wie oft pro Sekunde der Delta-Wert aktualisiert wird. Mehr Hz = reaktiver, aber die letzte Stelle flackert mehr. 2 Hz ist die empfohlene Balance.", .fr: "Combien de fois par seconde le delta se met à jour. Plus de Hz = plus réactif, mais la dernière décimale bouge plus. 2 Hz est l'équilibre recommandé."],
    "gps.status":         [.es: "Estado", .en: "Status", .it: "Stato", .de: "Status", .fr: "État"],
    "gps.connected":      [.es: "Conectado", .en: "Connected", .it: "Connesso", .de: "Verbunden", .fr: "Connecté"],
    "gps.signal":         [.es: "Senal", .en: "Signal", .it: "Segnale", .de: "Signal", .fr: "Signal"],
    "gps.satellites":     [.es: "Satelites", .en: "Satellites", .it: "Satelliti", .de: "Satelliten", .fr: "Satellites"],
    "gps.frequency":      [.es: "Frecuencia", .en: "Frequency", .it: "Frequenza", .de: "Frequenz", .fr: "Fréquence"],
    "gps.battery":        [.es: "Bateria RaceBox", .en: "RaceBox Battery", .it: "Batteria RaceBox", .de: "RaceBox-Akku", .fr: "Batterie RaceBox"],
    "gps.imuTitle":       [.es: "Calibracion IMU", .en: "IMU Calibration", .it: "Calibrazione IMU", .de: "IMU-Kalibrierung", .fr: "Calibration IMU"],
    "gps.phase":          [.es: "Fase", .en: "Phase", .it: "Fase", .de: "Phase", .fr: "Phase"],
    "gps.phaseIdle":      [.es: "Sin calibrar", .en: "Not calibrated", .it: "Non calibrato", .de: "Nicht kalibriert", .fr: "Non calibré"],
    "gps.phaseSampling":  [.es: "Capturando gravedad...", .en: "Capturing gravity...", .it: "Acquisizione gravità...", .de: "Schwerkraft erfassen...", .fr: "Capture de la gravité..."],
    "gps.phaseReady":     [.es: "Gravedad OK — alineando", .en: "Gravity OK — aligning", .it: "Gravità OK — allineamento", .de: "Schwerkraft OK — Ausrichtung", .fr: "Gravité OK — alignement"],
    "gps.phaseAligned":   [.es: "Calibrado", .en: "Calibrated", .it: "Calibrato", .de: "Kalibriert", .fr: "Calibré"],
    "gps.samples":        [.es: "Muestras: {pct}%", .en: "Samples: {pct}%", .it: "Campioni: {pct}%", .de: "Proben: {pct}%", .fr: "Échantillons : {pct} %"],
    "gps.driveHint":      [.es: "Conduce a mas de 15 km/h para alinear los ejes del dispositivo", .en: "Drive over 15 km/h to align the device axes", .it: "Guida sopra i 15 km/h per allineare gli assi del dispositivo", .de: "Über 15 km/h fahren, um die Geräteachsen auszurichten", .fr: "Roule au-dessus de 15 km/h pour aligner les axes de l'appareil"],
    "gps.calibrationComplete": [.es: "Calibracion completa", .en: "Calibration complete", .it: "Calibrazione completata", .de: "Kalibrierung abgeschlossen", .fr: "Calibration terminée"],
    "gps.startCalibration": [.es: "Iniciar calibracion", .en: "Start calibration", .it: "Avvia calibrazione", .de: "Kalibrierung starten", .fr: "Démarrer la calibration"],
    "gps.connectFirst":   [.es: "Conecta un RaceBox para calibrar", .en: "Connect a RaceBox to calibrate", .it: "Connetti un RaceBox per calibrare", .de: "Schließe einen RaceBox an, um zu kalibrieren", .fr: "Connecte un RaceBox pour calibrer"],
    "gps.holdStill":      [.es: "Manten el kart quieto...", .en: "Hold the kart still...", .it: "Tieni il kart fermo...", .de: "Halte den Kart still...", .fr: "Garde le kart immobile..."],
    "gps.skipAlign":      [.es: "Omitir alineacion", .en: "Skip alignment", .it: "Salta allineamento", .de: "Ausrichtung überspringen", .fr: "Sauter l'alignement"],
    "gps.recalibrate":    [.es: "Recalibrar", .en: "Recalibrate", .it: "Ricalibra", .de: "Neu kalibrieren", .fr: "Recalibrer"],
    "gps.resetCalibration": [.es: "Resetear calibracion", .en: "Reset calibration", .it: "Reimposta calibrazione", .de: "Kalibrierung zurücksetzen", .fr: "Réinitialiser la calibration"],

    // MARK: Presets
    "preset.title":         [.es: "Plantillas", .en: "Templates", .it: "Modelli", .de: "Vorlagen", .fr: "Plantillas"],
    "preset.header":        [.es: "PLANTILLAS ({count}/{max})", .en: "TEMPLATES ({count}/{max})", .it: "MODELLI ({count}/{max})", .de: "VORLAGEN ({count}/{max})", .fr: "PLANTILLAS ({count}/{max})"],
    "preset.empty":         [.es: "No tienes plantillas guardadas. Usa el botón de abajo para guardar la configuración actual.", .en: "You have no saved templates. Use the button below to save the current setup.", .it: "Nessun modello salvato. Usa il pulsante in basso per salvare la configurazione attuale.", .de: "Du hast keine gespeicherten Vorlagen. Verwende die Schaltfläche unten, um die aktuelle Konfiguration zu speichern.", .fr: "Aucun modèle enregistré. Utilise le bouton ci-dessous pour enregistrer la configuration actuelle."],
    "preset.createNew":     [.es: "Crear nueva plantilla", .en: "Create new template", .it: "Crea nuovo modello", .de: "Neue Vorlage erstellen", .fr: "Créer un nouveau modèle"],
    "preset.deleteTitle":   [.es: "Eliminar plantilla", .en: "Delete template", .it: "Elimina modello", .de: "Vorlage löschen", .fr: "Supprimer le modèle"],
    "preset.deleteConfirm": [.es: "¿Quitar '{name}'? Esta acción no se puede deshacer.", .en: "Remove '{name}'? This cannot be undone.", .it: "Rimuovere '{name}'? Questa azione non può essere annullata.", .de: "'{name}' entfernen? Diese Aktion kann nicht rückgängig gemacht werden.", .fr: "Supprimer « {name} » ? Cette action est irréversible."],
    "preset.cards":         [.es: "{count} tarjetas", .en: "{count} cards", .it: "{count} schede", .de: "{count} Karten", .fr: "{count} cartes"],
    "preset.starOn":        [.es: "Quitar predefinida", .en: "Unstar default", .it: "Rimuovi predefinito", .de: "Standard entfernen", .fr: "Retirer comme défaut"],
    "preset.starOff":       [.es: "Marcar predefinida", .en: "Set as default", .it: "Imposta come predefinito", .de: "Als Standard markieren", .fr: "Définir par défaut"],

    // MARK: Wizard
    "wizard.titleNew":      [.es: "Nueva plantilla", .en: "New template", .it: "Nuovo modello", .de: "Neue Vorlage", .fr: "Nouveau modèle"],
    "wizard.titleEdit":     [.es: "Editar plantilla", .en: "Edit template", .it: "Modifica modello", .de: "Vorlage bearbeiten", .fr: "Modifier le modèle"],
    "wizard.stepName":      [.es: "Nombre", .en: "Name", .it: "Nome", .de: "Name", .fr: "Nom"],
    "wizard.stepVisibility": [.es: "Tarjetas visibles", .en: "Visible cards", .it: "Schede visibili", .de: "Sichtbare Karten", .fr: "Cartes visibles"],
    "wizard.stepOrder":     [.es: "Orden de tarjetas", .en: "Card order", .it: "Ordine schede", .de: "Kartenreihenfolge", .fr: "Ordre des cartes"],
    "wizard.stepOptions":   [.es: "Opciones de pantalla", .en: "Display options", .it: "Opzioni schermo", .de: "Anzeigeoptionen", .fr: "Options d'affichage"],
    "wizard.namePrompt":    [.es: "Elige un nombre para tu plantilla", .en: "Choose a name for your template", .it: "Scegli un nome per il tuo modello", .de: "Wähle einen Namen für deine Vorlage", .fr: "Choisis un nom pour ton modèle"],
    "wizard.nameLabel":     [.es: "Nombre de la plantilla", .en: "Template name", .it: "Nome del modello", .de: "Vorlagenname", .fr: "Nom du modèle"],
    "wizard.contrast":      [.es: "CONTRASTE", .en: "CONTRAST", .it: "CONTRASTO", .de: "KONTRAST", .fr: "CONTRASTE"],
    "wizard.orientation":   [.es: "ORIENTACION", .en: "ORIENTATION", .it: "ORIENTAMENTO", .de: "AUSRICHTUNG", .fr: "ORIENTATION"],
    "wizard.audio":         [.es: "AUDIO", .en: "AUDIO", .it: "AUDIO", .de: "AUDIO", .fr: "AUDIO"],
    "wizard.saveTemplate":  [.es: "GUARDAR PLANTILLA", .en: "SAVE TEMPLATE", .it: "SALVA MODELLO", .de: "VORLAGE SPEICHERN", .fr: "ENREGISTRER LE MODÈLE"],
    "wizard.updateTemplate": [.es: "ACTUALIZAR PLANTILLA", .en: "UPDATE TEMPLATE", .it: "AGGIORNA MODELLO", .de: "VORLAGE AKTUALISIEREN", .fr: "METTRE À JOUR LE MODÈLE"],

    // MARK: Card order preview
    "cardOrder.title":      [.es: "Orden y vista previa", .en: "Order & preview", .it: "Ordine e anteprima", .de: "Reihenfolge & Vorschau", .fr: "Ordre et aperçu"],

    // MARK: Driver screen / overlays
    "driver.noPresetTitle": [.es: "Necesitas una plantilla", .en: "You need a template", .it: "Ti serve un modello", .de: "Du benötigst eine Vorlage", .fr: "Il te faut un modèle"],
    "driver.noPresetBody":  [.es: "Crea al menos una plantilla en Configuración → Plantillas para usar la vista del piloto.", .en: "Create at least one template in Settings → Templates to use the driver view.", .it: "Crea almeno un modello in Impostazioni → Modelli per usare la vista pilota.", .de: "Erstelle mindestens eine Vorlage in Einstellungen → Vorlagen, um die Fahreransicht zu nutzen.", .fr: "Crée au moins un modèle dans Configuration → Plantillas pour utiliser la vue pilote."],
    "driver.back":          [.es: "Volver", .en: "Back", .it: "Indietro", .de: "Zurück", .fr: "Retour"],
    "driver.reconnecting":  [.es: "Reconectando...", .en: "Reconnecting...", .it: "Riconnessione...", .de: "Verbinden...", .fr: "Reconnexion..."],
    "driver.pitInProgress": [.es: "PIT EN CURSO", .en: "PIT IN PROGRESS", .it: "PIT IN CORSO", .de: "BOXENSTOPP LÄUFT", .fr: "ARRÊT EN COURS"],
    "driver.audioOn":       [.es: "Audio activado", .en: "Audio on", .it: "Audio attivato", .de: "Audio ein", .fr: "Audio activé"],
    "driver.menuTitle":     [.es: "Menu", .en: "Menu", .it: "Menu", .de: "Menü", .fr: "Menu"],
    "driver.menuTemplate":  [.es: "PLANTILLA", .en: "TEMPLATE", .it: "MODELLO", .de: "VORLAGE", .fr: "MODÈLE"],
    "driver.menuNone":      [.es: "Ninguna", .en: "None", .it: "Nessuno", .de: "Keine", .fr: "Aucun"],
    "driver.menuTemplateActive": [.es: "Plantilla activa", .en: "Active template", .it: "Modello attivo", .de: "Aktive Vorlage", .fr: "Modèle actif"],
    "driver.menuContrast":  [.es: "CONTRASTE", .en: "CONTRAST", .it: "CONTRASTO", .de: "KONTRAST", .fr: "CONTRASTE"],
    "driver.menuNormal":    [.es: "Normal", .en: "Normal", .it: "Normale", .de: "Normal", .fr: "Normal"],
    "driver.menuOrientation": [.es: "ORIENTACION", .en: "ORIENTATION", .it: "ORIENTAMENTO", .de: "AUSRICHTUNG", .fr: "ORIENTATION"],
    "driver.menuAudio":     [.es: "AUDIO", .en: "AUDIO", .it: "AUDIO", .de: "AUDIO", .fr: "AUDIO"],
    "driver.narrationOn":   [.es: "Narración activada", .en: "Narration on", .it: "Narrazione attivata", .de: "Narration ein", .fr: "Narration activée"],
    "driver.narrationOff":  [.es: "Narración desactivada", .en: "Narration off", .it: "Narrazione disattivata", .de: "Narration aus", .fr: "Narration désactivée"],
    "driver.menuExit":      [.es: "Salir", .en: "Exit", .it: "Esci", .de: "Beenden", .fr: "Quitter"],
    "driver.cardLast":      [.es: "Ultimo", .en: "Last", .it: "Ultimo", .de: "Letzter", .fr: "Dernier"],
    "driver.cardLeader":    [.es: "LIDER", .en: "LEADER", .it: "LEADER", .de: "FÜHREND", .fr: "EN TÊTE"],
    "driver.cardReal":      [.es: "Real: {time}", .en: "Real: {time}", .it: "Reale: {time}", .de: "Real: {time}", .fr: "Réel : {time}"],
    "driver.cardFaltan":    [.es: "Faltan {count}", .en: "Missing {count}", .it: "Mancano {count}", .de: "Fehlen {count}", .fr: "Reste {count}"],
    "driver.cardInactive":  [.es: "inactivo", .en: "inactive", .it: "inattivo", .de: "inaktiv", .fr: "inactif"],
    "driver.cardLat":       [.es: "Lat: {value}", .en: "Lat: {value}", .it: "Lat: {value}", .de: "Lat: {value}", .fr: "Lat : {value}"],
    "driver.cardBrake":     [.es: "Fren: {value}", .en: "Brake: {value}", .it: "Frenata: {value}", .de: "Brems: {value}", .fr: "Frein : {value}"],

    // MARK: Box call overlay
    "boxCall.tapToClose":   [.es: "Toca para cerrar", .en: "Tap to close", .it: "Tocca per chiudere", .de: "Tippen zum Schließen", .fr: "Touche pour fermer"],

    // MARK: Login extras
    "login.openingGoogle":  [.es: "Abriendo Google...", .en: "Opening Google...", .it: "Apertura Google...", .de: "Google öffnen...", .fr: "Ouverture de Google..."],
    "login.continueGoogle": [.es: "Continuar con Google", .en: "Continue with Google", .it: "Continua con Google", .de: "Mit Google fortfahren", .fr: "Continuer avec Google"],
    "login.or":             [.es: "o", .en: "or", .it: "o", .de: "oder", .fr: "ou"],

    // MARK: Update prompt
    "update.title":         [.es: "Actualización requerida", .en: "Update required", .it: "Aggiornamento richiesto", .de: "Aktualisierung erforderlich", .fr: "Mise à jour requise"],
    "update.body":          [.es: "Actualiza la app para continuar.", .en: "Update the app to continue.", .it: "Aggiorna l'app per continuare.", .de: "Aktualisiere die App, um fortzufahren.", .fr: "Mets à jour l'app pour continuer."],
    "update.installed":     [.es: "Versión instalada", .en: "Installed version", .it: "Versione installata", .de: "Installierte Version", .fr: "Version installée"],
    "update.minRequired":   [.es: "Versión mínima requerida", .en: "Minimum required version", .it: "Versione minima richiesta", .de: "Mindestversion", .fr: "Version minimale requise"],
    "update.latest":        [.es: "Última versión disponible", .en: "Latest available version", .it: "Ultima versione disponibile", .de: "Neueste verfügbare Version", .fr: "Dernière version disponible"],
    "update.openStore":     [.es: "Abrir Play Store", .en: "Open Play Store", .it: "Apri Play Store", .de: "Play Store öffnen", .fr: "Ouvrir le Play Store"],

    // MARK: Driver-card labels
    // Shared key set with web (lib/i18n.ts) and Android
    // (Translations.kt). Resolved via `DriverCard.displayName` → t().
    "card.raceTimer":        [.es: "Tiempo de carrera", .en: "Race time", .it: "Tempo di gara", .de: "Rennzeit", .fr: "Temps de course"],
    "card.lastLap":          [.es: "Última vuelta", .en: "Last lap", .it: "Ultimo giro", .de: "Letzte Runde", .fr: "Dernier tour"],
    "card.bestStintLap":     [.es: "Mejor vuelta stint", .en: "Best stint lap", .it: "Miglior giro stint", .de: "Beste Stint-Runde", .fr: "Meilleur tour relais"],
    "card.apexPosition":     [.es: "Posición Apex", .en: "Apex position", .it: "Posizione Apex", .de: "Apex-Position", .fr: "Position Apex"],
    "card.intervalAhead":    [.es: "Intervalo kart delante", .en: "Gap to kart ahead", .it: "Distacco kart davanti", .de: "Abstand Kart vorne", .fr: "Écart kart devant"],
    "card.intervalBehind":   [.es: "Intervalo kart detrás", .en: "Gap to kart behind", .it: "Distacco kart dietro", .de: "Abstand Kart hinten", .fr: "Écart kart derrière"],
    "card.currentLapTime":   [.es: "Vuelta actual (tiempo real)", .en: "Current lap (real time)", .it: "Giro attuale (tempo reale)", .de: "Aktuelle Runde (Echtzeit)", .fr: "Tour actuel (temps réel)"],
    "card.avgLap20":         [.es: "Vuelta media (20v)", .en: "Avg lap (last 20)", .it: "Giro medio (20 giri)", .de: "Ø Runde (letzte 20)", .fr: "Tour moyen (20 derniers)"],
    "card.best3":            [.es: "Media Mejor 3 v", .en: "Avg of best 3 laps", .it: "Media dei 3 migliori giri", .de: "Ø der 3 besten Runden", .fr: "Moy. des 3 meilleurs tours"],
    "card.position":         [.es: "Posición (tiempos medios)", .en: "Position (avg times)", .it: "Posizione (tempi medi)", .de: "Position (Ø-Zeiten)", .fr: "Position (temps moyens)"],
    "card.realPos":          [.es: "Posición (clasif. real)", .en: "Position (real classification)", .it: "Posizione (classifica reale)", .de: "Position (echte Klassifizierung)", .fr: "Position (classement réel)"],
    "card.gapAhead":         [.es: "Gap Real Kart delante", .en: "Real gap kart ahead", .it: "Gap reale kart davanti", .de: "Echter Abstand Kart vorne", .fr: "Écart réel kart devant"],
    "card.gapBehind":        [.es: "Gap Real Kart detrás", .en: "Real gap kart behind", .it: "Gap reale kart dietro", .de: "Echter Abstand Kart hinten", .fr: "Écart réel kart derrière"],
    "card.avgFutureStint":   [.es: "Media stint futuro", .en: "Future stint average", .it: "Media stint futuro", .de: "Ø zukünftiger Stint", .fr: "Moy. relais futur"],
    "card.lapsToMaxStint":   [.es: "Vueltas hasta stint máximo", .en: "Laps to max stint", .it: "Giri al stint massimo", .de: "Runden bis Max-Stint", .fr: "Tours jusqu'au relais max"],
    "card.theoreticalBestLap": [.es: "Mejor vuelta teórica sectores", .en: "Theoretical best lap (sectors)", .it: "Miglior giro teorico (settori)", .de: "Theoretisch beste Runde (Sektoren)", .fr: "Meilleur tour théorique (secteurs)"],
    "card.deltaBestS1":      [.es: "Δ Mejor S1", .en: "Δ Best S1", .it: "Δ Migliore S1", .de: "Δ Beste S1", .fr: "Δ Meilleur S1"],
    "card.deltaBestS2":      [.es: "Δ Mejor S2", .en: "Δ Best S2", .it: "Δ Migliore S2", .de: "Δ Beste S2", .fr: "Δ Meilleur S2"],
    "card.deltaBestS3":      [.es: "Δ Mejor S3", .en: "Δ Best S3", .it: "Δ Migliore S3", .de: "Δ Beste S3", .fr: "Δ Meilleur S3"],
    "card.deltaSectors":     [.es: "Δ Sectores", .en: "Δ Sectors", .it: "Δ Settori", .de: "Δ Sektoren", .fr: "Δ Secteurs"],
    "card.deltaCurrentS1":   [.es: "Δ Actual S1", .en: "Δ Current S1", .it: "Δ Attuale S1", .de: "Δ Aktuell S1", .fr: "Δ Actuel S1"],
    "card.deltaCurrentS2":   [.es: "Δ Actual S2", .en: "Δ Current S2", .it: "Δ Attuale S2", .de: "Δ Aktuell S2", .fr: "Δ Actuel S2"],
    "card.deltaCurrentS3":   [.es: "Δ Actual S3", .en: "Δ Current S3", .it: "Δ Attuale S3", .de: "Δ Aktuell S3", .fr: "Δ Actuel S3"],
    "card.deltaSectorsCurrent": [.es: "Δ Sectores Actual", .en: "Δ Current Sectors", .it: "Δ Settori Attuale", .de: "Δ Aktuelle Sektoren", .fr: "Δ Secteurs Actuels"],
    "card.currentPit":       [.es: "Pit en curso", .en: "Current pit", .it: "Pit in corso", .de: "Laufender Pit", .fr: "Pit en cours"],
    "card.pitCount":         [.es: "PITS (realizados / mínimos)", .en: "PITS (done / min)", .it: "PITS (effettuati / minimi)", .de: "PITS (gemacht / min)", .fr: "PITS (effectués / mini)"],
    "card.boxScore":         [.es: "Puntuación Box", .en: "Box score", .it: "Punteggio Box", .de: "Box-Score", .fr: "Score Box"],
    "card.pitWindow":        [.es: "Ventana de pit (open/closed)", .en: "Pit window (open/closed)", .it: "Finestra pit (aperta/chiusa)", .de: "Pit-Fenster (offen/zu)", .fr: "Fenêtre pit (ouverte/fermée)"],
    "card.deltaBestLap":     [.es: "Delta vs Best Lap (GPS)", .en: "Delta vs Best Lap (GPS)", .it: "Delta vs Miglior Giro (GPS)", .de: "Delta zu Bester Runde (GPS)", .fr: "Delta vs meilleur tour (GPS)"],
    "card.gpsLapDelta":      [.es: "Delta vuelta anterior GPS", .en: "Delta to previous lap (GPS)", .it: "Delta giro precedente (GPS)", .de: "Delta zur vorigen Runde (GPS)", .fr: "Delta tour précédent (GPS)"],
    "card.gForceRadar":      [.es: "G-Force (diana)", .en: "G-Force (target)", .it: "G-Force (bersaglio)", .de: "G-Force (Zielscheibe)", .fr: "G-Force (cible)"],
    "card.gpsGForce":        [.es: "G-Force (números)", .en: "G-Force (numbers)", .it: "G-Force (numeri)", .de: "G-Force (Zahlen)", .fr: "G-Force (chiffres)"],
    "card.gpsSpeed":         [.es: "Velocidad GPS", .en: "GPS speed", .it: "Velocità GPS", .de: "GPS-Geschwindigkeit", .fr: "Vitesse GPS"],
]
