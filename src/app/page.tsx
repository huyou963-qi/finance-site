import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 lg:px-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-50">本地调试脚手架</h1>
        <p className="mt-2 max-w-2xl text-slate-400">
          使用 Next.js App Router（可做 SEO 与 API 代理）+{" "}
          <span className="text-slate-300">Apache ECharts</span>（宏观）+{" "}
          <span className="text-slate-300">Lightweight Charts</span>
          （K 线）。下方入口分别演示两类图表与一条服务端代理示例。
        </p>
      </div>
      <ul className="flex flex-col gap-3 sm:flex-row">
        <li>
          <Link
            href="/macro"
            className="inline-flex rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-slate-100 hover:border-slate-500"
          >
            宏观示例（ECharts）
          </Link>
        </li>
        <li>
          <Link
            href="/markets"
            className="inline-flex rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-slate-100 hover:border-slate-500"
          >
            行情 K 线（Lightweight Charts）
          </Link>
        </li>
      </ul>
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
        <p className="font-medium text-slate-300">数据与密钥</p>
        <p className="mt-2">
          宏观页默认使用世界银行开放接口（免密钥）；行情页经服务端请求 Binance 公开 K 线。可选{" "}
          <code className="rounded bg-slate-800 px-1 py-0.5 text-slate-200">FRED_API_KEY</code>{" "}
         （见{" "}
          <code className="rounded bg-slate-800 px-1 py-0.5 text-slate-200">.env.example</code>
          ）。自建上游可使用{" "}
          <code className="rounded bg-slate-800 px-1 py-0.5 text-slate-200">
            /api/proxy-example
          </code>{" "}
          隐藏 Key。
        </p>
      </section>
    </div>
  );
}
