import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getAccessUserByToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getArticleById } from "@/lib/articles/articleStore";
import { ArticleDocument } from "@/components/articles/ArticleDocument";
export const dynamic = "force-dynamic";
export const metadata = { title: "文章预览", robots: { index: false, follow: false } };
export default async function PreviewArticle({ params }: { params: Promise<{ id: string }> }) {
  const user = await getAccessUserByToken((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!user || user.role !== "admin") notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const article = await getArticleById(id);
  if (!article || article.author !== user.username) notFound();
  return <ArticleDocument article={article} preview />;
}
