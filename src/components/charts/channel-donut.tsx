"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

const CHANNELS = [
  { key: "instagram", label: "Instagram", color: "#c2407e", dot: "bg-channel-instagram" },
  { key: "whatsapp", label: "WhatsApp", color: "#1e9e54", dot: "bg-channel-whatsapp" },
  { key: "loja", label: "Loja física", color: "#9db394", dot: "bg-channel-loja" },
] as const;

export function ChannelDonut({
  byChannel,
}: {
  byChannel: { instagram: number; whatsapp: number; loja: number };
}) {
  const total = byChannel.instagram + byChannel.whatsapp + byChannel.loja;
  const data = CHANNELS.map((c) => ({ ...c, value: byChannel[c.key] }));

  if (total === 0) {
    return (
      <p className="py-6 text-center text-[12.5px] text-ink-faint">
        Sem pedidos neste mês ainda.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative size-[132px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={44}
              outerRadius={62}
              paddingAngle={3}
              strokeWidth={0}
              isAnimationActive={false}
            >
              {data.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-[24px] font-bold leading-none tracking-[-0.4px] text-ink">
            {total}
          </span>
          <span className="text-[9.5px] font-bold uppercase tracking-wide text-ink-faint">
            pedidos
          </span>
        </div>
      </div>
      <ul className="flex-1 space-y-2">
        {data.map((entry) => (
          <li key={entry.key} className="flex items-center gap-2 text-[12.5px]">
            <span className={cn("size-2 rounded-full", entry.dot)} />
            <span className="flex-1 text-ink-soft">{entry.label}</span>
            <span className="tabular font-bold text-ink">{entry.value}</span>
            <span className="tabular w-10 text-right text-ink-faint">
              {total ? Math.round((entry.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
