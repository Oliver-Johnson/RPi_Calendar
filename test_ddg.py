from ddgs import DDGS
q = '"Graduate" Technology Data Science Analysis Cybersecurity AI (job OR jobs OR careers)'
with DDGS() as ddgs:
    try:
        results = list(ddgs.text(q, backend='api', max_results=10))
        print(f'Results: {len(results)}')
    except Exception as e:
        print(f'API Error: {e}')
