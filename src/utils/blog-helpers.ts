/**
 * Blog Helper Functions & Code Snippets
 * 
 * This file contains useful code snippets and helper functions for working with
 * blog posts in your Astro site. Copy and paste these into your pages as needed.
 */

// ============================================================================
// BASIC POST RETRIEVAL
// ============================================================================

/**
 * Get all blog posts, sorted by date (newest first)
 * 
 * Usage in .astro file:
 * ```
 * const posts = await getAllPosts();
 * ```
 */
export async function getAllPosts() {
  const postFiles = import.meta.glob('../pages/blog/*.{md,mdx}', { eager: true });
  const posts = Object.values(postFiles);
  
  return posts.sort((a: any, b: any) => 
    new Date(b.frontmatter.pubDate).valueOf() - new Date(a.frontmatter.pubDate).valueOf()
  );
}

/**
 * Get recent posts (limit to N posts)
 * 
 * Usage:
 * ```
 * const recentPosts = await getRecentPosts(5);
 * ```
 */
export async function getRecentPosts(limit: number = 5) {
  const allPosts = await getAllPosts();
  return allPosts.slice(0, limit);
}

// ============================================================================
// FILTERING & SEARCHING
// ============================================================================

/**
 * Get posts by category
 * 
 * Usage:
 * ```
 * const techPosts = await getPostsByCategory('Technology');
 * ```
 */
export async function getPostsByCategory(category: string) {
  const allPosts = await getAllPosts();
  return allPosts.filter((post: any) => 
    post.frontmatter.categories?.includes(category)
  );
}

/**
 * Get posts by tag
 * 
 * Usage:
 * ```
 * const astroPosts = await getPostsByTag('astro');
 * ```
 */
export async function getPostsByTag(tag: string) {
  const allPosts = await getAllPosts();
  return allPosts.filter((post: any) => 
    post.frontmatter.tags?.includes(tag)
  );
}

/**
 * Search posts by title or content
 * 
 * Usage:
 * ```
 * const results = await searchPosts('wordpress');
 * ```
 */
export async function searchPosts(query: string) {
  const allPosts = await getAllPosts();
  const lowerQuery = query.toLowerCase();
  
  return allPosts.filter((post: any) => {
    const title = post.frontmatter.title?.toLowerCase() || '';
    const description = post.frontmatter.description?.toLowerCase() || '';
    const content = post.compiledContent?.()?.toLowerCase() || '';
    
    return title.includes(lowerQuery) || 
           description.includes(lowerQuery) || 
           content.includes(lowerQuery);
  });
}

// ============================================================================
// CATEGORIES & TAGS
// ============================================================================

/**
 * Get all unique categories from posts
 * 
 * Usage:
 * ```
 * const categories = await getAllCategories();
 * ```
 */
export async function getAllCategories() {
  const allPosts = await getAllPosts();
  const categoriesSet = new Set<string>();
  
  allPosts.forEach((post: any) => {
    post.frontmatter.categories?.forEach((cat: string) => {
      categoriesSet.add(cat);
    });
  });
  
  return Array.from(categoriesSet).sort();
}

/**
 * Get all unique tags from posts
 * 
 * Usage:
 * ```
 * const tags = await getAllTags();
 * ```
 */
export async function getAllTags() {
  const allPosts = await getAllPosts();
  const tagsSet = new Set<string>();
  
  allPosts.forEach((post: any) => {
    post.frontmatter.tags?.forEach((tag: string) => {
      tagsSet.add(tag);
    });
  });
  
  return Array.from(tagsSet).sort();
}

/**
 * Get category counts (for tag clouds, filters, etc.)
 * 
 * Usage:
 * ```
 * const categoryCounts = await getCategoryCounts();
 * // Returns: { 'Technology': 5, 'Design': 3, ... }
 * ```
 */
export async function getCategoryCounts() {
  const allPosts = await getAllPosts();
  const counts: Record<string, number> = {};
  
  allPosts.forEach((post: any) => {
    post.frontmatter.categories?.forEach((cat: string) => {
      counts[cat] = (counts[cat] || 0) + 1;
    });
  });
  
  return counts;
}

/**
 * Get tag counts (for tag clouds, filters, etc.)
 * 
 * Usage:
 * ```
 * const tagCounts = await getTagCounts();
 * // Returns: { 'astro': 10, 'wordpress': 5, ... }
 * ```
 */
export async function getTagCounts() {
  const allPosts = await getAllPosts();
  const counts: Record<string, number> = {};
  
  allPosts.forEach((post: any) => {
    post.frontmatter.tags?.forEach((tag: string) => {
      counts[tag] = (counts[tag] || 0) + 1;
    });
  });
  
  return counts;
}

// ============================================================================
// PAGINATION
// ============================================================================

