const CHANNELS = [
  { key: "instagram", label: "Instagram", color: "#C2407E" },
  { key: "whatsapp", label: "WhatsApp", color: "#1E9E54" },
  { key: "loja", label: "Loja física", color: "#9DB394" },
] as const;

const R = 48;
const C = 2 * Math.PI * R; // circumference ≈ 301.6

export function ChannelDonut({
  byChannel,
}: {
  byChannel: { instagram: number; whatsapp: number; loja: number };
}) {
  const total = byChannel.instagram + byChannel.whatsapp + byChannel.loja;

  if (total === 0) {
    return (
      <p className="py-6 text-center text-[12.5px] text-ink-faint">
        Sem pedidos neste período ainda.
      </p>
    );
  }

  let cumulative = 0;
  const segments = CHANNELS.map((c) => {
    const value = byChannel[c.key];
    const pct = value / total;
    const len = C * pct;
    const seg = {
      ...c,
      value,
      pct: Math.round(pct * 100),
      dash: `${len.toFixed(1)} ${(C - len).toFixed(1)}`,
      offset: (-C * cumulative).toFixed(1),
    };
    cumulative += pct;
    return seg;
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
