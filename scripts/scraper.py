import os
import sys
import time
import requests
from bs4 import BeautifulSoup
from datetime import datetime
from dotenv import load_dotenv

# Add the project directory to the sys.path so we can import the app
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app, db
from app.models import JobSearch, JobListing, JobBoard
from scrapling import Fetcher, StealthyFetcher
import tldextract

def _smart_fetch(url):
    '''
    Attempts to fetch a URL using standard requests first to save RAM and time.
    If it detects bot protection (like Cloudflare), it falls back to a stealthy headless browser.
    Returns the parsed text and raw HTML.
    '''
    try:
        page = Fetcher.get(url)
        html = page.body.decode('utf-8', errors='ignore')
        text = html.lower()
        status = page.status
    except Exception as e:
        print(f"    -> SmartFetch (HTTP) error for {url}: {e}")
        text, html, status = "", "", 500

    bot_indicators = ['just a moment', 'cloudflare', 'attention required', 'security verification']
    
    is_blocked = status in [403, 503] or any(ind in text for ind in bot_indicators)
    is_empty_spa = len(text) < 500 and status == 200
    
    known_spas = ['greenhouse.io', 'lever.co', 'workday', 'myworkdayjobs.com']
    is_known_spa = any(spa in url.lower() for spa in known_spas)
    
    if is_blocked or is_empty_spa or is_known_spa:
        print(f"    -> Bot wall or SPA detected on {url}. Upgrading to StealthyFetcher...")
        try:
            stealth_page = StealthyFetcher.fetch(url, headless=True)
            html = stealth_page.body.decode('utf-8', errors='ignore')
            text = html.lower()
        except Exception as e:
            print(f"    -> SmartFetch (Stealth) error for {url}: {e}")
            text, html = "", ""
            
    return text, html

def search_duckduckgo_lite(query):
    """
    Uses the official duckduckgo_search library's internal API to bypass bot defenses.
    Returns a list of dicts: {'title': str, 'url': str}
    """
    from ddgs import DDGS
    
    results = []
    
    # Auto-append job-related keywords to filter out generic articles, 
    # unless the user already included them in their query
    query_lower = query.lower()
    if not any(word in query_lower for word in ['job', 'jobs', 'career', 'careers']):
        query = f'{query} (job OR jobs OR careers)'
        
    print(f"  -> Q: {query}")
    try:
        with DDGS() as ddgs:
            # Request up to 30 results for a broader net using the api backend
            ddg_results = list(ddgs.text(query, backend='api', max_results=30))
            
            for item in ddg_results:
                link = item.get('href')
                title = item.get('title', '')
                
                # Exclude internal DDG links just in case
                if not link or link.startswith('/') or 'duckduckgo.com' in link:
                    continue
                
                results.append({
                    'title': title,
                    'url': link
                })
                
    except Exception as e:
        print(f"  -> Error API searching for '{query}': {e}")
        
    return results

