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


async def send_welcome_email(email: str, username: str):
    """Send welcome email after registration."""
    settings = get_settings()
    if not settings.resend_api_key:
        logger.warning("Resend API key not configured, skipping welcome email")
        return

    r = _get_resend()
    try:
        r.Emails.send({
            "from": _from_email(),
            "to": [email],
            "subject": "Bienvenido a BoxBoxNow",
            "html": f"""
            <div style="font-family: 'Space Grotesk', -apple-system, sans-serif; max-width: 600px; margin: 0 auto; background: #000; color: #fff; padding: 40px 30px; border-radius: 16px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="margin: 0; font-size: 28px;">
                        <span style="color: #fff;">BOXBOX</span><span style="color: #9fe556;">NOW</span>
                    </h1>
                </div>
                <h2 style="color: #fff; font-size: 22px; margin-bottom: 10px;">Hola, {username}!</h2>
                <p style="color: #a3a3a3; font-size: 15px; line-height: 1.6;">
                    Tu cuenta ha sido creada correctamente. Tienes <strong style="color: #9fe556;">14 dias de prueba gratuita</strong>
                    con acceso completo a todas las funcionalidades.
                </p>
                <div style="background: #111; border: 1px solid #222; border-radius: 12px; padding: 20px; margin: 24px 0;">
                    <p style="color: #9fe556; font-weight: 600; margin: 0 0 8px;">Tu prueba incluye:</p>
                    <ul style="color: #a3a3a3; font-size: 14px; padding-left: 20px; margin: 0;">
                        <li>Estrategia de carrera en tiempo real</li>
                        <li>Analisis de tiempos y telemetria</li>
                        <li>Gestion de pilotos y stints</li>
                        <li>Replay de sesiones anteriores</li>
                    </ul>
                </div>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{settings.frontend_url}/dashboard" style="background: #9fe556; color: #000; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
                        Ir al Dashboard
                    </a>
                </div>
                <p style="color: #525252; font-size: 12px; text-align: center; margin-top: 30px;">
                    BoxBoxNow - Estrategia de Karting en Tiempo Real
                </p>
            </div>
            """,
        })
        logger.info(f"Welcome email sent to {email}")
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
            "subject": f"Tu prueba gratuita termina en {days_remaining} dias",
            "html": f"""
            <div style="font-family: 'Space Grotesk', -apple-system, sans-serif; max-width: 600px; margin: 0 auto; background: #000; color: #fff; padding: 40px 30px; border-radius: 16px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="margin: 0; font-size: 28px;">
                        <span style="color: #fff;">BOXBOX</span><span style="color: #9fe556;">NOW</span>
                    </h1>
                </div>
                <h2 style="color: #fff; font-size: 22px; margin-bottom: 10px;">Hola, {username}</h2>
                <p style="color: #a3a3a3; font-size: 15px; line-height: 1.6;">
                    Tu prueba gratuita termina en <strong style="color: #9fe556;">{days_remaining} dia{"s" if days_remaining != 1 else ""}</strong>.
                    Para seguir usando BoxBoxNow, elige un plan que se adapte a tus necesidades.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{settings.frontend_url}/#pricing" style="background: #9fe556; color: #000; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
                        Ver planes y precios
                    </a>
                </div>
                <p style="color: #525252; font-size: 12px; text-align: center; margin-top: 30px;">
                    BoxBoxNow - Estrategia de Karting en Tiempo Real
                </p>
            </div>
            """,
        })
        logger.info(f"Trial ending email sent to {email} ({days_remaining} days remaining)")
    except Exception as e:
        logger.error(f"Failed to send trial ending email to {email}: {e}")


async def send_subscription_confirmation_email(email: str, username: str, plan_name: str):
    """Send subscription purchase confirmation."""
    settings = get_settings()
    if not settings.resend_api_key:
        return

    r = _get_resend()
    try:
        r.Emails.send({
            "from": _from_email(),
            "to": [email],
            "subject": f"Suscripcion {plan_name} activada",
            "html": f"""
            <div style="font-family: 'Space Grotesk', -apple-system, sans-serif; max-width: 600px; margin: 0 auto; background: #000; color: #fff; padding: 40px 30px; border-radius: 16px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="margin: 0; font-size: 28px;">
                        <span style="color: #fff;">BOXBOX</span><span style="color: #9fe556;">NOW</span>
                    </h1>
                </div>
                <h2 style="color: #fff; font-size: 22px; margin-bottom: 10px;">Gracias, {username}!</h2>
                <p style="color: #a3a3a3; font-size: 15px; line-height: 1.6;">
                    Tu plan <strong style="color: #9fe556;">{plan_name}</strong> ha sido activado correctamente.
                    Ya tienes acceso completo a todas las funcionalidades incluidas en tu plan.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{settings.frontend_url}/dashboard" style="background: #9fe556; color: #000; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
                        Ir al Dashboard
                    </a>
                </div>
                <p style="color: #525252; font-size: 12px; text-align: center; margin-top: 30px;">
                    BoxBoxNow - Estrategia de Karting en Tiempo Real
                </p>
            </div>
            """,
        })
        logger.info(f"Subscription confirmation email sent to {email}")
    except Exception as e:
        logger.error(f"Failed to send subscription confirmation to {email}: {e}")


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
            "subject": "Restablecer contrasena - BoxBoxNow",
            "html": f"""
            <div style="font-family: 'Space Grotesk', -apple-system, sans-serif; max-width: 600px; margin: 0 auto; background: #000; color: #fff; padding: 40px 30px; border-radius: 16px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="margin: 0; font-size: 28px;">
                        <span style="color: #fff;">BOXBOX</span><span style="color: #9fe556;">NOW</span>
                    </h1>
                </div>
                <h2 style="color: #fff; font-size: 22px; margin-bottom: 10px;">Restablecer contrasena</h2>
                <p style="color: #a3a3a3; font-size: 15px; line-height: 1.6;">
                    Hola {username}, hemos recibido una solicitud para restablecer tu contrasena.
                    Haz clic en el boton para crear una nueva.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{reset_url}" style="background: #9fe556; color: #000; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
                        Restablecer contrasena
                    </a>
                </div>
                <p style="color: #737373; font-size: 13px; line-height: 1.5;">
                    Este enlace expira en 1 hora. Si no solicitaste este cambio, puedes ignorar este email.
                </p>
                <p style="color: #525252; font-size: 12px; text-align: center; margin-top: 30px;">
                    BoxBoxNow - Estrategia de Karting en Tiempo Real
                </p>
            </div>
            """,
        })
        logger.info(f"Password reset email sent to {email}")
    except Exception as e:
        logger.error(f"Failed to send password reset email to {email}: {e}")
