# 🕷️ Website Crawler - Quick Start Guide

## Installation

### Node.js Version (Fastest)
```bash
npm install
```

### Python Version (Easiest)
```bash
pip install requests beautifulsoup4
```

---

## Usage

### Node.js Interactive Mode
```bash
node crawl.js
```

Or pass URL directly:
```bash
node crawl.js https://example.com
```

### Python Interactive Mode
```bash
python crawl.py
```

Or pass URL directly:
```bash
python crawl.py https://example.com
```

---

## Features

✅ **Download Everything**
- HTML pages
- CSS stylesheets  
- JavaScript files
- Images (PNG, JPG, SVG, WebP, etc.)
- Fonts (WOFF, TTF, OTF, etc.)
- PDFs and documents
- Videos and audio
- JSON/XML files

✅ **Follow External Links**
- Crawl across multiple domains
- Or stay on your domain only
- Your choice!

✅ **Smart Downloading**
- Parallel downloads (up to 20 concurrent)
- Automatic retries on failure
- Respects rate limits
- Handles redirects

✅ **Detailed Reporting**
- Progress tracking
- File type breakdown
- Data saved (MB)
- Domains visited
- Error logging

---

## Interactive Prompts

When you run the crawler, you'll be asked:

```
🌍 Enter website URL
📁 Output directory (default: website_crawl)
🔗 Follow external links? (y/n)
⚡ Max concurrent downloads (1-20)
📄 Max pages to crawl (leave empty for unlimited)
```

---

## Example Usage

### Crawl Your Website
```bash
# Node.js
node crawl.js

# Python  
python crawl.py
```

Then answer:
```
URL: https://mywebsite.com
Output: mywebsite_backup
External links: y
Concurrency: 10
Max pages: (leave empty)
```

### Crawl with Limits
```bash
# Download first 100 pages only
# Max 5 concurrent downloads
```

### Crawl External Domains
```bash
# Crawl yoursite.com + all linked external sites
# Answer 'y' to external links question
```

---

## Output Structure

Files are saved matching the website structure:

```
website_crawl/
├── index.html                    (root page)
├── about/
│   └── index.html
├── products/
│   ├── index.html
│   └── product-1.html
├── css/
│   └── style.css
├── js/
│   └── app.js
├── images/
│   ├── logo.png
│   └── hero.jpg
└── fonts/
    └── roboto.woff2
```

---

## Performance

### Node.js (Recommended for large sites)
- **Speed:** 5-10x faster than Python
- **Best for:** 1000+ pages
- **Concurrency:** Up to 20 simultaneous downloads

### Python (Good for any site)
- **Speed:** Reliable and stable
- **Best for:** All sizes
- **Concurrency:** Up to 20 simultaneous downloads

---

## Tips

1. **Test first** - Use `--max-pages 50` to test before full crawl
2. **Monitor progress** - Watch the real-time console output
3. **Check errors** - Review errors at the end of summary
4. **Adjust concurrency** - Lower if server blocks you, higher for speed
5. **External links** - Beware: may crawl much larger datasets

---

## Common Scenarios

### Backup Your Website
```bash
# Node.js
node crawl.js https://yoursite.com
```

### Archive a Blog
```bash
# Python - more stable for long crawls
python crawl.py https://blog.example.com
```

### Download with Limits
```bash
# First 200 pages only
# When prompted: max pages = 200
```

### Fast Multi-Domain Crawl
```bash
# Node.js with high concurrency
node crawl.js
# When prompted: concurrency = 15, external = yes
```

---

## Troubleshooting

### Getting 429 "Too Many Requests" Errors
→ Lower the concurrency number (try 3-5 instead of 10+)

### Crawler getting stuck
→ Press Ctrl+C to stop, then restart with lower concurrency

### Missing files in output
→ Check errors section - files behind auth or JavaScript won't be saved

### Takes too long
→ Use Node.js version instead of Python (faster)
→ Increase concurrency (but may cause rate limiting)

---

## What Gets Saved

| Type | Saved? |
|------|--------|
| HTML pages | ✅ |
| CSS stylesheets | ✅ |
| JavaScript | ✅ |
| Images | ✅ |
| Fonts | ✅ |
| PDFs | ✅ |
| Videos | ✅ |
| Audio | ✅ |
| JSON/XML | ✅ |
| JavaScript-rendered content | ❌ |
| Login-protected pages | ❌ |
| Server-side sessions | ❌ |

---

## Advanced: Command Line Arguments

### Node.js
```bash
node crawl.js <URL> [output_dir] [--follow-external] [--max-concurrent 10]
```

### Python
```bash
python crawl.py <URL>
```

---

## Need More Control?

Check out these files for detailed implementation:

- `crawler.js` - Full Node.js crawler
- `website_crawler.py` - Full Python crawler
- `crawl.js` - Interactive Node.js wrapper
- `crawl.py` - Interactive Python wrapper

---

## Questions?

Run the crawler and answer the prompts. It will guide you through everything! 🚀

---

**Happy crawling! 🕷️**