def verify_job_listing(url):
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
        html = html_raw.lower()
        
        # Try to find exactly what the <title> tag contains
        page_title = "Unknown Job"
        title_tag = soup.find('title')
        if title_tag and title_tag.string:
            # Often ATS systems prefix/suffix the company name. We'll strip common suffixes.
            raw_title = title_tag.string.strip()
            # Basic cleanup if it's "Job Title at Company" or "Company - Job Title"
            if " at " in raw_title:
                raw_title = raw_title.split(" at ")[0].strip()
            if " - " in raw_title:
                raw_title = raw_title.split(" - ")[0].strip()
            page_title = raw_title
        
        # Negative URL Patterns (Academic Courses/Programs/Universities and Blogs)
        url_lower = url.lower()
        academic_domains = ['.edu', '.ac.', 'university', '/uni.', '.uni.', 'college', '.sch.', 'institute', 'academy', 'ed.ac.uk', '.edu.au', '.edu.cn']
        academic_paths = ['/course/', '/courses/', '/study/', '/degree/', '/masters/', '/phd/', '/postgraduate/', '/undergraduate/', '/admissions/', '/student/', '/academics/', '/alumni/']
        blog_paths = ['/blog/', '/news/', '/article/', '/post/', '/story/']
        
        if any(path in url_lower for path in academic_domains + academic_paths + blog_paths):
            return False, "Unknown", None, "", "Unknown Job"

        # Negative Keywords (Expired, 404, or Academic Programs)
        negative_phrases = [
            # Job status negatives
            "this job has expired",
            "job is no longer available",
            "no longer accepting applications",
            "position has been filled",
            "applications are currently closed",
            "applications closed",
            "page not found",
            "404 not found",
            # Academic course negatives
            "tuition fees",
            "course fees",
            "scholarship",
            "entry requirements",  # Often used by unis instead of job qualifications
            "degree programme",
            "course overview"
        ]
        for phrase in negative_phrases:
            if phrase in html:
                return False, "Unknown", None, "", "Unknown Job"
                
        # Positive Keywords (Active Job Posting)
        positive_phrases = [
            "apply now",
            "apply online now",
            "apply online",
            "apply for this job",
            "job description",
            "role requirements",
            "years of experience",
            "qualifications",
            "responsibilities"
        ]
        matched_positives = [phrase for phrase in positive_phrases if phrase in text]
        score = len(matched_positives)
        
        # Heuristic: If we hit at least 2 positive keywords, OR if we have a direct application link, it's a job
        direct_apply_phrases = ["apply now", "apply online now", "apply online", "apply for this job"]
        is_valid = score >= 2 or any(phrase in matched_positives for phrase in direct_apply_phrases)

        # Better company name extraction using tldextract
        import tldextract
        ext = tldextract.extract(url)
        company = ext.domain.capitalize() if ext.domain else "Unknown"
        
        deadline_str = None
        if is_valid:
            # Heuristic application deadline extraction
            deadline_patterns = [
                r'(?:closing date|apply by|deadline|closes|applications close|submit your application by|apply before|application deadline)[\s:]*([a-zA-Z0-9\s/,-]{3,20})',
            ]
            for pattern in deadline_patterns:
                match = re.search(pattern, text)
                if match:
                    date_cand = match.group(1).strip()
                    parsed_date = dateparser.parse(date_cand, settings={'STRICT_PARSING': False})
                    
                    if parsed_date:
                        # If the deadline has already passed, invalidate this job completely
                        if parsed_date < datetime.now():
                            is_valid = False
                            break
                        else:
                            deadline_str = parsed_date.strftime("%b %d, %Y")
                            break
        
        return is_valid, company, deadline_str, text, page_title
        
    except Exception as e:
        print(f"    -> Connection error verifying {url}: {e}")
        return False, "Unknown", None, "", "Unknown Job"
from flask import has_app_context
import threading

# Thread-safe global state for UI polling
_is_scraping = False
_scrape_lock = threading.Lock()

def is_scraping_now():
    with _scrape_lock:
        return _is_scraping

def run_scraper():
    global _is_scraping
    with _scrape_lock:
        if _is_scraping:
            print("\n--- Scrape already in progress. Skipping ---")
            return
        _is_scraping = True

    try:
        print(f"\n--- Starting Job Scraper Run at {datetime.now()} ---")
        if not has_app_context():
            app = create_app()
            with app.app_context():
                _do_scrape()
        else:
            _do_scrape()
        print("--- Scraper Run Complete ---\n")
    finally:
        with _scrape_lock:
            _is_scraping = False

def matches_search_query(query_str, text):
    """
    Evaluates if the scraped text matches the user's JobSearch query string.
    Query format is like: '"Software Engineer" python -senior -lead'
    """
    import re
    text = text.lower()
    
    # Extract must-include (quoted strings)
    must_matches = re.findall(r'"([^"]+)"', query_str.lower())
    # Extract excludes (words starting with -)
    excludes = re.findall(r'-(\S+)', query_str.lower())
    
    # If there's no quote, treat the whole query (minus excludes) as a must
    if not must_matches:
        clean_q = re.sub(r'-\S+', '', query_str.lower()).strip()
        if clean_q:
            must_matches.append(clean_q)
            
    for ex in excludes:
        if ex and ex in text:
            return False
            
    for must in must_matches:
        if must and must not in text:
            return False
            
    return True

