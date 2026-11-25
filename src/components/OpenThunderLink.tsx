import { ServiceGlyph } from "@/app/try/Glyphs";

const OT = "https://openthunder.dev";

/** A consistent pointer from a Thunder page to OpenThunder, the IDE for AI-written code. `soon` marks capabilities not shipped yet. */
export function OpenThunderLink({ title, body, cta, soon = false }: { title: string; body: string; cta: string; soon?: boolean }) {
  return <aside className="flex flex-col gap-3 rounded-2xl border border-gold-300/30 bg-gold-400/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex gap-3">
      <ServiceGlyph className="mt-0.5 h-5 w-5 text-gold-300" />
      <div>
        <p className="font-semibold text-white">{title}{soon && <span className="ml-2 rounded-full border border-dashed border-white/30 px-2 py-0.5 align-middle text-[11px] font-normal text-haze-300">Coming to OpenThunder</span>}</p>
        <p className="mt-1 text-sm text-haze-300">{body}</p>
      </div>
    </div>
    <a href={OT} className="shrink-0 rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">{cta} ↗</a>
  </aside>;
}
