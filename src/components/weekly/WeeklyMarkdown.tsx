"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function WeeklyMarkdown({ content }: { content: string }) {
  return (
    <div className="weekly-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
