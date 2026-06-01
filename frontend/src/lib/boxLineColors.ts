/**
 * Helper para resolver los colores de las filas del box.
 *
 * Fuente única de verdad de los defaults; centralizada aquí para que
 * la cabecera de la fila (BoxStatusPanel + FifoQueue), los botones
 * de asignación rápida (DraggableKart del strip), y el borde de las
 * cards del grid, lean del mismo array y siempre estén sincronizados.
 *
 * Los defaults se eligen por máxima distinguibilidad incluso bajo el
 * sol del circuito (Tailwind *-500 satura bien, suficiente contraste
 * con el fondo oscuro de la app):
 *
 *   F1 = azul  (#3b82f6 / blue-500)
 *   F2 = rojo  (#ef4444 / red-500)
 *   F3 = verde (#10b981 / emerald-500)
 *   F4 = amarillo (#eab308 / yellow-500)
 *   F5 = morado (#a855f7 / purple-500)
 *
 * Si la sesión tiene más de 5 filas (raro pero posible), repetimos
 * desde el principio. El operador puede sobreescribir cualquier
 * color individual desde la cabecera de cada fila.
 */
export const DEFAULT_BOX_LINE_COLORS: readonly string[] = [
  "#3b82f6", // azul F1
  "#ef4444", // rojo F2
  "#10b981", // verde F3
  "#eab308", // amarillo F4
  "#a855f7", // morado F5
];

/**
 * Devuelve un array de exactamente `boxLines` colores válidos,
 * respetando los del usuario y rellenando con defaults los huecos.
 *
 * Entrada:
 *   - `userColors` puede ser `null`, `undefined`, una lista vacía,
 *     o una lista más corta o más larga que `boxLines`.
 *   - `boxLines` >= 0 (clamp interno).
 *
 * Reglas:
 *   - Cada elemento del usuario que parezca un hex CSS válido se usa
 *     tal cual. El resto cae a default por su índice.
 *   - Defaults se ciclan con módulo si `boxLines > DEFAULT_BOX_LINE_COLORS.length`.
 */
export function resolveBoxLineColors(
  userColors: string[] | null | undefined,
  boxLines: number,
): string[] {
  const n = Math.max(0, Math.floor(boxLines));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const fromUser = userColors?.[i];
    const valid = typeof fromUser === "string" && isHexColor(fromUser);
    out.push(valid ? (fromUser as string) : DEFAULT_BOX_LINE_COLORS[i % DEFAULT_BOX_LINE_COLORS.length]);
  }
  return out;
}

/** Validación laxa de hex CSS: `#rgb`, `#rrggbb`, `#rrggbbaa`. */
export function isHexColor(s: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s.trim());
}
