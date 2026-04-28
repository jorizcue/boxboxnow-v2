package com.boxboxnow.app.ui.login

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.IconButton
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import com.boxboxnow.app.ui.theme.InterFontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.boxboxnow.app.ui.theme.BoxBoxNowColors
import com.boxboxnow.app.vm.AuthViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    authVM: AuthViewModel,
    onLoggedIn: () -> Unit,
    onStartGoogleSso: () -> Unit,
) {
    val isAuth by authVM.isAuthenticated.collectAsState()
    val upgradeRequired by authVM.upgradeRequired.collectAsState()

    LaunchedEffect(isAuth) { if (isAuth) onLoggedIn() }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.linearGradient(
                    colors = listOf(BoxBoxNowColors.DarkBg1, Color.Black, BoxBoxNowColors.DarkBg2),
                ),
            ),
    ) {
        GridOverlay()

        when {
            upgradeRequired != null -> UpgradeRequiredScreen(upgradeRequired!!)
            else -> LoginForm(authVM, onStartGoogleSso)
        }
    }
}

@Composable
private fun GridOverlay() {
    Canvas(modifier = Modifier.fillMaxSize()) {
        val spacing = 40f
        val stroke = Stroke(width = 0.5f)
        var x = 0f
        while (x < size.width) {
            drawLine(
                SolidColor(Color.White.copy(alpha = 0.015f)),
                androidx.compose.ui.geometry.Offset(x, 0f),
                androidx.compose.ui.geometry.Offset(x, size.height),
                strokeWidth = stroke.width,
            )
            x += spacing
        }
        var y = 0f
        while (y < size.height) {
            drawLine(
                SolidColor(Color.White.copy(alpha = 0.015f)),
                androidx.compose.ui.geometry.Offset(0f, y),
                androidx.compose.ui.geometry.Offset(size.width, y),
                strokeWidth = stroke.width,
            )
            y += spacing
        }
    }
}

@Composable
private fun Branding(small: Boolean = false) {
    val logoSize = if (small) 42.sp else 56.sp
    val subSize = if (small) 16.sp else 20.sp
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row {
            Text("BB", fontSize = logoSize, fontWeight = FontWeight.Black, color = Color.White, fontFamily = InterFontFamily)
            Text("N", fontSize = logoSize, fontWeight = FontWeight.Black, color = BoxBoxNowColors.Accent, fontFamily = InterFontFamily)
        }
        Row {
            Text("BOXBOX", fontSize = subSize, fontWeight = FontWeight.Bold, color = Color.White)
            Text("NOW", fontSize = subSize, fontWeight = FontWeight.Bold, color = BoxBoxNowColors.Accent)
        }
        Text(
            "VISTA PILOTO",
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            color = BoxBoxNowColors.SystemGray2,
            letterSpacing = 3.sp,
        )
    }
}

@Composable
private fun LoginForm(authVM: AuthViewModel, onStartGoogleSso: () -> Unit) {
    val isLoading by authVM.isLoading.collectAsState()
    val isGoogleLoading by authVM.isGoogleLoading.collectAsState()
    val error by authVM.errorMessage.collectAsState()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(60.dp))
        Branding()
        Spacer(Modifier.height(36.dp))

        InputField(
            value = email,
            onChange = { email = it },
            placeholder = "Email",
            icon = Icons.Default.Mail,
            keyboardType = KeyboardType.Email,
        )
        Spacer(Modifier.height(14.dp))
        var passwordVisible by remember { mutableStateOf(false) }
        InputField(
            value = password,
            onChange = { password = it },
            placeholder = "Contraseña",
            icon = Icons.Default.Lock,
            keyboardType = KeyboardType.Password,
            secure = !passwordVisible,
            trailingIcon = if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
            onTrailingClick = { passwordVisible = !passwordVisible },
        )

        error?.let {
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = BoxBoxNowColors.ErrorRed, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(6.dp))
                Text(it, color = BoxBoxNowColors.ErrorRed, fontSize = 12.sp)
            }
        }

        Spacer(Modifier.height(16.dp))
        PrimaryAccentButton(
            text = "Iniciar sesión",
            loading = isLoading,
            enabled = !isLoading && email.isNotBlank() && password.isNotBlank(),
            onClick = { authVM.login(email.trim(), password) },
        )

        Spacer(Modifier.height(16.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Divider(Modifier.weight(1f), color = BoxBoxNowColors.SystemGray5)
            Text("o", color = BoxBoxNowColors.SystemGray3, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 8.dp))
            Divider(Modifier.weight(1f), color = BoxBoxNowColors.SystemGray5)
        }
        Spacer(Modifier.height(14.dp))

        SecondaryButton(
            text = if (isGoogleLoading) "Abriendo Google..." else "Continuar con Google",
            icon = Icons.Default.Language,
            enabled = !isLoading && !isGoogleLoading,
            loading = isGoogleLoading,
            onClick = { authVM.startGoogleLogin(); onStartGoogleSso() },
        )

        Spacer(Modifier.height(40.dp))
    }
}

