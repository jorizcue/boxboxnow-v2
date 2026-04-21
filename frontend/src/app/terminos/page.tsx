import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y Condiciones | BoxBoxNow",
  description:
    "Términos y condiciones de uso de la plataforma BoxBoxNow. Conoce tus derechos y obligaciones como usuario del servicio.",
};

export default function TerminosPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-300 py-16 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <a href="/" className="text-[#9fe556] text-sm hover:underline">
          ← Volver
        </a>

        <h1 className="text-3xl font-bold text-white">
          Términos y Condiciones de Uso
        </h1>
        <p className="text-sm text-neutral-500">
          Última actualización: abril 2025
        </p>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            1. Objeto y aceptación
          </h2>
          <p>
            Los presentes Términos y Condiciones regulan el acceso y uso de la
            plataforma <strong className="text-white">BoxBoxNow</strong>, accesible
            a través de boxboxnow.com, cuyo titular es BoxBoxNow (en adelante,
            «la Empresa»). El acceso y uso del servicio implica la aceptación
            plena y sin reservas de estas condiciones. Si no estás de acuerdo con
            alguno de los términos aquí expuestos, debes abstenerte de utilizar la
            plataforma.
          </p>
          <p>
            La Empresa se reserva el derecho a modificar estas condiciones en
            cualquier momento. Los cambios serán notificados a través de la
            plataforma o por correo electrónico, y entrarán en vigor a partir de
            su publicación.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            2. Descripción del servicio
          </h2>
          <p>
            BoxBoxNow es una plataforma de telemetría y gestión de tiempos para
            kartódromo. Permite a circuitos y equipos registrar, visualizar y
            analizar datos de rendimiento en tiempo real durante las sesiones de
            kart, incluyendo vueltas, posiciones, diferencias de tiempo y
            estadísticas de carrera.
          </p>
          <p>
            La Empresa puede añadir, modificar o retirar funcionalidades del
            servicio en cualquier momento, notificándolo cuando sea posible con
            antelación razonable.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            3. Registro de cuenta
          </h2>
          <p>
            Para acceder a determinadas funciones es necesario crear una cuenta.
            Al registrarte, te comprometes a proporcionar información veraz,
            actualizada y completa, y a mantenerla al día.
          </p>
          <p>
            Eres responsable de mantener la confidencialidad de tus credenciales
            de acceso y de todas las actividades que se realicen desde tu cuenta.
            Si detectas cualquier uso no autorizado, debes notificarlo de
            inmediato a{" "}
            <a
              href="mailto:contacto@boxboxnow.com"
              className="text-[#9fe556] hover:underline"
            >
              contacto@boxboxnow.com
            </a>
            .
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            4. Planes y pagos
          </h2>
          <p>
            BoxBoxNow ofrece distintos planes de acceso, incluyendo opciones
            gratuitas y de pago. Los precios, características y ciclos de
            facturación de cada plan se detallan en la página de precios de la
            plataforma.
          </p>
          <p>
            Los pagos se procesan a través de pasarelas de pago seguras. Al
            suscribirte a un plan de pago, autorizas el cargo periódico
            correspondiente. Puedes cancelar tu suscripción en cualquier momento
            desde tu panel de control; la cancelación tendrá efecto al final del
            período de facturación en curso.
          </p>
          <p>
            La Empresa no emite reembolsos por períodos ya facturados salvo en
            los casos en que la ley aplicable lo exija expresamente.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            5. Uso aceptable
          </h2>
          <p>
            El usuario se compromete a utilizar la plataforma de conformidad con
            la ley, la moral y el orden público, absteniéndose de:
          </p>
          <ul className="list-disc list-inside space-y-2 text-neutral-400 ml-2">
            <li>
              Intentar acceder sin autorización a sistemas o cuentas ajenas.
            </li>
            <li>
              Interferir en el correcto funcionamiento del servicio o sus
              infraestructuras.
            </li>
            <li>
              Transmitir contenido ilícito, ofensivo o que vulnere derechos de
              terceros.
            </li>
            <li>
              Realizar ingeniería inversa, descompilar o extraer el código fuente
              de la plataforma.
            </li>
            <li>
              Revender o sublicenciar el acceso al servicio sin autorización
              expresa.
            </li>
          </ul>
          <p>
            El incumplimiento de estas normas podrá dar lugar a la suspensión o
            cancelación de la cuenta sin previo aviso.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            6. Propiedad intelectual
          </h2>
          <p>
            Todos los derechos sobre la plataforma, incluyendo su diseño,
            código, logotipos, textos y funcionalidades, son propiedad exclusiva
            de BoxBoxNow o de sus licenciantes. Queda prohibida su reproducción,
            distribución o comunicación pública sin autorización escrita previa.
          </p>
          <p>
            Los datos de telemetría generados por el usuario pertenecen a este,
            quien otorga a BoxBoxNow una licencia no exclusiva para procesarlos
            con el fin de prestar el servicio contratado.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            7. Limitación de responsabilidad
          </h2>
          <p>
            BoxBoxNow no garantiza la disponibilidad ininterrumpida del servicio
            ni la ausencia de errores. La Empresa no será responsable de daños
            indirectos, lucro cesante ni pérdida de datos derivados del uso o
            imposibilidad de uso de la plataforma, salvo en los casos en que la
            ley lo impida.
          </p>
          <p>
            El usuario es el único responsable del uso que haga de los datos y
            análisis obtenidos a través de la plataforma.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            8. Legislación aplicable y jurisdicción
          </h2>
          <p>
            Estos Términos y Condiciones se rigen por la legislación española.
            Para la resolución de cualquier controversia, las partes se someten,
            con renuncia a cualquier otro fuero, a los juzgados y tribunales que
            correspondan conforme a derecho.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">9. Contacto</h2>
          <p>
            Para cualquier consulta relacionada con estos términos, puedes
            contactarnos en{" "}
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
