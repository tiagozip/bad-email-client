package zip.estrogen.mail

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import zip.estrogen.mail.data.AuthState
import zip.estrogen.mail.nav.AppNavHost
import zip.estrogen.mail.ui.compose.ComposePrefill
import zip.estrogen.mail.ui.theme.EstrogenMailTheme
import zip.estrogen.mail.util.ComposeIntent

class MainActivity : ComponentActivity() {

    private var pendingComposeRequested by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as MailApp
        consumeComposeIntent(intent)
        setContent {
            val dynamicColor by app.repository.dynamicColor.collectAsStateWithLifecycle(initialValue = true)
            EstrogenMailTheme(dynamicColor = dynamicColor) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    Root(app, pendingComposeRequested) { pendingComposeRequested = false }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        consumeComposeIntent(intent)
    }

    private fun consumeComposeIntent(intent: Intent?) {
        val prefill = ComposeIntent.parse(intent) ?: return
        ComposePrefill.pending = prefill
        pendingComposeRequested = true
    }
}

@Composable
private fun Root(
    app: MailApp,
    composeRequested: Boolean,
    onComposeConsumed: () -> Unit
) {
    val authState by app.repository.authState.collectAsStateWithLifecycle(initialValue = AuthState.Resolving)

    when (authState) {
        AuthState.Resolving -> Box(modifier = Modifier.fillMaxSize())
        AuthState.SignedIn -> AppNavHost(
            hasCredentials = true,
            composeRequested = composeRequested,
            onComposeConsumed = onComposeConsumed
        )
        AuthState.SignedOut -> AppNavHost(
            hasCredentials = false,
            composeRequested = false,
            onComposeConsumed = onComposeConsumed
        )
    }
}
