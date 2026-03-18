#!/usr/bin/env node
/**
 * Interactive Website Crawler CLI
 * Easy-to-use wrapper for crawling any website
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');
const pLimit = require('p-limit');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

class AdvancedWebsiteCrawler {
  constructor(startUrl, options = {}) {
    this.startUrl = startUrl.replace(/\/$/, '');
    this.outputDir = options.outputDir || 'website_crawl';
    this.followExternal = options.followExternal !== false;
    this.maxPages = options.maxPages || null;
    this.maxConcurrent = options.maxConcurrent || 5;
    this.timeout = options.timeout || 15000;
    this.verbose = options.verbose !== false;
    
    // Parse domain
    const parsed = new URL(startUrl);
    this.domain = `${parsed.protocol}//${parsed.hostname}`;
    this.hostname = parsed.hostname;
    this.protocol = parsed.protocol;
    
    // Tracking
    this.visited = new Map(); // url -> success/fail
    this.queue = new Set([startUrl]);
    this.domainsFound = new Set([this.hostname]);
    this.fileTypes = {};
    this.errors = [];
    this.stats = {
      pagesDownloaded: 0,
      filesDownloaded: 0,
      bytesSaved: 0,
      domainsVisited: 1,
      externalLinksFound: 0,
      errors: 0,
      startTime: Date.now(),
      skipped: 0
    };
    
    // Create output directory
    this.ensureDir(this.outputDir);
    
    // Axios instance
    this.client = axios.create({
      timeout: this.timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      maxRedirects: 10,
      validateStatus: () => true // Accept all status codes
    });
  }

  log(msg) {
    if (this.verbose) {
      console.log(msg);
    }
  }

  ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  isValidUrl(urlString) {
    try {
      const url = new URL(urlString);
      
      // Skip special URLs
      if (!url.protocol.startsWith('http')) {
        return false;
      }
      
      // Skip data URIs and common junk
      if (urlString.startsWith('data:') || urlString.startsWith('blob:')) {
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  }

  shouldFollowUrl(urlString) {
    try {
      const url = new URL(urlString);
      const hostname = url.hostname;
      
      if (this.followExternal) {
        return true; // Follow everything
      }
      
      // Stay on domain
      return hostname === this.hostname;
    } catch {
      return false;
    }
  }

  getLocalPath(urlString) {
    try {
      const url = new URL(urlString);
      let pathname = url.pathname.replace(/^\//, '');
      
      // Handle root
      if (!pathname || pathname.endsWith('/')) {
        pathname = path.join(pathname, 'index.html');
      }
      
      // Add extension if missing
      if (!path.extname(pathname)) {
        pathname += '/index.html';
      }
      
      // Handle query strings - append them to filename
      if (url.search) {
        const base = path.dirname(pathname);
        const ext = path.extname(pathname);
        const name = path.basename(pathname, ext);
        const query = url.search.slice(1).replace(/[&=]/g, '_').substring(0, 30);
        pathname = path.join(base, `${name}_${query}${ext}`);
      }
      
      return path.join(this.outputDir, pathname);
    } catch {
      return path.join(this.outputDir, 'error.html');
    }
  }

  getFileType(urlString) {
    try {
      const url = new URL(urlString);
      const ext = path.extname(url.pathname).toLowerCase();
      return ext || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  isAssetUrl(urlString) {
    const assetExtensions = [
      '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
      '.woff', '.woff2', '.ttf', '.otf', '.eot',
      '.pdf', '.zip', '.mp4', '.mp3', '.webm', '.ico', '.xml', '.json',
      '.tar', '.gz', '.exe', '.dmg', '.iso'
    ];
    
    try {
      const url = new URL(urlString);
      const ext = path.extname(url.pathname).toLowerCase();
      return assetExtensions.includes(ext);
    } catch {
      return false;
    }
  }

  async downloadFile(urlString) {
    if (this.visited.has(urlString)) {
      return this.visited.get(urlString);
    }
    
    this.visited.set(urlString, false);
    
    try {
      const response = await this.client.get(urlString, {
        responseType: 'arraybuffer'
      });
      
      if (response.status < 200 || response.status >= 400) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const localPath = this.getLocalPath(urlString);
      this.ensureDir(path.dirname(localPath));
      
      fs.writeFileSync(localPath, response.data);
      
      const fileType = this.getFileType(urlString);
      this.fileTypes[fileType] = (this.fileTypes[fileType] || 0) + 1;
      
      this.stats.filesDownloaded++;
      this.stats.bytesSaved += response.data.length;
      
      this.log(`  ✓ ${urlString}`);
      this.visited.set(urlString, true);
      
      return { success: true, response, data: response.data };
      
    } catch (error) {
      const msg = `✗ ${urlString} (${error.message})`;
      this.log(`  ${msg}`);
      this.errors.push(msg);
      this.stats.errors++;
      this.visited.set(urlString, false);
      return { success: false };
    }
  }

  extractUrlsFromHtml(html, baseUrl) {
    const urls = new Set();
    
    try {
      const $ = cheerio.load(html);
      
      // Extract all links
      $('a[href]').each((_, el) => {
        let href = $(el).attr('href')?.trim();
        if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:')) {
          try {
            const absolute = new URL(href, baseUrl).href.split('#')[0];
            if (this.isValidUrl(absolute)) {
              urls.add(absolute);
            }
          } catch {}
        }
      });
      
      // Extract script/link/img sources
      $('script[src], link[href], img[src], source[src], video[src], audio[src]').each((_, el) => {
        let src = $(el).attr('src') || $(el).attr('href');
        src = src?.trim();
        if (src) {
          try {
            const absolute = new URL(src, baseUrl).href;
            if (this.isValidUrl(absolute)) {
              urls.add(absolute);
            }
          } catch {}
        }
      });
      
      // Extract from srcset
      $('[srcset]').each((_, el) => {
        const srcset = $(el).attr('srcset');
        if (srcset) {
          srcset.split(',').forEach(item => {
            const src = item.trim().split(/\s+/)[0];
            try {
              const absolute = new URL(src, baseUrl).href;
              if (this.isValidUrl(absolute)) {
                urls.add(absolute);
              }
            } catch {}
          });
        }
      });
      
      // Extract from data attributes
      $('[data-src], [data-href], [data-url]').each((_, el) => {
        const src = $(el).attr('data-src') || $(el).attr('data-href') || $(el).attr('data-url');
        if (src) {
          try {
            const absolute = new URL(src, baseUrl).href;
            if (this.isValidUrl(absolute)) {
              urls.add(absolute);
            }
          } catch {}
        }
      });
      
    } catch (error) {
      this.log(`  ⚠ Error parsing HTML from ${baseUrl}`);
    }
    
    return urls;
  }

  async crawl() {
    console.log('\n' + '='.repeat(70));
    console.log('🚀 WEBSITE CRAWLER STARTED');
    console.log('='.repeat(70));
    console.log(`📍 Start URL:      ${this.startUrl}`);
    console.log(`📁 Output Dir:     ${path.resolve(this.outputDir)}`);
    console.log(`🌍 Mode:           ${this.followExternal ? 'Follow ALL external links' : 'Stay on domain only'}`);
    console.log(`⚡ Concurrency:    ${this.maxConcurrent} simultaneous downloads`);
    console.log(`⏱️  Timeout:        ${this.timeout / 1000}s per request`);
    console.log('='.repeat(70) + '\n');
    
    const limit = pLimit(this.maxConcurrent);
    const promises = [];
    let processedBatch = 0;
    
    while (this.queue.size > 0) {
      if (this.maxPages && this.stats.pagesDownloaded >= this.maxPages) {
        console.log(`\n⏸️  Reached max pages limit (${this.maxPages})`);
        break;
      }
      
      // Process batch
      const batch = Array.from(this.queue).slice(0, this.maxConcurrent);
      console.log(`\n📦 Batch ${++processedBatch} (Queue: ${this.queue.size}, Downloaded: ${this.stats.filesDownloaded})`);
      
      for (const url of batch) {
        this.queue.delete(url);
        
        const promise = limit(async () => {
          if (this.visited.has(url)) return;
          
          const result = await this.downloadFile(url);
          if (!result.success) return;
          
          // Check if HTML
          const contentType = result.response.headers['content-type'] || '';
          if (!contentType.includes('text/html')) {
            return;
          }
          
          this.stats.pagesDownloaded++;
          
          // Extract new URLs
          try {
            const html = result.data.toString('utf-8');
            const newUrls = this.extractUrlsFromHtml(html, url);
            
            for (const newUrl of newUrls) {
              if (!this.visited.has(newUrl)) {
                // Track domains
                try {
                  const urlObj = new URL(newUrl);
                  if (!this.domainsFound.has(urlObj.hostname)) {
                    this.domainsFound.add(urlObj.hostname);
                    this.stats.domainsVisited++;
                    if (urlObj.hostname !== this.hostname) {
                      this.stats.externalLinksFound++;
                    }
                  }
                } catch {}
                
                if (this.shouldFollowUrl(newUrl)) {
                  if (this.isAssetUrl(newUrl)) {
                    await this.downloadFile(newUrl);
                  } else {
                    this.queue.add(newUrl);
                  }
                }
              }
            }
          } catch (error) {
            this.log(`  ⚠ Error processing ${url}`);
          }
        });
        
        promises.push(promise);
      }
      
      await Promise.all(promises);
      promises.length = 0;
    }
    
    console.log('\n');
    this.printSummary();
  }

  printSummary() {
    const elapsed = (Date.now() - this.stats.startTime) / 1000;
    const minutes = Math.floor(elapsed / 60);
    const seconds = Math.floor(elapsed % 60);
    
    console.log('='.repeat(70));
    console.log('📊 CRAWL SUMMARY');
    console.log('='.repeat(70));
    console.log(`✅ HTML Pages:           ${this.stats.pagesDownloaded}`);
    console.log(`📥 Total Files:          ${this.stats.filesDownloaded}`);
    console.log(`💾 Data Saved:           ${(this.stats.bytesSaved / 1024 / 1024).toFixed(2)} MB`);
    console.log(`🌐 Domains Visited:      ${this.stats.domainsVisited}`);
    console.log(`🔗 External Links Found: ${this.stats.externalLinksFound}`);
    console.log(`❌ Errors:               ${this.stats.errors}`);
    console.log(`⏱️  Time:                 ${minutes}m ${seconds}s`);
    console.log(`📁 Saved to:             ${path.resolve(this.outputDir)}`);
    console.log('='.repeat(70));
    
    // File types breakdown
    if (Object.keys(this.fileTypes).length > 0) {
      console.log('\n📋 FILE TYPES SAVED:');
      const sorted = Object.entries(this.fileTypes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      
      for (const [ext, count] of sorted) {
        console.log(`  ${ext || '(no ext)'}: ${count} files`);
      }
      if (Object.keys(this.fileTypes).length > 10) {
        const remaining = Object.keys(this.fileTypes).length - 10;
        console.log(`  ... and ${remaining} more types`);
      }
    }
    
    // Errors
    if (this.errors.length > 0) {
      console.log('\n⚠️  FIRST 5 ERRORS:');
      this.errors.slice(0, 5).forEach(err => console.log(`  ${err}`));
      if (this.errors.length > 5) {
        console.log(`  ... and ${this.errors.length - 5} more`);
      }
    }
    
    console.log('='.repeat(70) + '\n');
  }
}

async function main() {
  try {
    console.clear();
    console.log('╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                   🕷️  WEBSITE CRAWLER CLI  🕷️                     ║');
    console.log('║                                                                  ║');
    console.log('║  Download entire websites - all pages, assets, and more!         ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');
    
    // Get URL
    let url = process.argv[2];
    if (!url) {
      url = await question('🌍 Enter website URL: ');
    }
    
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    
    // Get options
    let outputDir = process.argv[3] || 'website_crawl';
    if (process.argv.length < 4) {
      const custom = await question(`\n📁 Output directory (default: ${outputDir}): `);
      if (custom.trim()) outputDir = custom.trim();
    }
    
    let followExternal = true;
    if (process.argv.length < 5) {
      const response = await question('\n🔗 Follow external links? (y/n, default: y): ');
      followExternal = response.toLowerCase() !== 'n';
    }
    
    let maxConcurrent = 5;
    if (process.argv.length < 6) {
      const response = await question('\n⚡ Max concurrent downloads (1-20, default: 5): ');
      const num = parseInt(response);
      if (num > 0 && num <= 20) maxConcurrent = num;
    }
    
    let maxPages = null;
    if (process.argv.length < 7) {
      const response = await question('\n📄 Max pages to crawl (leave empty for unlimited): ');
      const num = parseInt(response);
      if (num > 0) maxPages = num;
    }
    
    rl.close();
    
    // Start crawling
    const crawler = new AdvancedWebsiteCrawler(url, {
      outputDir,
      followExternal,
      maxConcurrent,
      maxPages,
      verbose: true
    });
    
    await crawler.crawl();
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
