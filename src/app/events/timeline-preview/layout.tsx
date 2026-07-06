/** 时间轴预览：占满 main 剩余高度，去掉页面级留白 */
export default function TimelinePreviewLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="-mt-1 -mb-3 flex min-h-0 flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
}
