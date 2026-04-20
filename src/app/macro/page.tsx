import { MacroSection } from "./MacroSection";

export default function MacroPage() {
  return (
    <div className="flex h-[calc(100dvh-7.5rem)] w-full min-w-0 flex-col overflow-hidden">
      <MacroSection />
    </div>
  );
}
