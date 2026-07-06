/** 时间线页占满 main 剩余高度 */
export default function EventsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="-mt-1 -mb-3 flex min-h-0 flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
}
