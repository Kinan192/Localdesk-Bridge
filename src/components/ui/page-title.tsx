import type { ReactNode } from "react";
import type { PageId } from "@/lib/demo";
import { pageInfo } from "@/config/navigation";

export function PageTitle({ page, children }: { page: PageId; children?: ReactNode }) {
  const meta = pageInfo[page];
  return <div className="mb-1 flex flex-wrap items-center justify-between gap-5">
    <div>
      <p className="mb-2 text-[10px] font-extrabold tracking-[.19em] text-mint">{meta.eyebrow}</p>
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-50 sm:text-4xl">{meta.title}<span className="text-mint">.</span></h1>
      <p className="mt-2 text-xs leading-6 text-muted sm:text-sm">{meta.description}</p>
    </div>
    {children && <div className="flex flex-wrap gap-2">{children}</div>}
  </div>;
}
