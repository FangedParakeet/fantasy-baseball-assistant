#!/usr/bin/env python3
"""
Debug script for MLB Stats API
Shows raw API response data in readable format
"""

import requests
import json
from datetime import datetime, timedelta

def get_yesterday():
    """Get yesterday's date in YYYY-MM-DD format"""
    yesterday = datetime.now() - timedelta(days=1)
    return yesterday.strftime('%Y-%m-%d')

def debug_mlb_api():
    """Debug MLB Stats API by showing raw response data"""
    yesterday = get_yesterday()
    print(f"🔍 Debugging MLB Stats API for {yesterday}")
    print("=" * 60)
    
    # Get yesterday's schedule
    schedule_url = "https://statsapi.mlb.com/api/v1/schedule"
    params = {
        'sportId': 1,
        'startDate': yesterday,
        'endDate': yesterday
    }
    
    try:
        print("📅 Fetching schedule...")
        response = requests.get(schedule_url, params=params)
        
        if response.status_code != 200:
            print(f"❌ Error: {response.status_code}")
            return
            
        schedule_data = response.json()
        dates = schedule_data.get('dates', [])
        
        if not dates:
            print("❌ No games found for yesterday")
            return
            
        games = dates[0].get('games', [])
        print(f"✅ Found {len(games)} games")
        print()
        
        # Show first game with full boxscore data
        if games:
            game = games[0]
            game_pk = game['gamePk']
            
            print(f"🏟️  Game: Game ID {game_pk}")
            print(f"📋 Schedule Game Data:")
            print(json.dumps(game, indent=2))
            print()
            
            # Get boxscore for this game
            boxscore_url = f"https://statsapi.mlb.com/api/v1/game/{game_pk}/boxscore"
            box_response = requests.get(boxscore_url)
            
            if box_response.status_code == 200:
                box_data = box_response.json()
                print(f"📊 Boxscore Data:")
                print(json.dumps(box_data, indent=2))
            else:
                print(f"❌ Boxscore error: {box_response.status_code}")
        else:
            print("❌ No games found")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    debug_mlb_api() 