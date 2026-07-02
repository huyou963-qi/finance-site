import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  CollapsibleSection,
  Grid,
  H1,
  H3,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
  UsageBar,
  useHostTheme,
} from "cursor/canvas";

const SPACE_COMPARE = [
  { label: "页头 + 11 项统计", current: 72, proposed: 36 },
  { label: "Tab + 调度操作区", current: 88, proposed: 40 },
  { label: "机制说明 / 同步报告 / 日志", current: 0, proposed: 0 },
  { label: "搜索 + 筛选 + 命令行", current: 64, proposed: 36 },
  { label: "指标表格可视区", current: 420, proposed: 560 },
];

const REDUNDANCY = [
  {
    item: "11 个统计数字横排",
    verdict: "压缩",
    note: "保留 4 个关键 KPI（未更新/待确定/已订阅/可自动更新），其余收入「统计详情」下拉",
  },
  {
    item: "调度操作 6 按钮平铺",
    verdict: "合并",
    note: "2 个主按钮 +「更多操作」菜单（跑到期、探测、日历映射、拉取日志）",
  },
  {
    item: "数据更新机制说明卡片",
    verdict: "移出",
    note: "默认隐藏；链接到 docs 或右上角 ? 帮助抽屉，不占主列表高度",
  },
  {
    item: "命令行 npm 提示整行",
    verdict: "移出",
    note: "放入帮助抽屉；运维人员已知命令，日常不必常驻",
  },
  {
    item: "同步报告 / 拉取日志 / 日历映射",
    verdict: "抽屉",
    note: "从主列堆叠改为右侧滑出面板，不挤压表格",
  },
  {
    item: "刷新按钮单独占行右侧",
    verdict: "合并",
    note: "与搜索栏同一行，或图标按钮",
  },
  {
    item: "表格 max-h 72vh",
    verdict: "改布局",
    note: "页面 flex：顶栏固定 ~120px，表格 flex-1 占满剩余视口",
  },
  {
    item: "10 列全展示",
    verdict: "可选",
    note: "默认 6 列；「获取方式/更新计划」等进展开行或列选择器",
  },
];

const MOCK_ROWS = [
  {
    name: "GDP:不变价:当季同比",
    code: "chov_gdp_yoy",
    freq: "季",
    value: "5%",
    date: "2026-03-31",
    status: "待确定",
    statusTone: "warning" as const,
  },
  {
    name: "ISM 制造业 PMI · 产出",
    code: "ism_us_ism_production",
    freq: "月",
    value: "53.3",
    date: "2026-06-01",
    status: "等待更新",
    statusTone: "accent" as const,
  },
  {
    name: "ISM 制造业 PMI · 新订单",
    code: "ism_us_ism_backlog",
    freq: "月",
    value: "48.2",
    date: "2026-06-01",
    status: "随发布包",
    statusTone: "neutral" as const,
  },
  {
    name: "CPI 同比",
    code: "sched_fred_CPIAUCSL",
    freq: "月",
    value: "3.1%",
    date: "2026-05-01",
    status: "未更新",
    statusTone: "negative" as const,
  },
  {
    name: "非农就业",
    code: "sched_fred_PAYEMS",
    freq: "月",
    value: "—",
    date: "—",
    status: "等待更新",
    statusTone: "accent" as const,
  },
  {
    name: "日本 CPI 核心",
    code: "jpov_cpi_core",
    freq: "月",
    value: "2.4%",
    date: "2026-04-30",
    status: "源端暂无新值",
    statusTone: "neutral" as const,
  },
  {
    name: "10Y-2Y 利差",
    code: "sched_fred_T10Y2Y",
    freq: "日",
    value: "0.42",
    date: "2026-06-28",
    status: "等待更新",
    statusTone: "accent" as const,
  },
  {
    name: "零售销售",
    code: "sched_fred_RSAFS",
    freq: "月",
    value: "0.6%",
    date: "2026-05-15",
    status: "等待更新",
    statusTone: "accent" as const,
  },
];

function SpaceBar({
  label,
  px,
  maxPx,
  tone,
}: {
  label: string;
  px: number;
  maxPx: number;
  tone: "muted" | "accent";
}) {
  const t = useHostTheme();
  const pct = Math.round((px / maxPx) * 100);
  return (
    <Row gap={8} style={{ alignItems: "center", marginBottom: 6 }}>
      <Text size="sm" style={{ width: 140, color: t.textSecondary }}>
        {label}
      </Text>
      <div
        style={{
          flex: 1,
          height: 18,
          background: t.bgSubtle,
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: tone === "accent" ? t.accent : t.stroke,
          }}
        />
      </div>
      <Text size="sm" weight="medium" style={{ width: 48, textAlign: "right" }}>
        {px}px
      </Text>
    </Row>
  );
}

