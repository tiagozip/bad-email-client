package zip.estrogen.mail.util

import android.content.Intent
import android.net.Uri
import zip.estrogen.mail.ui.compose.ComposePrefillData

object ComposeIntent {

    fun parse(intent: Intent?): ComposePrefillData? {
        if (intent == null) return null
        return runCatching {
            when (intent.action) {
                Intent.ACTION_SENDTO, Intent.ACTION_VIEW -> fromMailto(intent.data)
                Intent.ACTION_SEND -> fromSend(intent)
                else -> null
            }
        }.getOrNull()
    }

    private fun fromMailto(uri: Uri?): ComposePrefillData? {
        if (uri == null) return null
        val raw = uri.toString()
        if (!raw.startsWith("mailto:", ignoreCase = true)) return null

        val withoutScheme = raw.substring("mailto:".length)
        val queryIndex = withoutScheme.indexOf('?')
        val pathPart = if (queryIndex >= 0) withoutScheme.substring(0, queryIndex) else withoutScheme
        val queryPart = if (queryIndex >= 0) withoutScheme.substring(queryIndex + 1) else ""

        val params = parseQuery(queryPart)
        val toFromPath = decode(pathPart)
        val to = listOf(toFromPath, params["to"].orEmpty())
            .filter { it.isNotBlank() }
            .joinToString(", ")

        return ComposePrefillData(
            to = to,
            cc = params["cc"].orEmpty(),
            subject = params["subject"].orEmpty(),
            body = params["body"].orEmpty()
        )
    }

    private fun fromSend(intent: Intent): ComposePrefillData? {
        if (intent.type?.startsWith("text/") != true) return null
        val text = intent.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
        val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT).orEmpty()
        val emails = intent.getStringArrayExtra(Intent.EXTRA_EMAIL)?.joinToString(", ").orEmpty()
        if (text.isBlank() && subject.isBlank() && emails.isBlank()) return null
        return ComposePrefillData(
            to = emails,
            subject = subject,
            body = text
        )
    }

    private fun parseQuery(query: String): Map<String, String> {
        if (query.isBlank()) return emptyMap()
        val result = mutableMapOf<String, String>()
        query.split('&').forEach { pair ->
            val eq = pair.indexOf('=')
            if (eq > 0) {
                val key = decode(pair.substring(0, eq)).lowercase()
                val value = decode(pair.substring(eq + 1))
                if (key.isNotBlank()) result[key] = value
            }
        }
        return result
    }

    private fun decode(value: String): String =
        runCatching { Uri.decode(value) }.getOrDefault(value).trim()
}
