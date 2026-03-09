from googlesearch import search
print("Testing basic google search:")
for r in search("python programming jobs", num_results=5, sleep_interval=2):
    print(r)
