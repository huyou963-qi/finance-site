"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { ArticleChart } from "./ArticleChart";
import { chartReferenceId } from "@/lib/market/chartReference";

export function ArticleMarkdown({ content }: { content: string }) {
  return (
    <div className="article-md weekly-md">
      <ReactMarkdown skipHtml components={{ pre({ children, node, ...props }) {
        void node;
        if (React.isValidElement<{ className?: string; children?: React.ReactNode }>(children) && children.props.className === "language-gekko-chart") {
          const id = chartReferenceId(String(children.props.children ?? ""));
          return id ? <ArticleChart referenceId={id} /> : <p className="text-sm text-fs-muted">图表引用格式无效</p>;
        }
        return <pre {...props}>{children}</pre>;
      } }} remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]} rehypePlugins={[[rehypeKatex, { trust: false, strict: "error", maxExpand: 1000 }]]}>{content}</ReactMarkdown>
    </div>
  );
}
