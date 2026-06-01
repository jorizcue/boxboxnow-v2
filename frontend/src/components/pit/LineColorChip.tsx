"use client";

/**
 * Círculo de color clicable que aparece en la cabecera de cada fila
 * F{N} del grid del Box. Click → abre el color-picker nativo del
 * navegador (`<input type="color">`), y al cambio escribe el nuevo
 * array de colores a la sesión via PATCH `/api/config/session`.
 *
 * El `input` queda oculto y se dispara con `.click()` desde el botón
 * visible; eso evita el chrome feo del picker rectangular y deja el
 * UX como "círculo de color → escoger color". El usuario final NO
 * ve un input nativo en el flujo normal.
 *
 * Optimistic UI: actualizamos el store inmediatamente con el nuevo
 * color y mandamos el PATCH al servidor en background. Si el PATCH
 * falla, hacemos rollback al color anterior y mostramos un error
 * brevemente. El broadcast del backend re-confirma o pisa.
 *
 * Replay-safety: el modo box manual solo está activo en sesiones
 * live (o replay 1x), así que en un replay normal el chip aparece
 * pero al editar el color modificamos la RaceSession `is_active=True`
 * del usuario — eso es el comportamiento que el usuario espera
 * (los colores son de SU sesión, no del replay reproducido).
 */
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { useRaceStore } from "@/hooks/useRaceState";
import { resolveBoxLineColors } from "@/lib/boxLineColors";

export function LineColorChip({
  lineIdx,
  boxLines,
  className,
}: {
  lineIdx: number;
  boxLines: number;
  className?: string;
}) {
  const config = useRaceStore((s) => s.config);
  const colors = resolveBoxLineColors(config.boxLineColors, boxLines);
  const currentColor = colors[lineIdx] ?? "#000000";

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = useState(false);

  const onPick = async (newColor: string) => {
    if (newColor.toLowerCase() === currentColor.toLowerCase()) return;
    // Optimistic: actualizar store + persistir. Construimos el array
    // completo aunque solo cambie una posición (el backend reemplaza
    // todo el campo, no hace patch parcial por índice).
    const next = colors.slice();
    next[lineIdx] = newColor;
    const prev = config.boxLineColors;
    useRaceStore.setState({
      config: { ...config, boxLineColors: next },
    });
    setPending(true);
    try {
      await api.updateSession({ box_line_colors: next });
    } catch (e) {
      // Rollback al valor previo en el store
      useRaceStore.setState({
        config: { ...useRaceStore.getState().config, boxLineColors: prev ?? null },
      });
      console.warn("Failed to update box_line_colors", e);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        title={`Color fila F${lineIdx + 1}`}
        disabled={pending}
        className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full border border-black/40 hover:scale-110 transition-transform ${pending ? "opacity-50 cursor-wait" : "cursor-pointer"} ${className ?? ""}`}
        style={{ backgroundColor: currentColor }}
      />
      {/* Native color picker — oculto visualmente, disparado por el botón. */}
      <input
        ref={inputRef}
        type="color"
        value={currentColor}
        onChange={(e) => onPick(e.target.value)}
        className="sr-only"
        aria-label={`Color fila F${lineIdx + 1}`}
      />
    </>
  );
}
