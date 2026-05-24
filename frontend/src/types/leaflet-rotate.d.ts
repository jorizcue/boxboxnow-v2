/**
 * Type augmentation para el plugin `leaflet-rotate`.
 *
 * El plugin no trae tipos propios — extiende L.Map en runtime via
 * `L.Class.include()` añadiendo `_rotate`, `_bearing` y los métodos
 * `setBearing(deg)` / `getBearing()`. También añade campos a
 * `L.MapOptions` para configurar la rotación desde el constructor.
 *
 * Declaramos aquí las nuevas propiedades vía declaration-merging para
 * que TypeScript no se queje cuando pasamos `rotate: true, bearing: 0`
 * a `L.map()` ni cuando llamamos a `map.setBearing(rotation)`.
 *
 * Doc del plugin: https://github.com/Raruto/leaflet-rotate
 */
import "leaflet";

// El módulo no expone API JS — sólo parchea `L.Map.prototype` al
// import. Declararlo aquí evita el TS7016 cuando hacemos
// `await import("leaflet-rotate")` como side-effect. La sintaxis
// con cuerpo `{}` es necesaria porque este fichero contiene
// `import "leaflet"` arriba (lo convierte en módulo), y la forma
// shorthand `declare module "X";` sólo es válida en scripts.
declare module "leaflet-rotate" {}

declare module "leaflet" {
  interface MapOptions {
    /** Activa el modo rotación. Sin esto el resto de opciones se
     *  ignoran. */
    rotate?: boolean;
    /** Bearing inicial en grados (CW desde norte). 0 = norte arriba. */
    bearing?: number;
    /** Control de rotación nativo del plugin. False para usar uno
     *  propio (nuestro slider en TrackingTab). */
    rotateControl?: boolean | { closeOnZeroBearing?: boolean; position?: string };
    /** Rotación con dos dedos en pantalla táctil. */
    touchRotate?: boolean;
    /** Rotación con shift + scroll. */
    shiftKeyRotate?: boolean;
    /** Rotación según la brújula del dispositivo. */
    compassBearing?: boolean;
  }

  interface Map {
    /** Rota el mapa a `theta` grados (CW desde norte). */
    setBearing(theta: number): void;
    /** Devuelve el bearing actual en grados. */
    getBearing(): number;
  }
}
