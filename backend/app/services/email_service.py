"""Email service using Resend for transactional emails."""

import logging
import resend
from app.config import get_settings

logger = logging.getLogger(__name__)


def _get_resend():
    settings = get_settings()
    resend.api_key = settings.resend_api_key
    return resend


def _from_email() -> str:
    settings = get_settings()
    return settings.from_email or "BoxBoxNow <noreply@boxboxnow.com>"


async def send_welcome_email(email: str, username: str, trial_days: int = 0):
    """Send welcome email after registration. Content adapts to trial vs direct purchase."""
    settings = get_settings()
    if not settings.resend_api_key:
        logger.warning("Resend API key not configured, skipping welcome email")
        return

    if trial_days > 0:
        body_html = f"""
                <h2 style="color: #fff; font-size: 22px; margin-bottom: 10px;">¡Bienvenido, {username}!</h2>
                <p style="color: #e5e5e5; font-size: 15px; line-height: 1.6;">
                    Tu cuenta ha sido creada correctamente. Tienes <strong style="color: #9fe556;">{trial_days} días de prueba gratuita</strong>
                    con acceso completo a todas las funcionalidades.
                </p>
                <div style="background: #111; border: 1px solid #333; border-radius: 12px; padding: 20px; margin: 24px 0;">
                    <p style="color: #9fe556; font-weight: 600; margin: 0 0 8px;">Tu prueba incluye:</p>
                    <ul style="color: #d4d4d4; font-size: 14px; padding-left: 20px; margin: 0;">
                        <li>Estrategia de carrera en tiempo real</li>
                        <li>Análisis de tiempos y telemetría</li>
                        <li>Gestión de pilotos y stints</li>
                        <li>Replay de sesiones anteriores</li>
                    </ul>
                </div>
        """
    else:
        body_html = f"""
                <h2 style="color: #fff; font-size: 22px; margin-bottom: 10px;">¡Bienvenido, {username}!</h2>
                <p style="color: #e5e5e5; font-size: 15px; line-height: 1.6;">
                    Tu cuenta en <strong style="color: #9fe556;">BoxBoxNow</strong> ha sido creada correctamente.
                    Completa tu suscripción para acceder a todas las funcionalidades de la plataforma.
                </p>
                <div style="background: #111; border: 1px solid #333; border-radius: 12px; padding: 20px; margin: 24px 0;">
                    <p style="color: #9fe556; font-weight: 600; margin: 0 0 8px;">¿Qué puedes hacer con BoxBoxNow?</p>
                    <ul style="color: #d4d4d4; font-size: 14px; padding-left: 20px; margin: 0;">
                        <li>Estrategia de carrera en tiempo real</li>
                        <li>Gestión de pit stops y cola FIFO</li>
                        <li>Clasificación ajustada por ritmo</li>
                        <li>Análisis histórico y telemetría GPS</li>
                    </ul>
                </div>
        """

    r = _get_resend()
    try:
        r.Emails.send({
            "from": _from_email(),
            "to": [email],
            "subject": "Bienvenido a BoxBoxNow",
            "html": f"""
            <div style="font-family: 'Space Grotesk', -apple-system, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #fff; padding: 40px 30px; border-radius: 16px; border: 1px solid #222;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="margin: 0; font-size: 28px;">
                        <span style="color: #fff;">BOXBOX</span><span style="color: #9fe556;">NOW</span>
                    </h1>
                </div>
                {body_html}
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{settings.frontend_url}/dashboard" style="background: #9fe556; color: #000; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
                        Ir al Dashboard
                    </a>
                </div>
                <p style="color: #888; font-size: 12px; text-align: center; margin-top: 30px;">
                    BoxBoxNow - Estrategia de Karting en Tiempo Real
                </p>
            </div>
            """,
        })
        logger.info(f"Welcome email sent to {email} (trial_days={trial_days})")
    except Exception as e:
        logger.error(f"Failed to send welcome email to {email}: {e}")


