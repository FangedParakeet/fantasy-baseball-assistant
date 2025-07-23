import unicodedata
import re

def chunked(iterable, size):
    for i in range(0, len(iterable), size):
        yield iterable[i:i + size]

def normalise_name(name):
    if not name:
        return ''
    
    # Handle "Last, First" format from statcast
    if ',' in name:
        parts = name.split(',', 1)
        if len(parts) == 2:
            last_name = parts[0].strip()
            first_name = parts[1].strip()
            # Convert to "First Last" format
            name = f"{first_name} {last_name}"
    
    # Remove accents, lowercase, remove punctuation/extra spaces
    name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode('utf-8')
    name = re.sub(r'[^\w\s]', '', name)
    return ' '.join(name.lower().split())
