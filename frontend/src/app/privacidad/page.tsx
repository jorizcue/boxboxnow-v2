import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad | BoxBoxNow",
  description:
    "Política de privacidad de BoxBoxNow. Cómo recogemos, usamos y protegemos tus datos personales conforme al RGPD.",
};

export default function PrivacidadPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-300 py-16 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <a href="/" className="text-[#9fe556] text-sm hover:underline">
          ← Volver
        </a>

        <h1 className="text-3xl font-bold text-white">
          Política de Privacidad
        </h1>
        <p className="text-sm text-neutral-500">
          Última actualización: abril 2025
        </p>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            1. Responsable del tratamiento
          </h2>
          <p>
            De conformidad con el Reglamento (UE) 2016/679 (RGPD) y la Ley
            Orgánica 3/2018 de Protección de Datos Personales y garantía de los
            derechos digitales (LOPDGDD), te informamos de que el responsable
            del tratamiento de tus datos personales es{" "}
            <strong className="text-white">BoxBoxNow</strong>.
          </p>
          <p>
            Puedes contactar con nosotros para cualquier cuestión relativa a la
            privacidad en{" "}
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
            2. Datos que recogemos y finalidades
          </h2>
          <p>
            Recogemos únicamente los datos estrictamente necesarios para prestar
            el servicio. A continuación detallamos las distintas situaciones en
            las que se recaban datos:
          </p>

          <h3 className="text-base font-semibold text-neutral-200">
            Registro de cuenta
          </h3>
          <p>
            Al crear una cuenta recogemos nombre, correo electrónico y
            contraseña. La finalidad es gestionar el acceso personalizado a la
            plataforma y a los servicios que ofrece BoxBoxNow. La base jurídica
            es la ejecución del contrato de servicio.
          </p>

          <h3 className="text-base font-semibold text-neutral-200">
            Suscripción y pagos
          </h3>
          <p>
            Para gestionar suscripciones de pago, los datos de facturación y
            tarjeta son procesados directamente por nuestro proveedor de pagos
            (Stripe), con quien BoxBoxNow actúa como corresponsable a efectos
            del tratamiento. No almacenamos datos de tarjeta en nuestros
            servidores.
          </p>

          <h3 className="text-base font-semibold text-neutral-200">
            Datos de telemetría
          </h3>
          <p>
            Los datos de rendimiento (tiempos de vuelta, posiciones, etc.)
            introducidos o generados durante el uso de la plataforma son
            propiedad del usuario. Los tratamos exclusivamente para prestar el
            servicio contratado.
          </p>

          <h3 className="text-base font-semibold text-neutral-200">
            Comunicaciones
          </h3>
          <p>
            Si nos contactas por correo electrónico, utilizamos los datos
            aportados para responder a tu consulta. La base jurídica es el
            interés legítimo en la atención al usuario.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            3. Plazo de conservación
          </h2>
          <p>
            Los datos se conservan durante el tiempo necesario para cumplir la
            finalidad para la que fueron recogidos y mientras se mantenga la
            relación contractual. Una vez finalizada esta, se conservarán
            durante los plazos legalmente exigibles y, posteriormente, serán
            eliminados o anonimizados de forma segura.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            4. Cesión de datos a terceros
          </h2>
          <p>
            BoxBoxNow no cede tus datos personales a terceros salvo en los
            siguientes casos:
          </p>
          <ul className="list-disc list-inside space-y-2 text-neutral-400 ml-2">
            <li>
              <strong className="text-neutral-300">Stripe:</strong> proveedor de
              pagos, para la gestión de suscripciones y cobros.
            </li>
            <li>
              Proveedores de infraestructura cloud que actúan como encargados
              del tratamiento bajo contratos que garantizan el cumplimiento del
              RGPD.
            </li>
            <li>
              Cuando así lo exija la ley o una orden judicial.
            </li>
          </ul>
          <p>
            No vendemos ni alquilamos tus datos personales a terceros con fines
            comerciales ni publicitarios.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            4.bis. Analítica interna de uso
          </h2>
          <p>
            Para entender cómo se utiliza la plataforma y mejorarla, registramos
            <strong className="text-white"> eventos agregados de uso</strong>
            {" "}(p. ej. pestañas más visitadas, etapas del proceso de compra
            completadas, dispositivos activos por día). Esta analítica es
            <strong className="text-white"> de primera parte</strong>: los datos
            se almacenan en nuestros propios servidores y no se comparten con
            ningún tercero (no usamos Google Analytics, Mixpanel, Plausible,
            PostHog ni similares).
          </p>
          <p>
            Para reconstruir el recorrido entre la primera visita y la
            eventual compra utilizamos un{" "}
            <strong className="text-white">identificador anónimo (UUID)</strong>
            {" "}almacenado en tu navegador (<code>bbn_vid</code>), así como una
            captura de la primera fuente de tráfico (<code>utm_*</code> y
            referrer) (<code>bbn_ft</code>). No contienen datos personales
            identificables.
          </p>
          <p>
            Base legal: interés legítimo del responsable (art. 6.1.f RGPD) para
            la mejora y el mantenimiento del servicio. Puedes oponerte en
            cualquier momento desactivando la analítica desde{" "}
            <strong className="text-neutral-300">Cuenta → Privacidad</strong>{" "}
            dentro de la aplicación. La desactivación es inmediata: dejaremos
            de registrar nuevos eventos desde tu navegador.
          </p>
          <p>
            No realizamos grabación de sesión, no rastreamos las coordenadas
            del ratón ni hacemos seguimiento entre sitios.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            5. Tus derechos
          </h2>
          <p>
            De conformidad con el RGPD, tienes derecho a:
          </p>
          <ul className="list-disc list-inside space-y-2 text-neutral-400 ml-2">
            <li>
              <strong className="text-neutral-300">Acceso:</strong> conocer qué
              datos tuyos tratamos.
            </li>
            <li>
              <strong className="text-neutral-300">Rectificación:</strong>{" "}
              corregir datos inexactos o incompletos.
            </li>
            <li>
              <strong className="text-neutral-300">Supresión:</strong> solicitar
              la eliminación de tus datos cuando ya no sean necesarios.
            </li>
            <li>
              <strong className="text-neutral-300">
                Oposición y limitación:
              </strong>{" "}
              oponerte al tratamiento o solicitar que se limite en determinadas
              circunstancias.
            </li>
            <li>
              <strong className="text-neutral-300">Portabilidad:</strong>{" "}
              recibir tus datos en un formato estructurado y de uso común.
            </li>
            <li>
              <strong className="text-neutral-300">
                Retirar el consentimiento
              </strong>{" "}
              en cualquier momento, sin que ello afecte a la licitud del
              tratamiento previo.
            </li>
          </ul>
          <p>
            Para ejercer cualquiera de estos derechos, escríbenos a{" "}
            <a
              href="mailto:contacto@boxboxnow.com"
              className="text-[#9fe556] hover:underline"
            >
              contacto@boxboxnow.com
            </a>
            . Asimismo, tienes derecho a presentar una reclamación ante la
            Agencia Española de Protección de Datos (
            <a
              href="https://www.aepd.es"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#9fe556] hover:underline"
            >
              www.aepd.es
            </a>
            ).
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            6. Obligatoriedad de los datos
          </h2>
          <p>
            Los campos marcados como obligatorios en los formularios son
            necesarios para prestar el servicio solicitado. La negativa a
            facilitarlos puede impedir la contratación o el acceso al servicio.
            El usuario garantiza que los datos proporcionados son verídicos y se
            compromete a mantenerlos actualizados.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">
            7. Seguridad de los datos
          </h2>
          <p>
            BoxBoxNow aplica medidas técnicas y organizativas apropiadas para
            proteger tus datos personales frente a accesos no autorizados,
            pérdida, destrucción o divulgación indebida. Entre ellas se
            incluyen cifrado en tránsito (HTTPS/TLS), control de acceso basado
            en roles y auditorías periódicas de seguridad.
          </p>
          <p>
            No obstante, ningún sistema de transmisión por internet es
            completamente seguro; si detectas cualquier incidencia relacionada
            con tu cuenta, comunícalo de inmediato a{" "}
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