@Composable
private fun InputField(
    value: String,
    onChange: (String) -> Unit,
    placeholder: String,
    icon: ImageVector,
    keyboardType: KeyboardType = KeyboardType.Text,
    secure: Boolean = false,
    trailingIcon: ImageVector? = null,
    onTrailingClick: (() -> Unit)? = null,
) {
    var focused by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(BoxBoxNowColors.SystemGray6)
            .then(
                if (focused) Modifier.border(1.dp, BoxBoxNowColors.AccentSoft, RoundedCornerShape(10.dp))
                else Modifier,
            )
            .padding(horizontal = 14.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = BoxBoxNowColors.SystemGray3, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(12.dp))
        BasicInput(
            value = value,
            onChange = onChange,
            placeholder = placeholder,
            keyboardType = keyboardType,
            secure = secure,
            onFocusChange = { focused = it },
            modifier = Modifier.weight(1f),
        )
        if (trailingIcon != null && onTrailingClick != null) {
            Spacer(Modifier.width(8.dp))
            IconButton(
                onClick = onTrailingClick,
                modifier = Modifier.size(28.dp),
            ) {
                Icon(
                    trailingIcon,
                    contentDescription = null,
                    tint = BoxBoxNowColors.SystemGray3,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}

@Composable
private fun BasicInput(
    value: String,
    onChange: (String) -> Unit,
    placeholder: String,
    keyboardType: KeyboardType,
    secure: Boolean,
    onFocusChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    androidx.compose.foundation.text.BasicTextField(
        value = value,
        onValueChange = onChange,
        singleLine = true,
        textStyle = TextStyle(color = Color.White, fontSize = 15.sp),
        cursorBrush = SolidColor(BoxBoxNowColors.Accent),
        visualTransformation = if (secure) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        modifier = modifier
            .height(48.dp)
            .onFocusChanged { onFocusChange(it.isFocused) },
        decorationBox = { inner ->
            Box(contentAlignment = Alignment.CenterStart) {
                if (value.isEmpty()) {
                    Text(placeholder, color = BoxBoxNowColors.SystemGray2, fontSize = 15.sp)
                }
                inner()
            }
        },
    )
}

@Composable
private fun PrimaryAccentButton(
    text: String,
    loading: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(10.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = BoxBoxNowColors.Accent,
            contentColor = Color.Black,
            disabledContainerColor = BoxBoxNowColors.Accent.copy(alpha = 0.35f),
            disabledContentColor = Color.Black.copy(alpha = 0.6f),
        ),
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(color = Color.Black, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(10.dp))
        }
        Text(text, fontWeight = FontWeight.Bold, fontSize = 16.sp)
    }
}

@Composable
private fun SecondaryButton(
    text: String,
    icon: ImageVector,
    enabled: Boolean,
    loading: Boolean,
    accent: Boolean = false,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(10.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = BoxBoxNowColors.SystemGray6,
            contentColor = Color.White,
            disabledContainerColor = BoxBoxNowColors.SystemGray6.copy(alpha = 0.5f),
            disabledContentColor = Color.White.copy(alpha = 0.5f),
        ),
        border = if (accent)
            androidx.compose.foundation.BorderStroke(0.5.dp, BoxBoxNowColors.AccentSoft)
        else
            androidx.compose.foundation.BorderStroke(0.5.dp, BoxBoxNowColors.SystemGray4),
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
        } else {
            Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
        }
        Spacer(Modifier.width(10.dp))
        Text(text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
    }
}

