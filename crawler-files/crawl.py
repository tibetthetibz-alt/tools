#!/usr/bin/env python3
"""
Interactive Website Crawler - Python Version
Download any website completely - all pages and external links
"""

import os
import sys
import time
import json
import threading
from urllib.parse import urljoin, urlparse, unquote
from pathlib import Path
from collections import deque
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup
import mimetypes
from queue import Queue

class InteractiveWebsiteCrawler:
    def __init__(self, start_url, output_dir="website_crawl", follow_external=True, 
                 max_pages=None, max_workers=5, verbose=True):
        """
        Initialize crawler with support for external links
        """
        self.start_url = start_url.rstrip('/')
        self.output_dir = Path(output_dir)
        self.follow_external = follow_external
        self.max_pages = max_pages
        self.max_workers = max_workers
        self.verbose = verbose
        
        # Parse domain
        parsed = urlparse(start_url)
        self.domain = f"{parsed.scheme}://{parsed.netloc}"
        self.base_domain = parsed.netloc
        self.base_scheme = parsed.scheme
        
        # Tracking
        self.visited_urls = set()
        self.queue = deque([start_url])
        self.errors = []
        self.domains_found = {parsed.netloc}
        self.file_types = {}
        
        # Stats
        self.stats = {
            'pages_crawled': 0,
            'files_downloaded': 0,
            'bytes_saved': 0,
            'domains_visited': 1,
            'external_links': 0,
            'errors': 0,
            'start_time': time.time()
        }
        
        # Thread safety
        self.lock = threading.Lock()
        
        # Create output directory
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Setup requests session
        self.session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WebsiteCrawler/2.0'
        })

    def log(self, msg):
        if self.verbose:
            print(msg)

    def is_valid_url(self, url):
        """Check if URL is valid"""
        if not url or url.startswith('javascript:') or url.startswith('mailto:') or url.startswith('data:'):
            return False
        
        try:
            parsed = urlparse(url)
            return parsed.scheme in ('http', 'https')
        except:
            return False

    def should_follow_url(self, url):
        """Check if we should follow this URL"""
        if not self.is_valid_url(url):
            return False
        
        if self.follow_external:
            return True
        
        # Stay on domain
        parsed = urlparse(url)
        return parsed.netloc == self.base_domain

    def get_local_path(self, url):
        """Convert URL to local file path"""
        parsed = urlparse(url)
        path = parsed.path.strip('/')
        
        # Handle root
        if not path:
            path = 'index.html'
        
        # Handle query strings
        if parsed.query:
            query_safe = parsed.query.replace('&', '_').replace('=', '_')[:30]
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

    def get_file_type(self, url):
        """Get file extension"""
        parsed = urlparse(url)
        path = parsed.path.lower()
        ext = os.path.splitext(path)[1] or 'unknown'
        return ext

    def is_asset_url(self, url):
        """Check if URL is an asset (not HTML)"""
        asset_extensions = {
            '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
            '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp4', '.webm',
            '.pdf', '.zip', '.ico', '.xml', '.json', '.mp3', '.tar', '.gz'
        }
        ext = self.get_file_type(url)
        return ext in asset_extensions

    def download_file(self, url):
        """Download a single file"""
        if url in self.visited_urls:
            return None
        
        with self.lock:
            if url in self.visited_urls:
                return None
            self.visited_urls.add(url)
        
        try:
            response = self.session.get(url, timeout=15, stream=True)
            response.raise_for_status()
            
            if response.status_code >= 400:
                return None
            
            local_path = self.get_local_path(url)
            local_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Write file
            with open(local_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
            
            file_type = self.get_file_type(url)
            with self.lock:
                self.file_types[file_type] = self.file_types.get(file_type, 0) + 1
                self.stats['files_downloaded'] += 1
                self.stats['bytes_saved'] += len(response.content)
            
            self.log(f"  ✓ {url[:80]}")
            return response
            
        except Exception as e:
            error_msg = f"✗ {url[:80]} ({str(e)[:40]})"
            self.log(f"  {error_msg}")
            with self.lock:
                self.errors.append(error_msg)
                self.stats['errors'] += 1
            return None

    def extract_urls_from_html(self, html_content, base_url):
        """Extract all URLs from HTML"""
        urls = set()
        
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Links
            for tag in soup.find_all(['a']):
                href = tag.get('href', '').strip()
                if href and not href.startswith('#'):
                    try:
                        absolute_url = urljoin(base_url, href).split('#')[0]
                        if self.should_follow_url(absolute_url):
                            urls.add(absolute_url)
                    except:
                        pass
            
            # Assets
            for tag in soup.find_all(['script', 'link', 'img', 'source', 'video', 'audio']):
                src = tag.get('src') or tag.get('href', '').strip()
                if src:
                    try:
                        absolute_url = urljoin(base_url, src)
                        if self.should_follow_url(absolute_url):
                            urls.add(absolute_url)
                    except:
                        pass
            
            # Srcset
            for tag in soup.find_all(['img']):
                srcset = tag.get('srcset', '').strip()
                if srcset:
                    for src_info in srcset.split(','):
                        src = src_info.strip().split()[0]
                        try:
                            absolute_url = urljoin(base_url, src)
                            if self.should_follow_url(absolute_url):
                                urls.add(absolute_url)
                        except:
                            pass
            
            # Data attributes
            for tag in soup.find_all(attrs={'data-src': True}):
                src = tag.get('data-src')
                try:
                    absolute_url = urljoin(base_url, src)
                    if self.should_follow_url(absolute_url):
                        urls.add(absolute_url)
                except:
                    pass
            
        except Exception as e:
            self.log(f"  ⚠ Error parsing HTML from {base_url}")
        
        return urls

    def crawl(self):
        """Main crawl loop with threading"""
        print('\n' + '='*70)
        print('🚀 WEBSITE CRAWLER STARTED')
        print('='*70)
        print(f'📍 Start URL:      {self.start_url}')
        print(f'📁 Output Dir:     {self.output_dir.absolute()}')
        print(f'🌍 Mode:           {"Follow ALL external links" if self.follow_external else "Stay on domain only"}')
        print(f'⚡ Concurrency:    {self.max_workers} simultaneous downloads')
        print('='*70 + '\n')
        
        batch_num = 0
        
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            while self.queue:
                if self.max_pages and self.stats['pages_crawled'] >= self.max_pages:
                    print(f'\n⏸️  Reached max pages limit ({self.max_pages})')
                    break
                
                batch_num += 1
                batch = []
                
                # Get batch
                for _ in range(min(self.max_workers, len(self.queue))):
                    if self.queue:
                        batch.append(self.queue.popleft())
                
                print(f'\n📦 Batch {batch_num} (Queue: {len(self.queue)}, Downloaded: {self.stats["files_downloaded"]})')
                
                futures = {}
                
                for url in batch:
                    future = executor.submit(self.download_file, url)
                    futures[future] = url
                
                # Process results
                for future in as_completed(futures):
                    url = futures[future]
                    response = future.result()
                    
                    if not response:
                        continue
                    
                    # Check if HTML
                    content_type = response.headers.get('content-type', '')
                    if 'text/html' not in content_type:
                        continue
                    
                    with self.lock:
                        self.stats['pages_crawled'] += 1
                    
                    # Extract URLs
                    try:
                        html = response.content.decode('utf-8', errors='ignore')
                        new_urls = self.extract_urls_from_html(html, url)
                        
                        for new_url in new_urls:
                            if new_url not in self.visited_urls:
                                # Track domains
                                try:
                                    parsed = urlparse(new_url)
                                    if parsed.netloc not in self.domains_found:
                                        with self.lock:
                                            self.domains_found.add(parsed.netloc)
                                            self.stats['domains_visited'] += 1
                                            if parsed.netloc != self.base_domain:
                                                self.stats['external_links'] += 1
                                except:
                                    pass
                                
                                if self.is_asset_url(new_url):
                                    executor.submit(self.download_file, new_url)
                                else:
                                    self.queue.append(new_url)
                    except Exception as e:
                        self.log(f'  ⚠ Error processing {url}')
        
        print('\n')
        self.print_summary()

    def print_summary(self):
        """Print summary statistics"""
        elapsed = time.time() - self.stats['start_time']
        minutes = int(elapsed // 60)
        seconds = int(elapsed % 60)
        
        print('='*70)
        print('📊 CRAWL SUMMARY')
        print('='*70)
        print(f"✅ HTML Pages:           {self.stats['pages_crawled']}")
        print(f"📥 Total Files:          {self.stats['files_downloaded']}")
        print(f"💾 Data Saved:           {self.stats['bytes_saved'] / 1024 / 1024:.2f} MB")
        print(f"🌐 Domains Visited:      {self.stats['domains_visited']}")
        print(f"🔗 External Links Found: {self.stats['external_links']}")
        print(f"❌ Errors:               {self.stats['errors']}")
        print(f"⏱️  Time:                 {minutes}m {seconds}s")
        print(f"📁 Saved to:             {self.output_dir.absolute()}")
        print('='*70)
        
        # File types
        if self.file_types:
            print('\n📋 FILE TYPES SAVED:')
            sorted_types = sorted(self.file_types.items(), key=lambda x: x[1], reverse=True)
            for file_type, count in sorted_types[:10]:
                print(f'  {file_type or "(no ext)"}: {count} files')
            if len(self.file_types) > 10:
                print(f'  ... and {len(self.file_types) - 10} more types')
        
        # Errors
        if self.errors:
            print('\n⚠️  FIRST 5 ERRORS:')
            for error in self.errors[:5]:
                print(f'  {error}')
            if len(self.errors) > 5:
                print(f'  ... and {len(self.errors) - 5} more')
        
        print('='*70 + '\n')

def get_input(prompt, default=""):
    """Get user input with optional default"""
    if default:
        prompt = f"{prompt} (default: {default}): "
    else:
        prompt = f"{prompt}: "
    
    response = input(prompt).strip()
    return response if response else default

def main():
    try:
        # Title
        print('\n╔══════════════════════════════════════════════════════════════════╗')
        print('║                   🕷️  WEBSITE CRAWLER CLI  🕷️                     ║')
        print('║                                                                  ║')
        print('║  Download entire websites - all pages, assets, and external links║')
        print('╚══════════════════════════════════════════════════════════════════╝')
        
        # Get URL
        url = get_input('\n🌍 Enter website URL', 'https://example.com')
        if not url.startswith('http'):
            url = 'https://' + url
        
        # Output dir
        output_dir = get_input('\n📁 Output directory', 'website_crawl')
        
        # Follow external
        follow_external_input = get_input('\n🔗 Follow external links? (y/n)', 'y').lower()
        follow_external = follow_external_input != 'n'
        
        # Max workers
        max_workers_input = get_input('⚡ Max concurrent downloads (1-20)', '5')
        try:
            max_workers = int(max_workers_input)
            max_workers = max(1, min(20, max_workers))
        except:
            max_workers = 5
        
        # Max pages
        max_pages_input = get_input('📄 Max pages (leave empty for unlimited)', '')
        try:
            max_pages = int(max_pages_input) if max_pages_input else None
        except:
            max_pages = None
        
        # Start crawling
        crawler = InteractiveWebsiteCrawler(
            url,
            output_dir=output_dir,
            follow_external=follow_external,
            max_pages=max_pages,
            max_workers=max_workers,
            verbose=True
        )
        
        crawler.crawl()
        
    except KeyboardInterrupt:
        print('\n\n⚠️  Crawl interrupted by user')
        sys.exit(0)
    except Exception as e:
        print(f'\n❌ Error: {e}')
        sys.exit(1)

if __name__ == "__main__":
    main()
