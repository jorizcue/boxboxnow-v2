package com.boxboxnow.app.net

import com.boxboxnow.app.models.AuthResponse
import com.boxboxnow.app.models.Circuit
import com.boxboxnow.app.models.DriverConfigPreset
import com.boxboxnow.app.models.DriverPreferences
import com.boxboxnow.app.models.LiveTeamsResponse
import com.boxboxnow.app.models.RaceSession
import com.boxboxnow.app.models.Team
import com.boxboxnow.app.models.User
import com.boxboxnow.app.store.SecureTokenStore
import com.boxboxnow.app.util.Constants
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.HttpResponseValidator
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.content.TextContent
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

class ApiException(val status: Int, message: String) : RuntimeException(message) {
    companion object {
        val Unauthorized = ApiException(401, "Sesion expirada")
        val RequestFailed = ApiException(0, "Error de conexion")
    }
}

/** Build a JsonElement from a loosely-typed value (Kotlin primitives, lists, maps). */
internal fun Any?.toJsonElement(): JsonElement = when (this) {
    null -> JsonNull
    is JsonElement -> this
    is String -> JsonPrimitive(this)
    is Boolean -> JsonPrimitive(this)
    is Number -> JsonPrimitive(this)
    is Map<*, *> -> JsonObject(this.entries.associate { (k, v) -> k.toString() to v.toJsonElement() })
    is Iterable<*> -> JsonArray(this.map { it.toJsonElement() })
    is Array<*> -> JsonArray(this.map { it.toJsonElement() })
    else -> JsonPrimitive(this.toString())
}

