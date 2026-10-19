import { ImageResponse } from "next/og";
import { getPublicRaffle } from "@/data/raffles";
import { formatDayMonth } from "@/lib/raffles";

// Reads Firestore, so it must be rendered per request, never baked at build time.
export const dynamic = "force-dynamic";
export const alt = "Sorteio Selet";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pub = await getPublicRaffle(slug);
  const raffle = pub && pub.state !== "indisponivel" ? pub.raffle : null;

  // Decorative only: evenly spread numbers of the range. Never real participants.
  const from = raffle?.numberFrom ?? 1;
  const to = raffle?.numberTo ?? 100;
  const balls = Array.from({ length: 16 }, (_, i) =>
    Math.round(from + ((to - from) * (i + 0.5)) / 16),
  );
  const highlighted = new Set([balls[1], balls[6], balls[11]]);
  const until = raffle ? formatDayMonth(raffle.signupUntil) : "";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "#186B41",
          color: "#fff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "64px 0 60px 72px" }}>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <span style={{ fontSize: 64, fontWeight: 600, lineHeight: 1, marginRight: 16 }}>Selet</span>
            <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: 5, textTransform: "uppercase", color: "#CFE6C2" }}>
              Sorteio
            </span>
          </div>
          <div style={{ flex: 1, display: "flex" }} />
          <span style={{ fontSize: 30, fontWeight: 600, color: "#CFE6C2" }}>{raffle?.name ?? "Sorteio Selet"}</span>
          <span style={{ marginTop: 8, fontSize: 76, lineHeight: 1.02, fontWeight: 700, letterSpacing: -1.5, maxWidth: 640 }}>
            {raffle?.prize ?? "Escolha seu número da sorte"}
          </span>
          {raffle && (
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                alignItems: "center",
                marginTop: 30,
                height: 60,
                padding: "0 26px",
                borderRadius: 40,
                background: "#fff",
                color: "#186B41",
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              Escolha seu número · até {until}
            </div>
          )}
        </div>
        <div
          style={{
            width: 440,
            display: "flex",
            flexWrap: "wrap",
            alignContent: "center",
            justifyContent: "space-between",
            padding: "0 64px 0 0",
            gap: 18,
          }}
        >
          {balls.map((n) => (
            <div
              key={n}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 76,
                height: 76,
                borderRadius: 38,
                fontSize: 26,
                fontWeight: 700,
                ...(highlighted.has(n)
                  ? { background: "#F6EAC6", color: "#6B4A0C" }
                  : { background: "rgba(255,255,255,.1)", color: "#CFE6C2", border: "2px solid rgba(255,255,255,.22)" }),
              }}
            >
              {String(n).padStart(2, "0")}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
