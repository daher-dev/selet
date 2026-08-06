const CHANNELS = [
  { key: "instagram", label: "Instagram", color: "#C2407E" },
  { key: "whatsapp", label: "WhatsApp", color: "#1E9E54" },
  { key: "loja", label: "Loja física", color: "#9DB394" },
  { key: "interno", label: "Interno", color: "#3D4A42" },
] as const;

const R = 48;
const C = 2 * Math.PI * R; // circumference ≈ 301.6

export function ChannelDonut({
  byChannel,
}: {
  byChannel: { instagram: number; whatsapp: number; loja: number; interno: number };
}) {
  const total =
    byChannel.instagram + byChannel.whatsapp + byChannel.loja + byChannel.interno;

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2.5 pt-[26px] pb-[22px]">
        <svg width="104" height="104" viewBox="0 0 118 118">
          <circle cx="59" cy="59" r={R} fill="none" stroke="#F0F4ED" strokeWidth="16" />
        </svg>
        <span className="text-[13.5px] font-semibold text-ink-soft">
          Nenhum pedido no período
        </span>
        <span className="max-w-[280px] text-center text-[12.5px] text-ink-faint">
          Os canais aparecem aqui conforme os pedidos entram pelo Instagram,
          WhatsApp ou loja.
        </span>
      </div>
    );
  }

  // Prefix sum: each segment starts where the prior segments end. Computing the
  // offset from the sum of preceding fractions (rather than a running counter)
  // keeps the render pure — no closure variable is mutated after it's read.
  const fractions = CHANNELS.map((c) => byChannel[c.key] / total);
  const segments = CHANNELS.map((c, i) => {
    const value = byChannel[c.key];
    const pct = fractions[i];
    const len = C * pct;
    const priorPct = fractions.slice(0, i).reduce((sum, p) => sum + p, 0);
    return {
      ...c,
      value,
      pct: Math.round(pct * 100),
      dash: `${len.toFixed(1)} ${(C - len).toFixed(1)}`,
      offset: (-C * priorPct).toFixed(1),
    };
  });

  return (
    <div className="flex items-center gap-[18px]">
      <svg
        width="118"
        height="118"
        viewBox="0 0 118 118"
        className="shrink-0 -rotate-90"
      >
        <circle cx="59" cy="59" r={R} fill="none" stroke="#F0F4ED" strokeWidth="16" />
        {segments.map((s) => (
          <circle
            key={s.key}
            cx="59"
            cy="59"
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth="16"
            strokeDasharray={s.dash}
            strokeDashoffset={s.offset}
          />
        ))}
      </svg>
      <ul className="flex flex-1 flex-col gap-[11px]">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2.5">
            <span
              className="size-2.5 rounded-[3px]"
              style={{ background: s.color }}
            />
            <span className="flex-1 text-[13px] text-[#3D4A42]">{s.label}</span>
            <span className="tabular text-[13px] font-bold text-ink">
              {s.value}
            </span>
            <span className="tabular w-[38px] text-right text-[11.5px] text-ink-faint">
              {s.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
