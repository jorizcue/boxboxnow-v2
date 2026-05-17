"""Authored EN/IT/DE/FR translations for plan-card copy + the pure
resolver used by ``/api/plans``.

``PLAN_TRANSLATIONS`` is the single source of truth, transcribed VERBATIM
from ``docs/superpowers/plans/2026-05-17-plan-cards-i18n.md`` (the
"Authored translation dictionary" section). The key is the EXACT Spanish
source string as stored in ``product_tab_config`` (``display_name`` /
``description`` / each ``features`` bullet); the value is
``{"en","it","de","fr"}``. Spanish lives in the existing columns and is
the fallback for any missing locale / field / unknown string.

The startup backfill in ``app.models.database`` keys this dict by each
row's current Spanish strings to populate the ``*_i18n`` columns. The
``/api/plans`` endpoint resolves the per-request locale via
``localize_plan`` (the columns store the *resolved* JSON; this dict is
only consulted at backfill time, never at request time).
"""
from __future__ import annotations

import json
from typing import Any

# Locales we author/serve (Spanish is the source, kept in the base columns).
_LANGS = ("en", "it", "de", "fr")

# ---------------------------------------------------------------------------
# Authored dictionary — VERBATIM from the plan's translation table.
# 3 display names + 3 descriptions + 22 feature bullets = 28 keys.
# ---------------------------------------------------------------------------
PLAN_TRANSLATIONS: dict[str, dict[str, str]] = {
    # ── Display names ──────────────────────────────────────────────────
    "Endurance Básico": {
        "en": "Endurance Basic",
        "it": "Endurance Base",
        "de": "Endurance Basis",
        "fr": "Endurance Basique",
    },
    "Endurance Pro": {
        "en": "Endurance Pro",
        "it": "Endurance Pro",
        "de": "Endurance Pro",
        "fr": "Endurance Pro",
    },
    "Individual": {
        "en": "Individual",
        "it": "Individuale",
        "de": "Einzel",
        "fr": "Individuel",
    },
    # ── Descriptions ───────────────────────────────────────────────────
    (
        "Acceso a más de 15 indicadores calculados para que sepas qué "
        "ocurre en cada momento. Pensado para pilotos individuales que "
        "corren resistencias y equipos que están empezando."
    ): {
        "en": (
            "Access to 15+ calculated metrics so you always know what's "
            "happening. Built for solo endurance drivers and teams just "
            "getting started."
        ),
        "it": (
            "Accesso a oltre 15 indicatori calcolati per sapere sempre "
            "cosa succede in ogni momento. Pensato per piloti individuali "
            "che corrono gare di durata e team che muovono i primi passi."
        ),
        "de": (
            "Zugriff auf über 15 berechnete Kennzahlen, damit du jederzeit "
            "weißt, was passiert. Für einzelne Endurance-Fahrer und Teams, "
            "die gerade starten."
        ),
        "fr": (
            "Accès à plus de 15 indicateurs calculés pour savoir à tout "
            "moment ce qui se passe. Pensé pour les pilotes individuels en "
            "endurance et les équipes qui débutent."
        ),
    },
    "Equipos con experiencia este es vuestro plan. Toda la funcionalidad incluida.": {
        "en": "For experienced teams — this is your plan. All features included.",
        "it": "Per team esperti: questo è il vostro piano. Tutte le funzionalità incluse.",
        "de": "Für erfahrene Teams – das ist euer Plan. Alle Funktionen inklusive.",
        "fr": "Pour les équipes expérimentées, c'est votre plan. Toutes les fonctionnalités incluses.",
    },
    "Pensado para carreras individuales donde el estado del box no es importante": {
        "en": "Designed for solo races where the pit status doesn't matter",
        "it": "Pensato per gare individuali dove lo stato del box non è importante",
        "de": "Für Einzelrennen, bei denen der Box-Status keine Rolle spielt",
        "fr": "Conçu pour les courses individuelles où l'état du stand n'a pas d'importance",
    },
    # ── Feature bullets (22) ───────────────────────────────────────────
    "1 circuito incluido": {
        "en": "1 circuit included",
        "it": "1 circuito incluso",
        "de": "1 Strecke inklusive",
        "fr": "1 circuit inclus",
    },
    "App móvil · 2 usuarios": {
        "en": "Mobile app · 2 users",
        "it": "App mobile · 2 utenti",
        "de": "Mobile App · 2 Nutzer",
        "fr": "App mobile · 2 utilisateurs",
    },
    "Acceso web · 1 usuario": {
        "en": "Web access · 1 user",
        "it": "Accesso web · 1 utente",
        "de": "Web-Zugang · 1 Nutzer",
        "fr": "Accès web · 1 utilisateur",
    },
    "Módulo carrera + módulo box": {
        "en": "Race module + pit module",
        "it": "Modulo gara + modulo box",
        "de": "Rennmodul + Boxmodul",
        "fr": "Module course + module stand",
    },
    # es DB still says "Live Apex" — flagged data fix, out of scope;
    # translated as "LiveTiming" in all locales per the APEX→LiveTiming
    # directive.
    "Live Apex": {
        "en": "LiveTiming",
        "it": "LiveTiming",
        "de": "LiveTiming",
        "fr": "LiveTiming",
    },
    "Vista de piloto y configuración de carrera": {
        "en": "Driver view and race setup",
        "it": "Vista pilota e configurazione gara",
        "de": "Fahreransicht und Rennkonfiguration",
        "fr": "Vue pilote et configuration de course",
    },
    "3 circuitos (todos los circuitos en plan anual)": {
        "en": "3 circuits (all circuits on the annual plan)",
        "it": "3 circuiti (tutti i circuiti nel piano annuale)",
        "de": "3 Strecken (alle Strecken im Jahresplan)",
        "fr": "3 circuits (tous les circuits dans le plan annuel)",
    },
    "App móvil · 6 usuarios": {
        "en": "Mobile app · 6 users",
        "it": "App mobile · 6 utenti",
        "de": "Mobile App · 6 Nutzer",
        "fr": "App mobile · 6 utilisateurs",
    },
    "Acceso web · 2 usuarios (hasta 8 dispositivos)": {
        "en": "Web access · 2 users (up to 8 devices)",
        "it": "Accesso web · 2 utenti (fino a 8 dispositivi)",
        "de": "Web-Zugang · 2 Nutzer (bis zu 8 Geräte)",
        "fr": "Accès web · 2 utilisateurs (jusqu'à 8 appareils)",
    },
    "Todo lo de Endurance Básico": {
        "en": "Everything in Endurance Basic",
        "it": "Tutto di Endurance Base",
        "de": "Alles aus Endurance Basis",
        "fr": "Tout Endurance Basique",
    },
    "Análisis de karts": {
        "en": "Kart analysis",
        "it": "Analisi dei kart",
        "de": "Kart-Analyse",
        "fr": "Analyse des karts",
    },
    "Soporte prioritario": {
        "en": "Priority support",
        "it": "Supporto prioritario",
        "de": "Priorisierter Support",
        "fr": "Support prioritaire",
    },
    "Clasificación real (próximamente)": {
        "en": "Real classification (coming soon)",
        "it": "Classifica reale (prossimamente)",
        "de": "Echte Klassifizierung (demnächst)",
        "fr": "Classement réel (bientôt)",
    },
    "App móvil · 6 usuarios · Acceso web · 2 usuarios (hasta 8 dispositivos)": {
        "en": "Mobile app · 6 users · Web access · 2 users (up to 8 devices)",
        "it": "App mobile · 6 utenti · Accesso web · 2 utenti (fino a 8 dispositivi)",
        "de": "Mobile App · 6 Nutzer · Web-Zugang · 2 Nutzer (bis zu 8 Geräte)",
        "fr": "App mobile · 6 utilisateurs · Accès web · 2 utilisateurs (jusqu'à 8 appareils)",
    },
    "1 circuito (todos los circuitos en plan anual)": {
        "en": "1 circuit (all circuits on the annual plan)",
        "it": "1 circuito (tutti i circuiti nel piano annuale)",
        "de": "1 Strecke (alle Strecken im Jahresplan)",
        "fr": "1 circuit (tous les circuits dans le plan annuel)",
    },
    "App móvil · 1 usuario": {
        "en": "Mobile app · 1 user",
        "it": "App mobile · 1 utente",
        "de": "Mobile App · 1 Nutzer",
        "fr": "App mobile · 1 utilisateur",
    },
    "Vista de piloto en carrera": {
        "en": "In-race driver view",
        "it": "Vista pilota in gara",
        "de": "Fahreransicht im Rennen",
        "fr": "Vue pilote en course",
    },
    "Configuración de carrera": {
        "en": "Race setup",
        "it": "Configurazione gara",
        "de": "Rennkonfiguration",
        "fr": "Configuration de course",
    },
    "Conexión con RaceBox / GPS": {
        "en": "RaceBox / GPS connection",
        "it": "Connessione RaceBox / GPS",
        "de": "RaceBox-/GPS-Verbindung",
        "fr": "Connexion RaceBox / GPS",
    },
    "GPS Insights (solo plan anual)": {
        "en": "GPS Insights (annual plan only)",
        "it": "GPS Insights (solo piano annuale)",
        "de": "GPS Insights (nur Jahresplan)",
        "fr": "GPS Insights (plan annuel uniquement)",
    },
    "Acceso a todos los circuito": {
        "en": "Access to all circuits",
        "it": "Accesso a tutti i circuiti",
        "de": "Zugang zu allen Strecken",
        "fr": "Accès à tous les circuits",
    },
    "GPS Insights": {
        "en": "GPS Insights",
        "it": "GPS Insights",
        "de": "GPS Insights",
        "fr": "GPS Insights",
    },
}