function MockTable({ compact }: { compact?: boolean }) {
  const t = useHostTheme();
  const py = compact ? 4 : 8;
  const fontSize = compact ? 11 : 12;

  return (
    <div
      style={{
        border: `1px solid ${t.stroke}`,
        borderRadius: 6,
        overflow: "hidden",
        fontSize,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: compact
            ? "1.6fr 0.5fr 0.7fr 0.7fr 0.8fr"
            : "1.4fr 0.4fr 0.6fr 0.5fr 0.6fr 0.6fr 0.5fr 0.7fr",
          gap: 8,
          padding: `${py + 2}px 10px`,
          background: t.bgSubtle,
          color: t.textSecondary,
          fontWeight: 500,
          position: "sticky",
          top: 0,
        }}
      >
        <span>指标</span>
        <span>频度</span>
        <span>最新值</span>
        <span>日期</span>
        <span>状态</span>
        {!compact ? (
          <>
            <span>来源</span>
            <span>下次更新</span>
            <span>操作</span>
          </>
        ) : null}
      </div>
      {MOCK_ROWS.map((r) => (
        <div
          key={r.code}
          style={{
            display: "grid",
            gridTemplateColumns: compact
              ? "1.6fr 0.5fr 0.7fr 0.7fr 0.8fr"
              : "1.4fr 0.4fr 0.6fr 0.5fr 0.6fr 0.6fr 0.5fr 0.7fr",
            gap: 8,
            padding: `${py}px 10px`,
            borderTop: `1px solid ${t.stroke}`,
            alignItems: "start",
          }}
        >
          <div>
            <div style={{ color: t.text }}>{r.name}</div>
            <div style={{ color: t.textMuted, fontFamily: "monospace", fontSize: fontSize - 1 }}>
              {r.code}
            </div>
          </div>
          <span style={{ color: t.textSecondary }}>{r.freq}</span>
          <span>{r.value}</span>
          <span style={{ color: t.textSecondary }}>{r.date}</span>
          <Pill
            tone={
              r.statusTone === "negative"
                ? "negative"
                : r.statusTone === "warning"
                  ? "warning"
                  : r.statusTone === "accent"
                    ? "accent"
                    : "neutral"
            }
            size="sm"
          >
            {r.status}
          </Pill>
          {!compact ? (
            <>
              <span style={{ color: t.textMuted }}>统计局</span>
              <span style={{ color: t.textMuted }}>07-03 10:00</span>
              <span style={{ color: t.accent }}>同步</span>
            </>
          ) : null}
        </div>
      ))}
      <div
        style={{
          padding: "6px 10px",
          borderTop: `1px solid ${t.stroke}`,
          color: t.textMuted,
          fontSize: fontSize - 1,
          background: t.bgSubtle,
        }}
      >
        … 滚动显示更多指标（紧凑模式约多显示 40% 行）
      </div>
    </div>
  );
}