@Singleton
class ApiClient @Inject constructor(
    private val tokenStore: SecureTokenStore,
) {
    val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true
    }

    private val client = HttpClient(CIO) {
        install(ContentNegotiation) { json(this@ApiClient.json) }
        defaultRequest { contentType(ContentType.Application.Json) }
        HttpResponseValidator {
            validateResponse { resp ->
                if (resp.status == HttpStatusCode.Unauthorized) {
                    tokenStore.deleteToken()
                    throw ApiException.Unauthorized
                }
                if (resp.status.value !in 200..299) {
                    throw ApiException(resp.status.value, "HTTP ${resp.status.value}")
                }
            }
        }
    }

    // ── Auth ──

    // `?device=mobile` on each auth endpoint tells the backend to count
    // this session under the mobile concurrency bucket
    // (ProductTabConfig.concurrency_mobile) instead of the combined
    // legacy max_devices limit — matches the Shared iOS driver client.

    suspend fun login(email: String, password: String): AuthResponse =
        postJson("/auth/login?device=mobile", buildJsonObject {
            put("username", email)
            put("password", password)
        })

    suspend fun loginGoogle(idToken: String): AuthResponse =
        postJson("/auth/google/mobile?device=mobile", buildJsonObject { put("id_token", idToken) })

    suspend fun verifyMfa(tempToken: String, code: String): AuthResponse =
        postJson("/auth/verify-mfa?device=mobile", buildJsonObject {
            put("temp_token", tempToken)
            put("code", code)
        })

    suspend fun getMe(): User = getJson("/auth/me")

    /**
     * Tells the server to delete the current DeviceSession. Fire-and-forget
     * from the caller's point of view — failure shouldn't block local
     * sign-out. Mirrors the iOS APIClient.serverLogout helper.
     */
    suspend fun serverLogout() {
        postJson<JsonObject>("/auth/logout", buildJsonObject {})
    }

    // ── Presets ──

    suspend fun fetchPresets(): List<DriverConfigPreset> = getJson("/config/presets")

    suspend fun createPreset(
        name: String,
        visibleCards: Map<String, Boolean>,
        cardOrder: List<String>,
        isDefault: Boolean = false,
        contrast: Double? = null,
        orientation: String? = null,
        audioEnabled: Boolean? = null,
    ): DriverConfigPreset {
        val body = buildJsonObject {
            put("name", name)
            put("visible_cards", visibleCards.toJsonElement())
            put("card_order", cardOrder.toJsonElement())
            if (isDefault) put("is_default", true)
            contrast?.let { put("contrast", it) }
            orientation?.let { put("orientation", it) }
            audioEnabled?.let { put("audio_enabled", it) }
        }
        return postJson("/config/presets", body)
    }

    suspend fun updatePreset(
        id: Int,
        name: String? = null,
        visibleCards: Map<String, Boolean>? = null,
        cardOrder: List<String>? = null,
        isDefault: Boolean? = null,
        contrast: Double? = null,
        orientation: String? = null,
        audioEnabled: Boolean? = null,
    ): DriverConfigPreset {
        val body = buildJsonObject {
            name?.let { put("name", it) }
            visibleCards?.let { put("visible_cards", it.toJsonElement()) }
            cardOrder?.let { put("card_order", it.toJsonElement()) }
            isDefault?.let { put("is_default", it) }
            contrast?.let { put("contrast", it) }
            orientation?.let { put("orientation", it) }
            audioEnabled?.let { put("audio_enabled", it) }
        }
        return patchJson("/config/presets/$id", body)
    }

    suspend fun deletePreset(id: Int) {
        client.delete(url("/config/presets/$id")) { authorized() }
    }

    // ── Session ──

    suspend fun getActiveSession(): RaceSession? {
        val resp = client.get(url("/config/session")) { authorized() }
        val text = resp.bodyAsText().trim()
        if (text.isEmpty() || text == "null") return null
        return json.decodeFromString(RaceSession.serializer(), text)
    }

    suspend fun updateSession(session: RaceSession): RaceSession {
        val resp = client.patch(url("/config/session")) {
            authorized()
            setBody(session)
        }
        return json.decodeFromString(RaceSession.serializer(), resp.bodyAsText())
    }

    /** Patch a single field on the active session (e.g. auto_load_teams). */
    suspend fun patchSessionField(field: String, value: Boolean) {
        client.patch(url("/config/session")) {
            authorized()
            setBody(buildJsonObject { put(field, value) })
        }
    }

    suspend fun createSession(session: RaceSession): RaceSession {
        val circuitId = session.circuitId ?: throw ApiException.RequestFailed
        val body = buildJsonObject {
            put("circuit_id", circuitId)
            put("name", session.name ?: "")
            put("duration_min", session.durationMin)
            put("min_stint_min", session.minStintMin)
            put("max_stint_min", session.maxStintMin)
            put("min_pits", session.minPits)
            put("pit_time_s", session.pitTimeS)
            put("min_driver_time_min", session.minDriverTimeMin)
            put("rain", session.rain)
            put("pit_closed_start_min", session.pitClosedStartMin)
            put("pit_closed_end_min", session.pitClosedEndMin)
            put("box_lines", session.boxLines)
            put("box_karts", session.boxKarts)
            put("our_kart_number", session.ourKartNumber)
            put("refresh_interval_s", session.refreshIntervalS)
        }
        return postJson("/config/session", body)
    }

    // ── Teams / Circuits ──

    suspend fun getTeams(): List<Team> = getJson("/config/teams")

    suspend fun replaceTeams(teams: List<Team>) {
        client.post(url("/config/teams")) {
            authorized()
            setBody(teams)
        }
    }

    suspend fun getLiveTeams(): LiveTeamsResponse = getJson("/race/live-teams")

    suspend fun getMyCircuits(): List<Circuit> = getJson("/config/circuits")

    // ── GPS Telemetry ──

    suspend fun saveGpsLaps(laps: List<Map<String, Any?>>) {
        val body = buildJsonObject { put("laps", laps.toJsonElement()) }
        client.post(url("/gps/laps")) {
            authorized()
            setBody(jsonBody(body))
        }
    }

    // ── Preferences ──

    suspend fun getPreferences(): DriverPreferences = getJson("/config/preferences")

    suspend fun updatePreferences(
        visibleCards: Map<String, Boolean>,
        cardOrder: List<String>,
    ): DriverPreferences = patchJson("/config/preferences", buildJsonObject {
        put("visible_cards", visibleCards.toJsonElement())
        put("card_order", cardOrder.toJsonElement())
    })

    // ── Private helpers ──

    private fun url(path: String) = Constants.API_BASE_URL + path

    private fun io.ktor.client.request.HttpRequestBuilder.authorized() {
        tokenStore.loadToken()?.let { header("Authorization", "Bearer $it") }
    }

    private suspend inline fun <reified T> getJson(path: String): T =
        client.get(url(path)) { authorized() }.body()

    // NOTE: we serialise JsonObject bodies ourselves with JsonObject.serializer() and send them
    // as TextContent. Passing a JsonObject to Ktor's setBody() tries reflection-based lookup
    // which fails at runtime because JsonPrimitive values are internally `JsonLiteral`
    // (a private subclass) and kotlinx.serialization 1.7.3 has no runtime serializer for it.
    private fun jsonBody(obj: JsonObject): TextContent =
        TextContent(json.encodeToString(JsonObject.serializer(), obj), ContentType.Application.Json)

    private suspend inline fun <reified T> postJson(path: String, body: JsonObject): T =
        client.post(url(path)) {
            authorized()
            setBody(jsonBody(body))
        }.body()

    private suspend inline fun <reified T> patchJson(path: String, body: JsonObject): T =
        client.patch(url(path)) {
            authorized()
            setBody(jsonBody(body))
        }.body()
}