def _loads(blob: Any) -> Any:
    """Tolerant JSON decode for a stored ``*_i18n`` Text column.

    Accepts a JSON string (the stored shape), an already-decoded
    dict/list (defensive), or NULL/empty → ``None``.
    """
    if blob is None or blob == "":
        return None
    if isinstance(blob, (dict, list)):
        return blob
    try:
        return json.loads(blob)
    except (ValueError, TypeError):
        return None


def localize_plan(
    *,
    display_name: str,
    description: str | None,
    features: list[str] | None,
    dn_i18n: Any,
    desc_i18n: Any,
    feat_i18n: Any,
    lang: str | None,
) -> tuple[str, str | None, list[str]]:
    """Resolve a plan's ``(display_name, description, features)`` for a locale.

    Fallback rules (spec §API, regression-safe):

    * ``lang`` is ``es`` / ``None`` / empty / unknown (any value other
      than ``en|it|de|fr``) → return the Spanish values unchanged.
    * Otherwise, per field, use the stored ``*_i18n[lang]`` value when
      present and non-empty, else fall back to the Spanish value.
    * ``features``: always a list of the SAME length/order as the es
      ``features``; each bullet uses the localized list's entry at the
      same index when present and non-empty, else the es bullet.
    * Empty / missing es description stays as-is (``""`` / ``None``).
    """
    es_features = list(features) if features else []

    if lang not in _LANGS:
        # es / None / unknown ⇒ byte-identical to the stored Spanish.
        return display_name, description, es_features

    dn_map = _loads(dn_i18n) or {}
    desc_map = _loads(desc_i18n) or {}
    feat_map = _loads(feat_i18n) or {}

    # display_name: per-field fallback to es when no translation.
    loc_dn = dn_map.get(lang) if isinstance(dn_map, dict) else None
    out_dn = loc_dn if loc_dn else display_name

    # description: per-field fallback to es; empty es stays empty.
    loc_desc = desc_map.get(lang) if isinstance(desc_map, dict) else None
    out_desc = loc_desc if loc_desc else description

    # features: localized list aligned to es length/order, per-bullet
    # fallback to the es bullet.
    loc_list = feat_map.get(lang) if isinstance(feat_map, dict) else None
    if not isinstance(loc_list, list):
        loc_list = []
    out_features: list[str] = []
    for i, es_bullet in enumerate(es_features):
        loc_bullet = loc_list[i] if i < len(loc_list) else None
        out_features.append(loc_bullet if loc_bullet else es_bullet)

    return out_dn, out_desc, out_features