/**
 * Paginate posts
 * 
 * Usage:
 * ```
 * const page = 1;
 * const postsPerPage = 10;
 * const paginatedData = await paginatePosts(page, postsPerPage);
 * 
 * // In your template:
 * {paginatedData.posts.map(post => ...)}
 * <a href={paginatedData.prevUrl}>Previous</a>
 * <a href={paginatedData.nextUrl}>Next</a>
 * ```
 */
export async function paginatePosts(page: number = 1, postsPerPage: number = 10) {
  const allPosts = await getAllPosts();
  const totalPages = Math.ceil(allPosts.length / postsPerPage);
  const startIndex = (page - 1) * postsPerPage;
  const endIndex = startIndex + postsPerPage;
  
  return {
    posts: allPosts.slice(startIndex, endIndex),
    currentPage: page,
    totalPages,
    totalPosts: allPosts.length,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    nextUrl: page < totalPages ? `/blog/page/${page + 1}` : null,
    prevUrl: page > 1 ? `/blog/page/${page - 1}` : null,
  };
}

// ============================================================================
// RELATED POSTS
// ============================================================================

/**
 * Get related posts based on shared tags and categories
 * 
 * Usage:
 * ```
 * const relatedPosts = await getRelatedPosts(currentPost, 3);
 * ```
 */