async def send_trial_ending_email(email: str, username: str, days_remaining: int):
    """Send trial ending warning email."""
    settings = get_settings()
    if not settings.resend_api_key:
        return

    r = _get_resend()
    try:
        r.Emails.send({
            "from": _from_email(),
            "to": [email],
            "subject": f"Tu prueba gratuita termina en {days_remaining} días",
            "html": f"""
            <div style="font-family: 'Space Grotesk', -apple-system, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #fff; padding: 40px 30px; border-radius: 16px; border: 1px solid #222;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="margin: 0; font-size: 28px;">
                        <span style="color: #fff;">BOXBOX</span><span style="color: #9fe556;">NOW</span>
                    </h1>
                </div>
                <h2 style="color: #fff; font-size: 22px; margin-bottom: 10px;">Hola, {username}</h2>
                <p style="color: #e5e5e5; font-size: 15px; line-height: 1.6;">
                    Tu prueba gratuita termina en <strong style="color: #9fe556;">{days_remaining} día{"s" if days_remaining != 1 else ""}</strong>.
                    Para seguir usando BoxBoxNow, elige un plan que se adapte a tus necesidades.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{settings.frontend_url}/#pricing" style="background: #9fe556; color: #000; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
                        Ver planes y precios
                    </a>
                </div>
                <p style="color: #888; font-size: 12px; text-align: center; margin-top: 30px;">
                    BoxBoxNow - Estrategia de Karting en Tiempo Real
                </p>
            </div>
            """,
        })
        logger.info(f"Trial ending email sent to {email} ({days_remaining} days remaining)")
    except Exception as e:
        logger.error(f"Failed to send trial ending email to {email}: {e}")


async def send_subscription_confirmation_email(
    email: str,
    username: str,
    plan_name: str,
    circuit_name: str | None = None,
    email_template: str | None = None,
):
    """Send subscription/event purchase confirmation with circuit details.

    If `email_template` is provided (set per-product in Admin → Plataforma),
    its HTML replaces the default body. Supports {username}, {plan_name},
    {circuit_name} placeholder substitution.
    """
    settings = get_settings()
    if not settings.resend_api_key:
        return

    is_event = "evento" in plan_name.lower()
    subject = f"Acceso Evento activado — {circuit_name}" if is_event else f"Suscripción {plan_name} activada"

    # Build the body HTML: custom template if provided, otherwise default.
    if email_template and email_template.strip():
        body_html = email_template.replace("{username}", username or "") \
                                  .replace("{plan_name}", plan_name or "") \
                                  .replace("{circuit_name}", circuit_name or "")
    else:
        circuit_html = ""
        if circuit_name:
            circuit_html = f"""
                    <div style="background: #111; border: 1px solid #333; border-radius: 12px; padding: 20px; margin: 24px 0;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="color: #b5b5b5; font-size: 13px; padding: 6px 0;">Plan</td>
                                <td style="color: #fff; font-size: 14px; font-weight: 600; text-align: right; padding: 6px 0;">{plan_name}</td>
                            </tr>
                            <tr>
                                <td style="color: #b5b5b5; font-size: 13px; padding: 6px 0;">Circuito</td>
                                <td style="color: #9fe556; font-size: 14px; font-weight: 600; text-align: right; padding: 6px 0;">{circuit_name}</td>
                            </tr>
                        </table>
                    </div>
            """
        access_text = (
            f"Tu acceso de evento a <strong style='color: #9fe556;'>{circuit_name}</strong> está activo durante las próximas 48 horas."
            if is_event
            else f"Tu plan <strong style='color: #9fe556;'>{plan_name}</strong> ha sido activado correctamente."
        )
        body_html = f"""
                <h2 style="color: #fff; font-size: 22px; margin-bottom: 10px;">¡Gracias, {username}!</h2>
                <p style="color: #e5e5e5; font-size: 15px; line-height: 1.6;">
                    {access_text}
                </p>
                {circuit_html}
        """

    r = _get_resend()
    try:
        r.Emails.send({
            "from": _from_email(),
            "to": [email],
            "subject": subject,
            "html": f"""
            <div style="font-family: 'Space Grotesk', -apple-system, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #fff; padding: 40px 30px; border-radius: 16px; border: 1px solid #222;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="margin: 0; font-size: 28px;">
                        <span style="color: #fff;">BOXBOX</span><span style="color: #9fe556;">NOW</span>
                    </h1>
                </div>
                {body_html}
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{settings.frontend_url}/dashboard" style="background: #9fe556; color: #000; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
                        Ir al Dashboard
                    </a>
                </div>
                <p style="color: #888; font-size: 12px; text-align: center; margin-top: 30px;">
                    BoxBoxNow - Estrategia de Karting en Tiempo Real
                </p>
            </div>
            """,
        })
        logger.info(f"Subscription confirmation email sent to {email} (plan={plan_name}, circuit={circuit_name})")
    except Exception as e:
        logger.error(f"Failed to send subscription confirmation to {email}: {e}")