def scrape_job_board_links(board_url):
    """
    Visits a direct job board URL using adaptive Scrapling and extracts all potential job posting links.
    """
    from bs4 import BeautifulSoup
    import urllib.parse
    
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
            all_links.append(absolute_url)
        
        valid_links = set()
        job_indicators = ['/job/', '/career/', '/vacanc', '/req/', '/position/', '/role/', '/posting/']
        negative_indicators = ['/search/', '/category/', '/tag/', '/author/', '/page/', '?page=', 'login', 'signup', 'forgot', '/cookies', '/about']
        board_domain = tldextract.extract(board_url).domain
        
        for link in all_links:
            link_lower = link.lower()
            if link_lower.startswith('http'):
                if any(neg in link_lower for neg in negative_indicators):
                    continue
                    
                # Gradcracker specific direct job rule
                if 'gradcracker' in board_domain and ('/graduate-job/' in link_lower or '/work-placement/' in link_lower or '/internship/' in link_lower or '/degree-apprenticeship/' in link_lower):
                    valid_links.add(link)
                    continue
                    
                # 1: Contains job indicators in path
                if any(ind in link_lower for ind in job_indicators):
                    valid_links.add(link)
                # 2: Known ATS deep links
                elif any(ats in link_lower for ats in ['greenhouse.io', 'lever.co', 'workday', 'myworkdayjobs.com']) and link.strip('/').count('/') >= 4:
                    valid_links.add(link)
                # 3: Internal link deep path
                elif board_domain in link_lower and link.strip('/').count('/') > 3:
                    pass
                    
        return list(valid_links)
    except Exception as e:
        print(f"  -> Error spidering board {board_url}: {e}")
        return []

def _do_scrape():
    # Get all active searches and job boards
    active_searches = JobSearch.query.filter_by(is_active=True).all()
    active_boards = JobBoard.query.filter_by(is_active=True).all()
    
    print(f"Found {len(active_searches)} active searches and {len(active_boards)} active job boards.")
    
    if not active_searches and not active_boards:
        return

    # If there are NO active searches, board scraping is useless since we can't classify/filter the jobs
    if active_boards and not active_searches:
        print("Warning: Job boards active, but no Active Searches to filter against! Skipping board scraping.")
        active_boards = []

    # 1. Process DuckDuckGo Keyword Searches
    for search in active_searches:
        print(f"\nProcessing Search: {search.name}")
        
        scraped_data = search_duckduckgo_lite(search.search_term)
        print(f"  -> Found {len(scraped_data)} results.")
        
        new_listings_count = 0
        for item in scraped_data:
            existing = JobListing.query.filter_by(url=item['url']).first()
            if not existing:
                is_valid, company_guess, deadline_str, text, _ = verify_job_listing(item['url'])
                if is_valid:
                    new_listing = JobListing(
                        search_id=search.id,
                        title=item['title'],
                        company=company_guess,
                        url=item['url'],
                        status='New',
                        deadline=deadline_str
                    )
                    db.session.add(new_listing)
                    new_listings_count += 1
        
        search.last_run = datetime.now()
        db.session.commit()
        print(f"  -> Inserted {new_listings_count} new listings.")
        
    # 2. Process Direct Job Boards
    for board in active_boards:
        print(f"\nProcessing Job Board: {board.name} ({board.url})")
        board_links = scrape_job_board_links(board.url)
        print(f"  -> Found {len(board_links)} potential job links on board.")
        
        new_listings_count = 0
        for link in board_links:
            existing = JobListing.query.filter_by(url=link).first()
            if not existing:
                is_valid, company_guess, deadline_str, text, page_title = verify_job_listing(link)
                if is_valid:
                    # Cross-reference against our active searches!
                    matching_search = None
                    for search in active_searches:
                        if matches_search_query(search.search_term, text):
                            matching_search = search
                            break
                            
                    if matching_search:
                        new_listing = JobListing(
                            search_id=matching_search.id,
                            title=page_title,
                            company=company_guess,
                            url=link,
                            status='New',
                            deadline=deadline_str
                        )
                        db.session.add(new_listing)
                        new_listings_count += 1
                    else:
                        # Job listing didn't match our search criteria
                        pass
                        
        db.session.commit()
        print(f"  -> Inserted {new_listings_count} new matching listings from board.")
        
    

if __name__ == "__main__":
    load_dotenv()
    run_scraper()
