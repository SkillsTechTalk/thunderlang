// Reader for the shared SkillsTech articles API (generation + publishing owned by STT).
// ThunderLang renders its own per-domain library from these public, no-auth endpoints, with the
// canonical URL set to thunderlang.dev. Content is first-party and trusted, generated + review-gated
// by STT. All fetches fail soft (empty list / null) so the site builds even if the API is briefly
// unreachable; ISR (revalidate) refreshes them.

const API_BASE = "https://skills-tech-talk-api.onrender.com";
export const ARTICLES_SITE = "thunderlang.dev";
const REVALIDATE = 3600; // 1h; content publishes at most ~1/day, so hourly is plenty.

export interface Article {
  slug: string;
  title: string;
  description: string;
  category: string;
  author: string;
  read_minutes: number;
  keywords: string[];
  published_date: string;
  source: string;
  target_site: string;
  content?: string;
}

export interface ArticleList {
  articles: Article[];
  total: number;
  totalPages: number;
  page: number;
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function listArticles(page = 1, perPage = 12): Promise<ArticleList> {
  const url = `${API_BASE}/api/articles?site=${encodeURIComponent(ARTICLES_SITE)}&page=${page}&per_page=${perPage}`;
  const json = (await getJson(url)) as
    | { data?: { articles?: Article[]; total?: number; total_pages?: number; page?: number } }
    | null;
  const data = json?.data;
  return {
    articles: Array.isArray(data?.articles) ? data!.articles! : [],
    total: data?.total ?? 0,
    totalPages: data?.total_pages ?? 0,
    page: data?.page ?? page,
  };
}

export async function getArticle(slug: string): Promise<Article | null> {
  const json = (await getJson(`${API_BASE}/api/articles/${encodeURIComponent(slug)}`)) as
    | { data?: Article }
    | null;
  const a = json?.data;
  return a && typeof a.slug === "string" ? a : null;
}

// The article sitemap is served by STT (URLs built off our domain); referenced from robots.
export const ARTICLES_SITEMAP_URL = `${API_BASE}/sitemap-articles.xml?site=${encodeURIComponent(ARTICLES_SITE)}`;
