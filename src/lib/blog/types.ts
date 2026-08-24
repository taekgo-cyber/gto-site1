export type PublicBlogArticleListItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  tags: string[];
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
  publishedAt: Date;
  updatedAt: Date;
  category: { slug: string; name: string } | null;
};

export type PublicBlogArticle = PublicBlogArticleListItem & {
  contentMarkdown: string;
  seoTitle: string | null;
  seoDescription: string | null;
  authorName: string | null;
};
