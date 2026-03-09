import re

def refactor_scraper():
    with open('scripts/scraper.py', 'r', encoding='utf-8') as f:
        code = f.read()

    # 1. Imports and _smart_fetch
    code = code.replace("from playwright.sync_api import sync_playwright", "from scrapling import Fetcher, StealthyFetcher")
    
    smart_fetch_func = """def _smart_fetch(url):
    '''
    Attempts to fetch a URL using standard requests first to save RAM and time.
    If it detects bot protection (like Cloudflare), it falls back to a stealthy headless browser.
    Returns the parsed text and raw HTML.
    '''
    try:
        page = Fetcher.get(url)
        text = str(page.text).lower()
        html = str(page.text)
        status = page.status
    except Exception as e:
        print(f"    -> SmartFetch (HTTP) error for {url}: {e}")
        text, html, status = "", "", 500

    bot_indicators = ['just a moment', 'cloudflare', 'attention required', 'security verification']
    
    is_blocked = status in [403, 503] or any(ind in text for ind in bot_indicators)
    is_empty_spa = len(text) < 500 and status == 200
    
    if is_blocked or is_empty_spa:
        print(f"    -> Bot wall or SPA detected on {url}. Upgrading to StealthyFetcher...")
        try:
            StealthyFetcher.configure(headless=True)
            stealth_page = StealthyFetcher.get(url)
            text = str(stealth_page.text).lower()
            html = str(stealth_page.text)
        except Exception as e:
            print(f"    -> SmartFetch (Stealth) error for {url}: {e}")
            text, html = "", ""
            
    return text, html

def search_duckduckgo_lite(query):"""

    code = re.sub(r'import random\n\ndef get_headers\(\):.*?return \{.*?\n    \}\n\ndef search_duckduckgo_lite\(query, context\):', smart_fetch_func, code, flags=re.DOTALL)

    # 2. verify_job_listing signature and Playwright removal
    verify_start_replacement = """def verify_job_listing(url):
    '''
    Fetches the destination URL using adaptive Scrapling and runs a heuristic check to see if it looks
    like a genuine, active job posting (rather than a 404, list of jobs, or expired page).
    Returns (is_valid, company_name_guess, deadline_string, text)
    '''
    import re
    import dateparser
    from bs4 import BeautifulSoup
    
    try:
        text_raw, html_raw = _smart_fetch(url)
        
        if not html_raw:
            return False, "Unknown", None, ""
            
        soup = BeautifulSoup(html_raw, 'html.parser')
        text = soup.get_text(separator=' ', strip=True).lower()
        html = html_raw.lower()"""

    code = re.sub(r'def verify_job_listing\(url, context\):.*?page = None\n\s+try:[^\n]*\n\s+# Create a new page.*?\n\s+page = context\.new_page\(\)[^\n]*\n\s+# Navigate and wait.*?\n\s+response = page\.goto[^\n]*\n\s+# Some job boards.*?\n\s+if not response or not response\.ok:[^\n]*\n\s+return False, "Unknown", None, ""[^\n]*\n\s+# Give JS a moment.*?\n\s+page\.wait_for_timeout[^\n]*\n\s+html = page\.content\(\)\.lower\(\)\n\s+# Use BeautifulSoup.*?\n\s+# This prevents.*?\n\s+from bs4 import BeautifulSoup\n\s+soup = BeautifulSoup\(html, \'html\.parser\'\)\n\s+text = soup\.get_text\(separator=\' \', strip=True\)\.lower\(\)', verify_start_replacement, code, flags=re.DOTALL)

    verify_end_replacement = """except Exception as e:
        print(f"    -> Connection error verifying {url}: {e}")
        return False, "Unknown", None, \"\"\""""

    code = re.sub(r'except Exception as e:[^\n]*\n\s+print\(f"    -> Connection error verifying[^\n]*\n\s+return False, "Unknown", None, ""[^\n]*\n\s+finally:[^\n]*\n\s+if page:[^\n]*\n\s+page\.close\(\)', verify_end_replacement, code)

    # 3. scrape_job_board_links
    spider_start_replace = """def scrape_job_board_links(board_url):
    '''
    Visits a direct job board URL using adaptive Scrapling and extracts all potential job posting links.
    '''
    from bs4 import BeautifulSoup
    import urllib.parse
    import tldextract
    
    try:
        print(f"  -> Spidering Job Board: {board_url}")
        text_raw, html_raw = _smart_fetch(board_url)
        
        if not html_raw:
            return []
            
        soup = BeautifulSoup(html_raw, 'html.parser')
        all_links = []
        for a in soup.find_all('a', href=True):
            href = a['href']
            # Resolve relative URLs
            absolute_url = urllib.parse.urljoin(board_url, href)
            all_links.append(absolute_url)"""

    code = re.sub(r'def scrape_job_board_links\(board_url, context\):.*?page = None\n\s+try:[^\n]*\n\s+page = context\.new_page\(\)[^\n]*\n\s+page\.route[^\n]*\n\s+print\(f"  -> Spidering Job Board:[^\n]*\n\s+page\.goto[^\n]*\n\s+page\.wait_for_timeout[^\n]*\n\s+all_links = page\.locator[^\n]*', spider_start_replace, code, flags=re.DOTALL)

    code = re.sub(r'except Exception as e:[^\n]*\n\s+print\(f"  -> Error spidering board[^\n]*\n\s+return \[\]\n\s+finally:[^\n]*\n\s+if page:[^\n]*\n\s+page\.close\(\)', """except Exception as e:\n        print(f"  -> Error spidering board {board_url}: {e}")\n        return []""", code)

    # 4. _do_scrape
    do_scrape_target = r'with sync_playwright\(\) as p:[^\n]*\n\s+# Launch Chromium.*?browser = p\.chromium\.launch\(headless=True\)[^\n]*\n\s+# Create a persistent browser.*?context = browser\.new_context\([^)]+\)[^\n]*\n\s+# 1\. Process DuckDuckGo Keyword Searches\n\s+for search in active_searches:'
    code = re.sub(do_scrape_target, """# 1. Process DuckDuckGo Keyword Searches\n    for search in active_searches:""", code, flags=re.DOTALL)

    code = code.replace("search_duckduckgo_lite(search.search_term, context)", "search_duckduckgo_lite(search.search_term)")
    code = code.replace("verify_job_listing(item['url'], context)", "verify_job_listing(item['url'])")
    code = code.replace("scrape_job_board_links(board.url, context)", "scrape_job_board_links(board.url)")
    code = code.replace("verify_job_listing(link, context)", "verify_job_listing(link)")

    code = re.sub(r'print\("  -> Closing Headless Browser\."\)\n\s+context\.close\(\)\n\s+browser\.close\(\)', "", code)

    # Re-indent exactly 4 spaces off for the block under _do_scrape from Process DuckDuckGo to the end
    lines = code.split('\n')
    in_block = False
    for i, line in enumerate(lines):
        if '# 1. Process DuckDuckGo Keyword Searches' in line:
            in_block = True
        elif 'if __name__ == "__main__":' in line:
            in_block = False
            
        if in_block and line.startswith('    ') and not line.strip() == '# 1. Process DuckDuckGo Keyword Searches':
            lines[i] = line[4:] # unindent exactly 4 spaces

    with open('scripts/scraper.py', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

if __name__ == "__main__":
    refactor_scraper()
