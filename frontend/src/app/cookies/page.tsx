import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Cookies | BoxBoxNow",
  description:
    "Política de cookies de BoxBoxNow. Qué cookies utilizamos, para qué y cómo puedes gestionarlas.",
};

export default function CookiesPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-300 py-16 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <a href="/" className="text-[#9fe556] text-sm hover:underline">
          ← Volver
        </a>

        <h1 className="text-3xl font-bold text-white">
          Política de Cookies
        </h1>
        <p className="text-sm text-neutral-500">
          Última actualización: abril 2025
        </p>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            1. ¿Qué son las cookies?
          </h2>
          <p>
            Las cookies son pequeños archivos de texto que los sitios web
            almacenan en tu dispositivo cuando los visitas. Sirven para que la
            plataforma funcione correctamente, recuerde tus preferencias y
            garantice la seguridad de tu sesión.
          </p>
          <p>
            De conformidad con la Ley 34/2002 de Servicios de la Sociedad de la
            Información (LSSI) y el Reglamento (UE) 2016/679 (RGPD), te
            informamos de las cookies que utiliza BoxBoxNow.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            2. Cookies que utilizamos
          </h2>
          <p>
            BoxBoxNow es una plataforma minimalista en cuanto al uso de cookies.
            No empleamos cookies de publicidad, seguimiento de terceros ni
            analítica de comportamiento. Solo usamos lo estrictamente necesario
            para que el servicio funcione:
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="text-left py-3 pr-4 text-neutral-400 font-semibold">
                    Cookie / Almacenamiento
                  </th>
                  <th className="text-left py-3 pr-4 text-neutral-400 font-semibold">
                    Tipo
                  </th>
                  <th className="text-left py-3 pr-4 text-neutral-400 font-semibold">
                    Finalidad
                  </th>
                  <th className="text-left py-3 text-neutral-400 font-semibold">
                    Duración
                  </th>
                </tr>
              </thead>
              <tbody className="text-neutral-400">
                <tr className="border-b border-neutral-900">
                  <td className="py-3 pr-4 font-mono text-xs text-neutral-300">
                    token (localStorage)
                  </td>
                  <td className="py-3 pr-4">Técnica / Sesión</td>
                  <td className="py-3 pr-4">
                    Almacena el JWT de autenticación para mantener la sesión del
                    usuario iniciada. Es de primera parte y esencial para el
                    funcionamiento del servicio.
                  </td>
                  <td className="py-3">Sesión / hasta cierre de sesión</td>
                </tr>
                <tr className="border-b border-neutral-900">
                  <td className="py-3 pr-4 font-mono text-xs text-neutral-300">
                    bbn_vid, bbn_ft (localStorage)
                  </td>
                  <td className="py-3 pr-4">Analítica / Primera parte</td>
                  <td className="py-3 pr-4">
                    Identificador anónimo (UUID) y captura de la primera fuente
                    de visita (UTM / referrer). Se usan internamente para medir
                    el uso agregado de la plataforma y entender cómo se llega
                    a ella. Nunca se comparten con terceros. Puedes
                    desactivarlas en{" "}
                    <strong className="text-neutral-300">Cuenta → Privacidad</strong>.
                  </td>
                  <td className="py-3">Persistente / mientras no se borre el navegador</td>
                </tr>
                <tr className="border-b border-neutral-900">
                  <td className="py-3 pr-4 font-mono text-xs text-neutral-300">
                    __stripe_mid, __stripe_sid
                  </td>
                  <td className="py-3 pr-4">Técnica / Tercero</td>
                  <td className="py-3 pr-4">
                    Cookies establecidas por Stripe para la detección de fraude
                    y la seguridad en el procesamiento de pagos. Solo se activan
                    durante el flujo de pago.
                  </td>
                  <td className="py-3">1 año / sesión</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-mono text-xs text-neutral-300">
                    Next.js internals
                  </td>
                  <td className="py-3 pr-4">Técnica / Primera parte</td>
                  <td className="py-3 pr-4">
                    Cookies de rendimiento estándar del framework Next.js,
                    necesarias para el correcto renderizado y enrutamiento de la
                    aplicación.
                  </td>
                  <td className="py-3">Sesión</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            3. Qué NO hacemos con cookies
          </h2>
          <p>BoxBoxNow <strong className="text-white">no utiliza</strong>:</p>
          <ul className="list-disc list-inside space-y-2 text-neutral-400 ml-2">
            <li>Cookies de publicidad ni seguimiento publicitario.</li>
            <li>
              Herramientas de analítica de terceros (Google Analytics, Plausible,
              Mixpanel, PostHog, etc.). Toda la analítica que realizamos es
              first-party — los datos quedan en nuestros servidores y no se
              comparten con nadie.
            </li>
            <li>
              Píxeles de seguimiento de redes sociales (Facebook, X/Twitter,
              LinkedIn, etc.).
            </li>
            <li>
              Cookies de afiliación o de seguimiento entre sitios.
            </li>
            <li>
              Grabaciones de sesión ni mapas de calor de coordenadas del ratón.
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            4. Base legal
          </h2>
          <p>
            Las cookies técnicas y de sesión son estrictamente necesarias para
            la prestación del servicio solicitado y están exentas del
            requerimiento de consentimiento previo conforme al artículo 22.2 de
            la LSSI.
          </p>
          <p>
            Las cookies de Stripe se activan únicamente cuando el usuario inicia
            un proceso de pago, siendo necesarias para garantizar la seguridad
            de la transacción.
          </p>
          <p>
            El identificador anónimo de analítica interna (<code className="text-neutral-300">bbn_vid</code>,{" "}
            <code className="text-neutral-300">bbn_ft</code>) se utiliza bajo la
            base legal del <strong className="text-white">interés legítimo</strong>{" "}
            del responsable para conocer el uso agregado del servicio y mejorarlo.
            Los datos son agregados, no se ceden a terceros y puedes oponerte
            en cualquier momento desactivándolos desde{" "}
            <strong className="text-neutral-300">Cuenta → Privacidad</strong>.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            5. Cómo gestionar o eliminar las cookies
          </h2>
          <p>
            Puedes configurar tu navegador para bloquear o eliminar cookies.
            Ten en cuenta que deshabilitar las cookies técnicas puede afectar al
            funcionamiento de la plataforma (por ejemplo, impedir que se
            mantenga tu sesión iniciada).
          </p>
          <p>Instrucciones para los navegadores más habituales:</p>
          <ul className="list-disc list-inside space-y-2 text-neutral-400 ml-2">
            <li>
              <strong className="text-neutral-300">Google Chrome:</strong>{" "}
              Configuración → Privacidad y seguridad → Cookies y otros datos de
              sitios.
            </li>
            <li>
              <strong className="text-neutral-300">Mozilla Firefox:</strong>{" "}
              Preferencias → Privacidad y seguridad → Cookies y datos del
              sitio.
            </li>
            <li>
              <strong className="text-neutral-300">Safari:</strong>{" "}
              Preferencias → Privacidad → Gestionar datos del sitio web.
            </li>
            <li>
              <strong className="text-neutral-300">Microsoft Edge:</strong>{" "}
              Configuración → Cookies y permisos de sitio → Cookies y datos
              almacenados.
            </li>
          </ul>
          <p>
            Para eliminar el token de autenticación almacenado en
            localStorage, puedes hacerlo desde las herramientas de desarrollo
            de tu navegador o cerrando sesión en la plataforma.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            6. Actualizaciones de esta política
          </h2>
          <p>
            BoxBoxNow puede actualizar esta Política de Cookies para adaptarla
            a cambios técnicos o normativos. Cualquier modificación relevante
            será comunicada a través de la plataforma. Te recomendamos revisar
            esta página periódicamente.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">7. Contacto</h2>
          <p>
            Si tienes preguntas sobre el uso de cookies o quieres ejercer tus
            derechos, contacta con nosotros en{" "}
            <a
              href="mailto:contacto@boxboxnow.com"
              className="text-[#9fe556] hover:underline"
            >
              contacto@boxboxnow.com
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
