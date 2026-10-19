import { Brand } from "./parts";

export default function RaffleLoading() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-[#F6FAF4]">
      <Brand />
      <div aria-busy="true" aria-label="Carregando" className="flex flex-col gap-3.5 px-[18px] py-6">
        {[
          "h-[26px] w-[70%] rounded-lg bg-[#DCE6D8]",
          "h-4 w-[45%] rounded-md bg-[#DCE6D8]",
          "mt-2 h-[72px] rounded-[14px] bg-[#E4ECE1]",
          "h-[180px] rounded-[14px] bg-[#E4ECE1]",
          "mt-2 h-[52px] rounded-[13px] bg-[#DCE6D8]",
        ].map((c) => (
          <span key={c} className={`sorteio-skeleton block ${c}`} />
        ))}
      </div>
    </main>
  );
}
