"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function ArticleMarkdown({ content }: { content: string }) {
  return (
    <div className="article-md weekly-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