export async function getRelatedPosts(currentPost: any, limit: number = 3) {
  const allPosts = await getAllPosts();
  const currentTags = currentPost.frontmatter.tags || [];
  const currentCategories = currentPost.frontmatter.categories || [];
  
  // Calculate relevance score for each post
  const postsWithScores = allPosts
    .filter((post: any) => post.url !== currentPost.url) // Exclude current post
    .map((post: any) => {
      let score = 0;
      const postTags = post.frontmatter.tags || [];
      const postCategories = post.frontmatter.categories || [];
      
      // Score based on shared tags
      postTags.forEach((tag: string) => {
        if (currentTags.includes(tag)) score += 2;
      });
      
      // Score based on shared categories
      postCategories.forEach((cat: string) => {
        if (currentCategories.includes(cat)) score += 3;
      });
      
      return { post, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  
  return postsWithScores.slice(0, limit).map(({ post }) => post);
}

// ============================================================================
// DATE UTILITIES
// ============================================================================

/**
 * Get posts from a specific year
 * 
 * Usage:
 * ```
 * const posts2024 = await getPostsByYear(2024);
 * ```
 */
export async function getPostsByYear(year: number) {
  const allPosts = await getAllPosts();
  return allPosts.filter((post: any) => {
    const postDate = new Date(post.frontmatter.pubDate);
    return postDate.getFullYear() === year;
  });
}

/**
 * Get posts from a specific month
 * 
 * Usage:
 * ```
 * const marchPosts = await getPostsByMonth(2024, 3); // March 2024
 * ```
 */
export async function getPostsByMonth(year: number, month: number) {
  const allPosts = await getAllPosts();
  return allPosts.filter((post: any) => {
    const postDate = new Date(post.frontmatter.pubDate);
    return postDate.getFullYear() === year && postDate.getMonth() + 1 === month;
  });
}

/**
 * Group posts by year and month (for archives)
 * 
 * Usage:
 * ```
 * const archives = await getPostArchives();
 * // Returns: { 2024: { 3: [posts...], 2: [posts...] }, 2023: {...} }
 * ```
 */
export async function getPostArchives() {
  const allPosts = await getAllPosts();
  const archives: Record<number, Record<number, any[]>> = {};
  
  allPosts.forEach((post: any) => {
    const date = new Date(post.frontmatter.pubDate);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    
    if (!archives[year]) archives[year] = {};
    if (!archives[year][month]) archives[year][month] = [];
    
    archives[year][month].push(post);
  });
  
  return archives;
}

// ============================================================================
// AUTHOR UTILITIES
// ============================================================================

/**
 * Get posts by author
 * 
 * Usage:
 * ```
 * const johnPosts = await getPostsByAuthor('John Doe');
 * ```
 */
export async function getPostsByAuthor(authorName: string) {
  const allPosts = await getAllPosts();
  return allPosts.filter((post: any) => 
    post.frontmatter.author === authorName
  );
}

/**
 * Get all unique authors
 * 
 * Usage:
 * ```
 * const authors = await getAllAuthors();
 * ```
 */
export async function getAllAuthors() {
  const allPosts = await getAllPosts();
  const authorsSet = new Set<string>();
  
  allPosts.forEach((post: any) => {
    if (post.frontmatter.author) {
      authorsSet.add(post.frontmatter.author);
    }
  });
  
  return Array.from(authorsSet).sort();
}

// ============================================================================
// FEATURED & PINNED POSTS
// ============================================================================

/**
 * Get featured posts
 * 
 * Usage:
 * ```
 * const featuredPosts = await getFeaturedPosts();
 * ```
 * 
 * Note: Requires 'featured: true' in frontmatter
 */
export async function getFeaturedPosts() {
  const allPosts = await getAllPosts();
  return allPosts.filter((post: any) => post.frontmatter.featured === true);
}

// ============================================================================
// READING TIME
// ============================================================================

/**
 * Calculate estimated reading time for a post
 * 
 * Usage:
 * ```
 * const readingTime = calculateReadingTime(post.compiledContent());
 * // Returns: "5 min read"
 * ```
 */
export function calculateReadingTime(content: string, wordsPerMinute: number = 200): string {
  const words = content.trim().split(/\s+/).length;
  const minutes = Math.ceil(words / wordsPerMinute);
  return `${minutes} min read`;
}

// ============================================================================
// EXCERPT GENERATION
// ============================================================================

/**
 * Generate an excerpt from post content
 * 
 * Usage:
 * ```
 * const excerpt = generateExcerpt(post.compiledContent(), 150);
 * ```
 */
export function generateExcerpt(content: string, maxLength: number = 150): string {
  // Remove HTML tags
  const plainText = content.replace(/<[^>]*>/g, '');
  
  if (plainText.length <= maxLength) {
    return plainText;
  }
  
  // Truncate and add ellipsis
  return plainText.substring(0, maxLength).trim() + '...';
}

// ============================================================================
// EXAMPLE USAGE IN ASTRO PAGES
// ============================================================================

/*

// Example 1: Blog Index Page with Pagination
// src/pages/blog/[...page].astro
---
import { paginatePosts } from '../../utils/blog-helpers';

const currentPage = Number(Astro.params.page) || 1;
const paginatedData = await paginatePosts(currentPage, 10);
---

<div>
  {paginatedData.posts.map(post => (
    <article>
      <h2>{post.frontmatter.title}</h2>
      <p>{post.frontmatter.description}</p>
    </article>
  ))}
  
  {paginatedData.hasPrev && <a href={paginatedData.prevUrl}>Previous</a>}
  {paginatedData.hasNext && <a href={paginatedData.nextUrl}>Next</a>}
</div>


// Example 2: Category Filter Page
// src/pages/category/[category].astro
---
import { getPostsByCategory, getAllCategories } from '../../utils/blog-helpers';

export async function getStaticPaths() {
  const categories = await getAllCategories();
  return categories.map(category => ({
    params: { category },
  }));
}

const { category } = Astro.params;
const posts = await getPostsByCategory(category);
---

<h1>Posts in {category}</h1>
{posts.map(post => (
  <article>
    <h2>{post.frontmatter.title}</h2>
  </article>
))}


// Example 3: Blog Post with Related Posts
// src/layouts/BlogPost.astro
---
import { getRelatedPosts, calculateReadingTime } from '../utils/blog-helpers';

const { post } = Astro.props;
const { Content } = await post.render();
const relatedPosts = await getRelatedPosts(post, 3);
const readingTime = calculateReadingTime(post.body);
---

<article>
  <h1>{post.frontmatter.title}</h1>
  <p>{readingTime}</p>
  <Content />
  
  <aside>
    <h2>Related Posts</h2>
    {relatedPosts.map(related => (
      <a href={related.url}>{related.frontmatter.title}</a>
    ))}
  </aside>
</article>


// Example 4: Tag Cloud
// src/components/TagCloud.astro
---
import { getTagCounts } from '../utils/blog-helpers';

const tagCounts = await getTagCounts();
const sortedTags = Object.entries(tagCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20);
---

<div class="tag-cloud">
  {sortedTags.map(([tag, count]) => (
    <a 
      href={`/tag/${tag}`} 
      style={`font-size: ${Math.min(count * 0.5 + 1, 3)}rem`}
    >
      {tag} ({count})
    </a>
  ))}
</div>


// Example 5: Archives Page
// src/pages/archives.astro
---
import { getPostArchives } from '../utils/blog-helpers';

const archives = await getPostArchives();
const years = Object.keys(archives).sort().reverse();
---

<div>
  {years.map(year => (
    <div>
      <h2>{year}</h2>
      {Object.keys(archives[year]).sort().reverse().map(month => (
        <div>
          <h3>{new Date(Number(year), Number(month) - 1).toLocaleString('default', { month: 'long' })}</h3>
          <ul>
            {archives[year][month].map(post => (
              <li><a href={post.url}>{post.frontmatter.title}</a></li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  ))}
</div>


// Example 6: Search Page
// src/pages/search.astro
---
import { searchPosts } from '../utils/blog-helpers';

const query = Astro.url.searchParams.get('q') || '';
const results = query ? await searchPosts(query) : [];
---

<form action="/search" method="get">
  <input type="text" name="q" value={query} placeholder="Search posts..." />
  <button type="submit">Search</button>
</form>

{query && (
  <div>
    <h2>Search Results for "{query}"</h2>
    <p>{results.length} posts found</p>
    {results.map(post => (
      <article>
        <h3><a href={post.url}>{post.frontmatter.title}</a></h3>
        <p>{post.frontmatter.description}</p>
      </article>
    ))}
  </div>
)}

*/
