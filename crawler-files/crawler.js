#!/usr/bin/env node
/**
 * Website Crawler - Node.js version
 * Downloads entire website to local disk with assets and proper structure
 * 
 * Usage: node crawler.js <URL> [options]
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');
const pLimit = require('p-limit');

class WebsiteCrawler {
  constructor(startUrl, options = {}) {
    this.startUrl = startUrl.replace(/\/$/, '');
    this.outputDir = options.outputDir || 'website_crawl';
    this.stayOnDomain = options.stayOnDomain !== false;
    this.maxPages = options.maxPages || null;
    this.maxConcurrent = options.maxConcurrent || 5;
    this.timeout = options.timeout || 10000;
    
    // Parse domain
    const parsed = new URL(startUrl);
    this.domain = `${parsed.protocol}//${parsed.hostname}`;
    this.hostname = parsed.hostname;
    
    // Tracking
    this.visited = new Set();
    this.queue = new Set([startUrl]);
    this.inProgress = new Set();
    this.errors = [];
    this.stats = {
      pagesDownloaded: 0,
      filesDownloaded: 0,
      errors: 0,
      startTime: Date.now()
    };
    
    // Create output directory
    this.ensureDir(this.outputDir);
    
    // Axios instance with retry
    this.client = axios.create({
      timeout: this.timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WebsiteCrawler/1.0'
      },
      maxRedirects: 5
    });
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
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return false;
      }
      
      if (this.stayOnDomain) {
        return url.hostname === this.hostname;
      }
      
      return true;
    } catch {
      return false;
    }
  }

  getLocalPath(urlString) {
    const url = new URL(urlString);
    let pathname = url.pathname.replace(/^\//, '');
    
    if (!pathname || pathname.endsWith('/')) {
      pathname = path.join(pathname, 'index.html');
    } else if (!path.extname(pathname)) {
      pathname += '/index.html';
    }
    
    return path.join(this.outputDir, pathname);
  }

  isAssetUrl(urlString) {
    const assetExtensions = [
      '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
      '.woff', '.woff2', '.ttf', '.otf', '.eot',
      '.pdf', '.zip', '.mp4', '.mp3', '.webm', '.ico', '.xml', '.json'
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
      return false;
    }
    
    this.visited.add(urlString);
    this.inProgress.add(urlString);
    
    try {
      const response = await this.client.get(urlString, {
        responseType: 'arraybuffer'
      });
      
      const localPath = this.getLocalPath(urlString);
      this.ensureDir(path.dirname(localPath));
      
      fs.writeFileSync(localPath, response.data);
      
      console.log(`✓ Downloaded: ${urlString}`);
      this.stats.filesDownloaded++;
      
      this.inProgress.delete(urlString);
      return response;
      
    } catch (error) {
      const msg = `✗ Failed: ${urlString} (${error.message})`;
      console.log(msg);
      this.errors.push(msg);
      this.stats.errors++;
      this.inProgress.delete(urlString);
      return null;
    }
  }

  extractUrlsFromHtml(html, baseUrl) {
    const urls = new Set();
    
    try {
      const $ = cheerio.load(html);
      
      // Extract links
      $('a[href]').each((_, el) => {
        let href = $(el).attr('href');
        if (href) {
          try {
            const absolute = new URL(href, baseUrl).href.split('#')[0];
            if (this.isValidUrl(absolute)) {
              urls.add(absolute);
            }
          } catch {}
        }
      });
      
      // Extract script/link/img sources
      $('script[src], link[href], img[src], source[src]').each((_, el) => {
        let src = $(el).attr('src') || $(el).attr('href');
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
      $('img[srcset]').each((_, el) => {
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
      
    } catch (error) {
      console.error(`Error parsing HTML from ${baseUrl}:`, error.message);
    }
    
    return urls;
  }

  async crawl() {
    console.log(`\n🚀 Starting crawl of ${this.startUrl}`);
    console.log(`📁 Saving to: ${path.resolve(this.outputDir)}`);
    console.log(`🌍 Domain mode: ${this.stayOnDomain ? 'Same domain only' : 'All domains'}`);
    console.log(`⚡ Max concurrent: ${this.maxConcurrent}`);
    console.log('-'.repeat(60));
    
    const limit = pLimit(this.maxConcurrent);
    const promises = [];
    
    while (this.queue.size > 0 && (!this.maxPages || this.stats.pagesDownloaded < this.maxPages)) {
      const urls = Array.from(this.queue).slice(0, this.maxConcurrent);
      
      for (const url of urls) {
        this.queue.delete(url);
        
        const promise = limit(async () => {
          if (this.visited.has(url)) return;
          
          const response = await this.downloadFile(url);
          if (!response) return;
          
          // Check if HTML page
          const contentType = response.headers['content-type'] || '';
          if (!contentType.includes('text/html')) {
            return;
          }
          
          this.stats.pagesDownloaded++;
          
          // Extract and queue new URLs
          try {
            const html = response.data.toString('utf-8');
            const newUrls = this.extractUrlsFromHtml(html, url);
            
            for (const newUrl of newUrls) {
              if (!this.visited.has(newUrl)) {
                if (this.isAssetUrl(newUrl)) {
                  // Download assets
                  await this.downloadFile(newUrl);
                } else {
                  // Queue pages
                  this.queue.add(newUrl);
                }
              }
            }
          } catch (error) {
            console.error(`Error processing ${url}:`, error.message);
          }
        });
        
        promises.push(promise);
      }
      
      await Promise.all(promises);
    }
    
    this.printSummary();
  }

  printSummary() {
    const elapsed = (Date.now() - this.stats.startTime) / 1000;
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 CRAWL SUMMARY');
    console.log('='.repeat(60));
    console.log(`Pages crawled:        ${this.stats.pagesDownloaded}`);
    console.log(`Files downloaded:     ${this.stats.filesDownloaded}`);
    console.log(`URLs visited:         ${this.visited.size}`);
    console.log(`Errors encountered:   ${this.stats.errors}`);
    console.log(`Time elapsed:         ${elapsed.toFixed(2)}s`);
    console.log(`Output directory:     ${path.resolve(this.outputDir)}`);
    console.log('='.repeat(60));
    
    if (this.errors.length > 0) {
      console.log('\n⚠️  ERRORS (first 10):');
      this.errors.slice(0, 10).forEach(err => console.log(`  - ${err}`));
      if (this.errors.length > 10) {
        console.log(`  ... and ${this.errors.length - 10} more errors`);
      }
    }
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node crawler.js <URL> [options]');
    console.log('\nOptions:');
    console.log('  --output <dir>      Output directory (default: website_crawl)');
    console.log('  --max-pages <num>   Maximum pages to crawl');
    console.log('  --allow-external    Follow external links');
    console.log('  --concurrent <num>  Max concurrent downloads (default: 5)');
    console.log('\nExample:');
    console.log('  node crawler.js https://example.com');
    console.log('  node crawler.js https://example.com --output my_site --max-pages 100');
    process.exit(1);
  }
  
  const url = args[0];
  const options = {
    stayOnDomain: true,
    maxConcurrent: 5
  };
  
  // Parse options
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--output':
        options.outputDir = args[++i];
        break;
      case '--max-pages':
        options.maxPages = parseInt(args[++i]);
        break;
      case '--allow-external':
        options.stayOnDomain = false;
        break;
      case '--concurrent':
        options.maxConcurrent = parseInt(args[++i]);
        break;
    }
  }
  
  const crawler = new WebsiteCrawler(url, options);
  await crawler.crawl();
}

main().catch(console.error);