async def send_verification_email(to_email: str, username: str, token: str):
    """Send email-verification link so the user can activate their account and start the trial."""
    settings = get_settings()
    if not settings.resend_api_key:
        logger.warning("Resend API key not configured, skipping verification email")
        return

    verify_url = f"{settings.frontend_url}/verify-email?token={token}"
    r = _get_resend()
    try:
        r.Emails.send({
            "from": _from_email(),
            "to": [to_email],
            "subject": "Verifica tu cuenta - BoxBoxNow",
            "html": f"""
            <div style="font-family: 'Space Grotesk', -apple-system, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #fff; padding: 40px 30px; border-radius: 16px; border: 1px solid #222;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="margin: 0; font-size: 28px;">
                        <span style="color: #fff;">BOXBOX</span><span style="color: #9fe556;">NOW</span>
                    </h1>
                </div>
                <h2 style="color: #fff; font-size: 22px; margin-bottom: 10px;">Verifica tu cuenta</h2>
                <p style="color: #e5e5e5; font-size: 15px; line-height: 1.6;">
                    Hola {username}, para completar tu registro y comenzar tu prueba gratuita
                    necesitas verificar tu dirección de correo electrónico.
                    Haz clic en el botón para verificar tu cuenta.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{verify_url}" style="background: #9fe556; color: #000; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
                        Verificar mi cuenta
                    </a>
                </div>
                <p style="color: #b5b5b5; font-size: 13px; line-height: 1.5;">
                    Este enlace caduca en 7 días. Si no creaste esta cuenta, puedes ignorar este correo.
                </p>
                <p style="color: #888; font-size: 12px; text-align: center; margin-top: 30px;">
                    BoxBoxNow - Estrategia de Karting en Tiempo Real
                </p>
            </div>
            """,
        })
        logger.info(f"Verification email sent to {to_email}")
    except Exception as e:
        logger.error(f"Failed to send verification email to {to_email}: {e}")


async def send_password_reset_email(email: str, username: str, reset_token: str):
    """Send password reset email with link."""
    settings = get_settings()
    if not settings.resend_api_key:
        logger.warning("Resend API key not configured, skipping password reset email")
        return

    reset_url = f"{settings.frontend_url}/reset-password?token={reset_token}"
    r = _get_resend()
    try:
        r.Emails.send({
            "from": _from_email(),
            "to": [email],
            "subject": "Restablecer contraseña - BoxBoxNow",
            "html": f"""
            <div style="font-family: 'Space Grotesk', -apple-system, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #fff; padding: 40px 30px; border-radius: 16px; border: 1px solid #222;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="margin: 0; font-size: 28px;">
                        <span style="color: #fff;">BOXBOX</span><span style="color: #9fe556;">NOW</span>
                    </h1>
                </div>
                <h2 style="color: #fff; font-size: 22px; margin-bottom: 10px;">Restablecer contraseña</h2>
                <p style="color: #e5e5e5; font-size: 15px; line-height: 1.6;">
                    Hola {username}, hemos recibido una solicitud para restablecer tu contraseña.
                    Haz clic en el botón para crear una nueva.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{reset_url}" style="background: #9fe556; color: #000; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
                        Restablecer contraseña
                    </a>
                </div>
                <p style="color: #b5b5b5; font-size: 13px; line-height: 1.5;">
                    Este enlace expira en 1 hora. Si no solicitaste este cambio, puedes ignorar este email.
                </p>
                <p style="color: #888; font-size: 12px; text-align: center; margin-top: 30px;">
                    BoxBoxNow - Estrategia de Karting en Tiempo Real
                </p>
            </div>
            """,
        })
        logger.info(f"Password reset email sent to {email}")
    except Exception as e:
        logger.error(f"Failed to send password reset email to {email}: {e}")