function ProposedLayoutMock() {
  const t = useHostTheme();

  return (
    <div
      style={{
        border: `1px solid ${t.stroke}`,
        borderRadius: 8,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: 520,
        background: t.bg,
      }}
    >
      {/* 顶栏 ~36px 内容区 */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: `1px solid ${t.stroke}`,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <Text weight="medium" size="md">
          数据更新目录
        </Text>
        <Pill tone="negative" size="sm">
          未更新 12
        </Pill>
        <Pill tone="warning" size="sm">
          待确定 8
        </Pill>
        <Pill tone="neutral" size="sm">
          已订阅 151
        </Pill>
        <Pill tone="accent" size="sm">
          可自动 143
        </Pill>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm">
          统计详情 ▾
        </Button>
        <Button variant="ghost" size="sm">
          帮助
        </Button>
        <Button variant="secondary" size="sm">
          刷新
        </Button>
      </div>

      {/* 工具条 ~40px */}
      <div
        style={{
          padding: "6px 12px",
          borderBottom: `1px solid ${t.stroke}`,
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        <Button variant="primary" size="sm">
          一键更新未更新
        </Button>
        <Button variant="secondary" size="sm">
          同步 TE 日历
        </Button>
        <Button variant="ghost" size="sm">
          更多操作 ▾
        </Button>
        <div style={{ width: 1, height: 20, background: t.stroke }} />
        <input
          readOnly
          value="搜索指标、代码、fred/mds 键…"
          style={{
            flex: 1,
            minWidth: 160,
            padding: "4px 8px",
            fontSize: 12,
            border: `1px solid ${t.stroke}`,
            borderRadius: 4,
            background: t.bgSubtle,
            color: t.textMuted,
          }}
        />
        <label style={{ fontSize: 11, color: t.textSecondary, display: "flex", gap: 4 }}>
          <input type="checkbox" readOnly /> 仅未更新
        </label>
        <label style={{ fontSize: 11, color: t.textSecondary, display: "flex", gap: 4 }}>
          <input type="checkbox" readOnly /> 仅待确定
        </label>
        <Button variant="ghost" size="sm">
          列
        </Button>
        <Button variant="ghost" size="sm">
          紧凑
        </Button>
      </div>

      {/* 表格 flex-1 */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 8px 8px" }}>
        <div style={{ padding: "6px 4px", fontSize: 11, color: t.textMuted }}>
          中国 CN ▸ 国民经济核算 ▸ 4 项
        </div>
        <MockTable compact />
      </div>
    </div>
  );
}

function CurrentLayoutMock() {
  const t = useHostTheme();

  return (
    <div
      style={{
        border: `1px solid ${t.stroke}`,
        borderRadius: 8,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: 520,
        background: t.bg,
      }}
    >
      <div style={{ padding: "12px", borderBottom: `1px solid ${t.stroke}` }}>
        <Text weight="medium">数据更新目录</Text>
        <div style={{ marginTop: 8, fontSize: 10, color: t.textMuted, lineHeight: 1.6 }}>
          指标 502 · 已入库 247 · 已订阅 151 · 有最新值 198 · 已确认 143 · 待确定 8 · 未更新 12 ·
          源端暂无 5 · 可自动 140 · 仅数据库 24 · 更新于 …
        </div>
      </div>
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${t.stroke}`, fontSize: 11 }}>
        [数据列表] [编辑目录树]
      </div>
      <div
        style={{
          margin: 8,
          padding: 10,
          border: `1px solid ${t.stroke}`,
          borderRadius: 6,
          fontSize: 11,
        }}
      >
        <div style={{ marginBottom: 6, fontWeight: 500 }}>调度操作</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {["同步 TE 日历", "一键更新", "跑到期", "探测", "拉取日志", "日历映射"].map((b) => (
            <span
              key={b}
              style={{
                padding: "2px 6px",
                border: `1px solid ${t.stroke}`,
                borderRadius: 4,
                fontSize: 10,
              }}
            >
              {b}
            </span>
          ))}
        </div>
      </div>
      <div
        style={{
          margin: "0 8px",
          padding: 8,
          border: `1px solid ${t.stroke}`,
          borderRadius: 6,
          fontSize: 10,
          color: t.textMuted,
        }}
      >
        ▸ 数据更新机制（通用）
      </div>
      <div style={{ margin: 8, display: "flex", gap: 8, fontSize: 11 }}>
        <div style={{ flex: 1, padding: 6, border: `1px solid ${t.stroke}`, borderRadius: 4 }}>
          搜索…
        </div>
      </div>
      <div style={{ margin: "0 8px 4px", fontSize: 9, color: t.textMuted }}>
        命令行：npm run data:probe-sources · sync-calendar …
      </div>
      <div style={{ flex: 1, margin: "0 8px 8px", overflow: "hidden" }}>
        <MockTable />
        <div
          style={{
            marginTop: 4,
            fontSize: 10,
            color: t.textMuted,
            textAlign: "center",
          }}
        >
          max-h: min(72vh, 900px) — 上方区块占用后实际可见约 5–6 行
        </div>
      </div>
    </div>
  );
}

export default function DataCatalogRedesignCanvas() {
  const t = useHostTheme();

  return (
    <Stack gap={24} style={{ padding: 20, maxWidth: 1100 }}>
      <div>
        <H1>数据更新目录 — 布局改版方案（预览）</H1>
        <Text color="secondary" style={{ marginTop: 4 }}>
          目标：指标表格可视行数从约 6 行提升到 10–12 行（同分辨率），不删除能力、只改信息架构。
        </Text>
      </div>

      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader title="现状（示意）" subtitle="1080p 下表格区约 35–40% 视口" />
          <CardBody>
            <CurrentLayoutMock />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="方案 B（推荐）" subtitle="表格区约 55–65% 视口 + 紧凑模式" />
          <CardBody>
            <ProposedLayoutMock />
          </CardBody>
        </Card>
      </Grid>

      <Card>
        <CardHeader title="垂直空间分配对比" subtitle="同 900px 内容区高度估算" />
        <CardBody>
          <Grid columns={2} gap={24}>
            <div>
              <H3 style={{ marginBottom: 8 }}>现状</H3>
              <SpaceBar label="页头统计" px={72} maxPx={560} tone="muted" />
              <SpaceBar label="Tab+调度" px={88} maxPx={560} tone="muted" />
              <SpaceBar label="机制/报告" px={48} maxPx={560} tone="muted" />
              <SpaceBar label="搜索区" px={64} maxPx={560} tone="muted" />
              <SpaceBar label="表格" px={228} maxPx={560} tone="muted" />
            </div>
            <div>
              <H3 style={{ marginBottom: 8 }}>方案 B</H3>
              <SpaceBar label="页头统计" px={36} maxPx={560} tone="muted" />
              <SpaceBar label="工具条" px={40} maxPx={560} tone="muted" />
              <SpaceBar label="机制/报告" px={0} maxPx={560} tone="muted" />
              <SpaceBar label="搜索区" px={0} maxPx={560} tone="muted" />
              <SpaceBar label="表格" px={484} maxPx={560} tone="accent" />
            </div>
          </Grid>
          <UsageBar
            style={{ marginTop: 16 }}
            segments={[
              { label: "表格占比提升", value: 56, color: t.accent },
              { label: "顶栏压缩", value: 44, color: t.stroke },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="功能去留建议" subtitle="不删能力，改呈现方式" />
        <CardBody padding={0}>
          <Table
            columns={[
              { key: "item", header: "现有元素", width: "28%" },
              { key: "verdict", header: "建议", width: "12%" },
              { key: "note", header: "说明" },
            ]}
            rows={REDUNDANCY.map((r) => ({
              item: r.item,
              verdict: r.verdict,
              note: r.note,
            }))}
          />
        </CardBody>
      </Card>

      <CollapsibleSection title="方案 B 交互细节" defaultOpen>
        <Stack gap={12}>
          <Text size="sm">
            <strong>1. 单页 flex 布局</strong>：外层{" "}
            <CodeInline>min-h-screen flex flex-col</CodeInline>，表格容器{" "}
            <CodeInline>flex-1 min-h-0 overflow-auto</CodeInline>，去掉{" "}
            <CodeInline>max-h-[min(72vh,900px)]</CodeInline> 上限。
          </Text>
          <Text size="sm">
            <strong>2. 右侧抽屉（宽 400px）</strong>：同步报告、拉取日志、日历映射、机制说明 ——
            打开时不推开主表，用 overlay 或 push 可选。
          </Text>
          <Text size="sm">
            <strong>3. 更多操作菜单</strong>：跑到期任务、探测数据源、编辑目录树（Tab 可改为菜单项）、命令行参考。
          </Text>
          <Text size="sm">
            <strong>4. 紧凑模式 + 列选择</strong>：默认显示 指标/频度/最新值/日期/状态/操作；获取方式、更新计划、来源链接
            合并到行展开（点击行左侧 ▸）或列选择器。
          </Text>
          <Text size="sm">
            <strong>5. 发布包子行</strong>：子项「随发布包同步」不显示操作列，主指标行保留「同步发布包」— 与现逻辑一致，UI
            更干净。
          </Text>
        </Stack>
      </CollapsibleSection>

      <Row gap={12}>
        <Stat label="预估多显示行数" value="+40~60%" tone="accent" />
        <Stat label="顶栏高度节省" value="~140px" tone="neutral" />
        <Stat label="主操作保留" value="2+菜单" tone="neutral" />
        <Stat label="实现风险" value="低" tone="accent" />
      </Row>

      <Callout tone="info">
        确认方案后可分两步落地：① 布局压缩 + 抽屉（不改表结构）；② 紧凑模式 + 列选择 + 行展开（需小改
        IndicatorRow）。
      </Callout>
    </Stack>
  );
}

function CodeInline({ children }: { children: string }) {
  const t = useHostTheme();
  return (
    <code
      style={{
        fontFamily: "monospace",
        fontSize: 11,
        padding: "1px 4px",
        background: t.bgSubtle,
        borderRadius: 3,
      }}
    >
      {children}
    </code>
  );
}
