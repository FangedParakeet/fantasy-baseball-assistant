import unicodedata
import pandas as pd
import re
from datetime import timezone
import pytz
from dateutil.parser import parse
from utils.constants import CURRENT_TIMEZONE

def chunked(iterable, size):
    for i in range(0, len(iterable), size):
        yield iterable[i:i + size]

# Helper function to handle NaN values
def safe_value(val):
    if pd.isna(val):
        return 0
    return val

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

def convert_utc_date(utc_str):
    if not utc_str or utc_str == 'unknown':
        return None
    try:
        utc_date = parse(utc_str)
        if not utc_date.tzinfo:
            utc_date = utc_date.replace(tzinfo=timezone.utc)
        current_timezone = pytz.timezone(CURRENT_TIMEZONE)
        converted_date = utc_date.astimezone(current_timezone)
        return converted_date.date()
    except Exception as e:
        return None