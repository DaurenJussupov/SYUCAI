# Search and AI discovery

The Worker sends public page content, titles, descriptions, canonical URLs and JSON-LD in the initial HTML, identically to browsers and crawlers. Public language versions have independent paths (`/en/`, `/de/about`, `/mn/guide`); Russian remains unprefixed. Translation coverage is checked per public page. A fully translated guide/home/about page stays indexable even if unrelated private registration text is awaiting translation. Pages with missing managed public copy remain noindex and are omitted from the sitemap/hreflang for that language until complete.

- Sitemap: https://syucai.me/sitemap.xml — public pages, published posts and approved masters only; archived masters and drafts disappear automatically.
- Robots: https://syucai.me/robots.txt — private API/account/admin paths excluded; public image endpoints allowed. Authentication remains the actual protection for private files.
- Guide: https://syucai.me/guide — visible formulas, worked example and FAQ. The calculator homepage keeps its two inputs.
- AI source map: https://syucai.me/llms.txt — public references and limitations. This is an optional convention, not a guarantee that AI services will use it.
- Schema: Organization, WebSite, WebPage plus relevant FAQPage/WebApplication/BlogPosting/Person. No invented ratings, outcome claims or review counts.
- Original Russian blog articles retain their Russian canonical URL. A translated interface alone is not represented as a translated article.
- Private pages, personal calculation results and incomplete translations are noindex. Calculator input is never inserted into URLs, HTML metadata or analytics events.

## Owner actions after publishing

1. Add `syucai.me` as a **Domain property** in Google Search Console, verify ownership with the supplied DNS TXT record in Cloudflare, and submit `https://syucai.me/sitemap.xml` in Sitemaps. GA4 installation does not submit a site for indexing.
2. Inspect `/`, `/en/`, `/guide`, `/en/guide`, a live article and a published master with URL Inspection. Check the rendered HTML, chosen canonical and indexing status; request indexing for representative pages.
3. Add the site to Bing Webmaster Tools (Search Console import is available). Submit the same sitemap. This also improves discovery for services using Bing.
4. Watch Search Console impressions, actual search queries, countries, languages and clicks for several weeks. Choose new local-language articles from observed demand; this implementation does not claim measured keyword volumes.
5. Publish substantive original local-language material, maintain author/institute attribution, current dates, accurate qualifications and documented sources. Translate article bodies before creating indexed language equivalents. Seek relevant editorial links and institute/partner references; do not buy bulk links or generate near-identical city doorway pages.
6. Have a fluent speaker review important machine-translated pages. Keep complete catalogs and test mobile loading/readability. Monitor Core Web Vitals, crawl errors and expired event announcements.

No implementation can guarantee first place in search results or recommendations from an AI system. Discovery depends on indexing, query relevance, content quality, references and each service's independent ranking policies.

## Moderation and personal data

Only approved public profile fields enter page HTML and structured data. Diplomas, emails, drafts, pending/rejected/archived profiles and review evidence are never SEO content. Removing a card from the catalog returns 404 on its public page; cached search copies may take time to disappear. A logical removal from moderation lists is not an account-erasure request.
