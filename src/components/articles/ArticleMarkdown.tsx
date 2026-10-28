"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

export function ArticleMarkdown({ content }: { content: string }) {
  return (
    <div className="article-md weekly-md">
      <ReactMarkdown skipHtml remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]} rehypePlugins={[[rehypeKatex, { trust: false, strict: "error", maxExpand: 1000 }]]}>{content}</ReactMarkdown>
    </div>
  );
}
