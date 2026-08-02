import { redirect } from "next/navigation";

export default async function EquityFactorResearchRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v)) for (const item of v) qs.append(k, item);
  }
  const q = qs.toString();
  redirect(q ? `/quant/factor-research?${q}` : "/quant/factor-research");
}
