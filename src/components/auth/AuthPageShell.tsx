import Link from "next/link";
import { FinovaWordmark } from "@/components/brand/FinovaWordmark";

function MiniSparkline({ className }: { className?: string }) {
  return (
    <svg className={className} width="100%" height="48" viewBox="0 0 240 48" aria-hidden>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        points="0,40 30,36 60,28 90,32 120,18 150,22 180,12 210,16 240,6"
      />
      <line x1="0" y1="40" x2="240" y2="40" stroke="currentColor" strokeOpacity="0.12" />
    </svg>
  );
}

function AuthBrandAside() {
  return (
    <aside className="flex flex-col justify-between border-b border-fs-border bg-fs-elevated p-8 lg:col-span-2 lg:border-b-0 lg:border-r">
      <div>
        <Link href="/">
          <FinovaWordmark size="md" />
        </Link>
        <p className="mt-5 text-sm leading-relaxed text-fs-secondary">
          登录后即可使用宏观仪表盘、行情图表与 AI 周度观察。
        </p>
        <ul className="mt-6 space-y-3 text-sm text-fs-secondary">
          {[
            "宏观序列模板与图表偏好云端保存",
            "多资产行情与研究工作区",
            "注册后邮箱验证，保障账户安全",
          ].map((item) => (
            <li key={item} className="flex gap-2.5">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-fs-accent"
                aria-hidden
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <MiniSparkline className="mt-8 text-fs-accent opacity-80" />
    </aside>
  );
}

export function AuthPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center px-4 py-12 md:py-16 lg:px-8">
      <div className="w-full max-w-4xl overflow-hidden rounded-xl border border-fs-border bg-white shadow-sm">
        <div className="grid lg:grid-cols-5">
          <AuthBrandAside />
          <div className="p-8 lg:col-span-3 lg:p-10">{children}</div>
        </div>
      </div>
    </div>
  );
}

export const authInputClass =
  "mt-1.5 w-full rounded-md border border-fs-border bg-white px-3 py-2 text-fs-text outline-none transition placeholder:text-fs-muted/70 focus:border-fs-accent focus:ring-2 focus:ring-fs-accent/20";

export const authReadonlyInputClass =
  "mt-1.5 w-full rounded-md border border-fs-border bg-fs-elevated/80 px-3 py-2 text-fs-muted";
