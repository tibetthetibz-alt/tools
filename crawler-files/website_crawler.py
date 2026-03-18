#!/usr/bin/env python3
"""
Website Crawler - Downloads entire website structure to local disk
Saves HTML, CSS, JS, images, fonts, PDFs, and all other assets
"""

import os
import sys
import time
import json
from urllib.parse import urljoin, urlparse, unquote
from pathlib import Path
from collections import deque
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup
import mimetypes

class WebsiteCrawler:
    def __init__(self, start_url, output_dir="website_crawl", stay_on_domain=True, max_pages=None):
        """
        Initialize crawler
        
        Args:
            start_url: URL to start crawling from
            output_dir: Directory to save files to
            stay_on_domain: Only crawl pages on same domain
            max_pages: Maximum pages to crawl (None = unlimited)
        """
        self.start_url = start_url.rstrip('/')
        self.output_dir = Path(output_dir)
        self.stay_on_domain = stay_on_domain
        self.max_pages = max_pages
        
        # Parse domain
        parsed = urlparse(start_url)
        self.domain = f"{parsed.scheme}://{parsed.netloc}"
        self.base_domain = parsed.netloc
        
        # Tracking
        self.visited_urls = set()
        self.downloaded_files = set()
        self.queue = deque([start_url])
        self.errors = []
        
        # Create output directory
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Setup requests session with retries
        self.session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "OPTIONS"]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        
        # Set user agent
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WebsiteCrawler'
        })

    def is_valid_url(self, url):
        """Check if URL is valid and should be crawled"""
        if not url or url.startswith('javascript:') or url.startswith('mailto:'):
            return False
        
        parsed = urlparse(url)
        if not parsed.scheme:
            return False
        
        if self.stay_on_domain:
            return parsed.netloc == self.base_domain
        return True

    def get_local_path(self, url):
        """Convert URL to local file path"""
        parsed = urlparse(url)
        path = parsed.path.strip('/')
        
        # Handle root
        if not path:
            path = 'index.html'
        
        # Handle query strings and fragments
        if parsed.query:
            # Create safe filename from query params
            query_safe = parsed.query.replace('&', '_').replace('=', '_')[:50]
            base, ext = os.path.splitext(path)
            if ext:
                path = f"{base}_{query_safe}{ext}"
            else:
                path = f"{path}_{query_safe}.html"
        
        # Add .html if no extension
        if not os.path.splitext(path)[1]:
            path = f"{path}/index.html"
        
        full_path = self.output_dir / path
        return full_path

    def is_asset_url(self, url):
        """Check if URL is an asset (not an HTML page)"""
        asset_extensions = {
            '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
            '.woff', '.woff2', '.ttf', '.otf', '.eot',
            '.pdf', '.zip', '.mp4', '.mp3', '.webm',
            '.ico', '.xml', '.json'
        }
        parsed = urlparse(url)
        path = parsed.path.lower()
        return any(path.endswith(ext) for ext in asset_extensions)

    def download_file(self, url):
        """Download a single file"""
        if url in self.downloaded_files:
            return True
        
        try:
            response = self.session.get(url, timeout=10, stream=True)
            response.raise_for_status()
            
            local_path = self.get_local_path(url)
            local_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Write file
            with open(local_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
            
            self.downloaded_files.add(url)
            print(f"✓ Downloaded: {url}")
            return True
            
        except Exception as e:
            error_msg = f"✗ Failed to download {url}: {str(e)}"
            print(error_msg)
            self.errors.append(error_msg)
            return False

    def extract_urls_from_html(self, html_content, base_url):
        """Extract all URLs from HTML content"""
        urls = set()
        
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Extract links from <a> tags
            for tag in soup.find_all(['a']):
                href = tag.get('href', '').strip()
                if href:
                    absolute_url = urljoin(base_url, href)
                    absolute_url = absolute_url.split('#')[0]  # Remove fragments
                    if self.is_valid_url(absolute_url):
                        urls.add(absolute_url)
            
            # Extract asset URLs
            for tag in soup.find_all(['script', 'link', 'img', 'source']):
                src = tag.get('src') or tag.get('href', '').strip()
                if src:
                    absolute_url = urljoin(base_url, src)
                    if self.is_valid_url(absolute_url):
                        urls.add(absolute_url)
            
            # Extract from srcset
            for tag in soup.find_all(['img']):
                srcset = tag.get('srcset', '').strip()
                if srcset:
                    for src_info in srcset.split(','):
                        src = src_info.strip().split()[0]
                        absolute_url = urljoin(base_url, src)
                        if self.is_valid_url(absolute_url):
                            urls.add(absolute_url)
            
        except Exception as e:
            print(f"Error parsing HTML from {base_url}: {str(e)}")
        
        return urls

    def crawl(self):
        """Main crawl loop"""
        print(f"\n🚀 Starting crawl of {self.start_url}")
        print(f"📁 Saving to: {self.output_dir.absolute()}")
        print(f"🌍 Domain mode: {'Same domain only' if self.stay_on_domain else 'All domains'}")
        print("-" * 60)
        
        start_time = time.time()
        pages_crawled = 0
        
        while self.queue and (self.max_pages is None or pages_crawled < self.max_pages):
            url = self.queue.popleft()
            
            if url in self.visited_urls:
                continue
            
            self.visited_urls.add(url)
            
            # Download the page
            if not self.download_file(url):
                continue
            
            pages_crawled += 1
            
            # Add delay to be respectful
            time.sleep(0.5)
            
            try:
                response = self.session.get(url, timeout=10)
                response.raise_for_status()
                
                # Only parse HTML responses
                if 'text/html' in response.headers.get('content-type', ''):
                    # Extract URLs from HTML
                    new_urls = self.extract_urls_from_html(response.content, url)
                    
                    for new_url in new_urls:
                        if new_url not in self.visited_urls:
                            if self.is_asset_url(new_url):
                                # Download assets immediately
                                self.download_file(new_url)
                            else:
                                # Queue HTML pages for crawling
                                self.queue.append(new_url)
            
            except Exception as e:
                print(f"Error processing {url}: {str(e)}")
        
        elapsed = time.time() - start_time
        self.print_summary(pages_crawled, elapsed)

    def print_summary(self, pages_crawled, elapsed):
        """Print crawl summary"""
        print("\n" + "=" * 60)
        print("📊 CRAWL SUMMARY")
        print("=" * 60)
        print(f"Pages crawled:        {pages_crawled}")
        print(f"Files downloaded:     {len(self.downloaded_files)}")
        print(f"URLs visited:         {len(self.visited_urls)}")
        print(f"Errors encountered:   {len(self.errors)}")
        print(f"Time elapsed:         {elapsed:.2f} seconds")
        print(f"Output directory:     {self.output_dir.absolute()}")
        print("=" * 60)
        
        if self.errors:
            print("\n⚠️  ERRORS:")
            for error in self.errors[:10]:  # Show first 10 errors
                print(f"  - {error}")
            if len(self.errors) > 10:
                print(f"  ... and {len(self.errors) - 10} more errors")

def main():
    if len(sys.argv) < 2:
        print("Usage: python website_crawler.py <URL> [output_dir] [--stay-on-domain] [--max-pages NUM]")
        print("\nExample:")
        print("  python website_crawler.py https://example.com")
        print("  python website_crawler.py https://example.com my_crawl --stay-on-domain")
        print("  python website_crawler.py https://example.com --max-pages 100")
        sys.exit(1)
    
    url = sys.argv[1]
    output_dir = "website_crawl"
    stay_on_domain = True
    max_pages = None
    
    # Parse arguments
    for arg in sys.argv[2:]:
        if arg.startswith('--max-pages'):
            try:
                max_pages = int(sys.argv[sys.argv.index(arg) + 1])
            except:
                pass
        elif arg == '--stay-on-domain':
            stay_on_domain = True
        elif arg == '--allow-external':
            stay_on_domain = False
        elif not arg.startswith('--'):
            output_dir = arg
    
    # Create crawler
    crawler = WebsiteCrawler(url, output_dir, stay_on_domain, max_pages)
    
    # Run crawl
    crawler.crawl()

if __name__ == "__main__":
    main()
