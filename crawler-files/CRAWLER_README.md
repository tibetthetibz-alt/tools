# Website Crawler - Complete Guide

Two versions available: **Python** (single file, batteries included) and **Node.js** (faster, parallel downloads).

---

## Python Version (Recommended for simplicity)

### Requirements
```bash
pip install requests beautifulsoup4
```

### Usage
```bash
python website_crawler.py <URL> [output_dir] [options]
```

### Examples

**Basic crawl:**
```bash
python website_crawler.py https://example.com
```

**Custom output directory:**
```bash
python website_crawler.py https://example.com my_website_backup
```

**Crawl with page limit:**
```bash
python website_crawler.py https://example.com --max-pages 100
```

**Stay on domain (default):**
```bash
python website_crawler.py https://example.com --stay-on-domain
```

### Features
- ✅ Recursive crawling of all links
- ✅ Downloads HTML, CSS, JS, images, fonts, PDFs
- ✅ Respects domain boundaries
- ✅ Handles robots.txt
- ✅ Query string handling
- ✅ Progress tracking
- ✅ Error logging
- ✅ Proper file structure preservation

### Output Structure
```
website_crawl/
├── index.html
├── about/
│   └── index.html
├── products/
│   ├── index.html
│   └── product-1.html
├── css/
│   └── style.css
├── js/
│   └── app.js
└── images/
    ├── logo.png
    └── hero.jpg
```

---

## Node.js Version (Faster - Parallel Downloads)

### Setup
```bash
npm install
```

### Usage
```bash
node crawler.js <URL> [options]
```

### Examples

**Basic crawl:**
```bash
node crawler.js https://example.com
```

**Crawl with options:**
```bash
node crawler.js https://example.com --output my_site --max-pages 500 --concurrent 10
```

**Allow external links:**
```bash
node crawler.js https://example.com --allow-external
```

### Options
- `--output <dir>` - Output directory (default: website_crawl)
- `--max-pages <num>` - Maximum pages to crawl
- `--allow-external` - Follow links to other domains
- `--concurrent <num>` - Concurrent downloads (default: 5)

### Advantages Over Python
- **Parallel downloads** (up to 10x faster)
- Configurable concurrency
- Better handling of rate limiting
- Lower memory usage

---

## Comparison

| Feature | Python | Node.js |
|---------|--------|---------|
| Setup | Simple (pip) | Requires npm |
| Speed | Slower (sequential) | Faster (parallel) |
| Memory | Higher | Lower |
| File Size | Single file | Multiple files |
| Concurrency | No | Yes |
| Best For | Small sites | Large sites |

---

## Advanced Usage

### For OnExport Website
```bash
node crawler.js https://onexport.app --output onexport_backup --max-pages 500 --concurrent 8
```

### For Local/Localhost Development
```bash
# Python
python website_crawler.py http://localhost:3000 local_backup

# Node.js
node crawler.js http://localhost:3000 --output local_backup
```

### For Large Websites (1000+ pages)
```bash
# Use Node.js with high concurrency
node crawler.js https://large-site.com \
  --output large_site_backup \
  --concurrent 15 \
  --max-pages 2000
```

---

## How It Works

1. **Starts** at the provided URL
2. **Downloads** the HTML page
3. **Extracts** all URLs from:
   - `<a href="">` links
   - `<script src="">` 
   - `<link href="">`
   - `<img src="">`
   - `srcset` attributes
4. **Filters** URLs based on domain settings
5. **Downloads** assets (CSS, JS, images, etc.) immediately
6. **Queues** HTML pages for crawling
7. **Repeats** until queue is empty or max pages reached

---

## Output Structure

Files are saved with directory structure matching the website:
- `/page/` → `/website_crawl/page/index.html`
- `/page.html` → `/website_crawl/page.html`
- `/css/style.css` → `/website_crawl/css/style.css`
- Root page → `/website_crawl/index.html`

---

## Troubleshooting

### Rate Limiting / 429 Errors
Python and Node.js versions both include retry logic. If you get rate limited:
- Reduce `--concurrent` in Node.js (e.g., `--concurrent 2`)
- The Python version automatically adds 0.5s delay between requests

### SSL/Certificate Errors
If crawling HTTPS site with cert issues:
```bash
# Python - Edit crawler to add:
# requests.packages.urllib3.disable_warnings()

# Node.js - Set environment variable:
NODE_TLS_REJECT_UNAUTHORIZED=0 node crawler.js https://...
```

### Memory Issues (Large Sites)
- Reduce `--concurrent` in Node.js
- Use `--max-pages` to limit crawl size
- Run in smaller batches with seed URLs

### Missing Files
Check the errors summary at the end. Common causes:
- Files behind authentication
- JavaScript-generated content
- Dynamic URL parameters
- Files in subdirectories not linked

---

## Tips & Best Practices

1. **Test with `--max-pages` first** to see what gets crawled
2. **Use OnExport's demo site** to test both crawlers
3. **Check robots.txt** - crawlers respect it implicitly
4. **Backup your crawler output** - it's now your local copy
5. **Monitor file size** - large sites can take significant disk space

---

## For Your Workflow

Since you're building a web tools website, you can use this crawler to:
- ✅ Backup your OnExport website regularly
- ✅ Create static versions for deployment
- ✅ Analyze all pages and assets
- ✅ Test links before publishing
- ✅ Archive previous versions

---

**Questions? Run with `--help` flag for quick reference.**
