/**
 * Blog helpers for ve.peptidosplus.com.
 *
 * Small, resilient wrappers around @phantomwp/wordpress so every page can
 * degrade to empty results (never crash) when the CMS is slow or unreachable.
 * Pattern: mirrored from sesioniniciar.com / registrounicotributario.com.
 */
import {
  getPosts,
  getPost,
  getCategories,
  getTags,
  getAuthor,
  getUserById,
  getFeaturedImageUrl,
  getLocalImageUrl,
  getPostCategories,
  getPostTags,
  getPostsByCategory,
  getPostsByTag,
  getSEOImage,
  stripHtml,
  truncate,
} from '@/lib/wordpress';
import { calculateReadingTime } from '@/lib/seo';

/** Bound a promise so a stall degrades to `fallback` instead of hanging. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/** Fetch posts with a timeout + catch (never throws). */
export async function safePosts(perPage = 100, page = 1): Promise<any[]> {
  try {
    return await withTimeout(getPosts({ perPage, page }), 12000, []);
  } catch {
    return [];
  }
}

/** Fetch a single post by slug (never throws; returns null). */
export async function safePost(slug: string): Promise<any | null> {
  try {
    return await withTimeout(getPost(slug), 12000, null);
  } catch {
    return null;
  }
}

/** Fetch categories with timeout. */
export async function safeCategories(): Promise<any[]> {
  try {
    return await withTimeout(getCategories(), 8000, []);
  } catch {
    return [];
  }
}

/** Fetch tags with timeout. */
export async function safeTags(): Promise<any[]> {
  try {
    return await withTimeout(getTags(), 8000, []);
  } catch {
    return [];
  }
}

/** Best local image URL for a post (medium first, fallback full). */
export function postImage(post: any): string | null {
  if (!post) return null;
  return (
    getLocalImageUrl(getFeaturedImageUrl(post, 'medium')) ||
    getLocalImageUrl(getFeaturedImageUrl(post)) ||
    getSEOImage(post) ||
    null
  );
}

/** First category of a post, or null. */
export function firstCategory(post: any): any | null {
  const cats = getPostCategories(post);
  return cats && cats.length ? cats[0] : null;
}

/** Category slug for a post (used in filter data-attributes). */
export function catSlug(post: any): string {
  return firstCategory(post)?.slug ?? 'blog';
}

/** Category name for a post. */
export function catName(post: any): string {
  return firstCategory(post)?.name ?? 'Blog';
}

/** Plain-text title of a post (strip tags). */
export function postTitle(post: any): string {
  return stripHtml(post?.title?.rendered ?? '').trim() || (post?.title?.rendered ?? '').replace(/<[^>]+>/g, '');
}

/** Clean excerpt, truncated. */
export function postExcerpt(post: any, length = 160): string {
  return truncate(stripHtml(post?.excerpt?.rendered ?? '').trim(), length);
}

/** Reading time in minutes. */
export function readTime(post: any): number {
  return calculateReadingTime(post?.content?.rendered ?? '');
}

/** Spanish (es-VE) date like "12 de septiembre de 2026". */
export function esDate(d?: string): string {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '';
  }
}

/** Resolve a post's author, with WP user fallback. */
export async function resolveAuthor(post: any): Promise<any | null> {
  if (!post) return null;
  try {
    const fromPost = getAuthor(post);
    if (fromPost?.name) return fromPost;
    if (post.author) {
      const full = await withTimeout(getUserById(post.author), 8000, null);
      if (full?.name) return full;
    }
  } catch {
    /* noop */
  }
  return null;
}

/** Related posts: same-category first, then latest fallback. */
export async function relatedPosts(post: any, limit = 3): Promise<any[]> {
  if (!post) return [];
  const cat = firstCategory(post);
  let related: any[] = [];
  try {
    if (cat) {
      const byCat = await withTimeout(getPostsByCategory(cat.slug), 12000, []);
      related = byCat.filter((p: any) => p.slug !== post.slug).slice(0, limit);
    }
  } catch {
    related = [];
  }
  if (related.length < limit) {
    try {
      const latest = await safePosts(20);
      const extra = latest
        .filter((p: any) => p.slug !== post.slug && !related.some((r: any) => r.slug === p.slug))
        .slice(0, limit - related.length);
      related = [...related, ...extra];
    } catch {
      /* keep related as-is */
    }
  }
  return related;
}

export { getPostTags, getFeaturedImageUrl, getLocalImageUrl, stripHtml, truncate };
