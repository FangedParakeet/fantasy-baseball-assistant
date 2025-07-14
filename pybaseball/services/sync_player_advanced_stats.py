from collections import defaultdict
from models.db import get_db_connection
from models.logger import logger
from utils.constants import BATCH_SIZE, LEAGUE_ERA, LEAGUE_WOBA
from utils.functions import chunked, normalise_name

def compute_league_averages(stats):
    era_by_period = {}
    woba_by_period = {}

    grouped = defaultdict(list)
    for row in stats:
        grouped[row['stat_period']].append(row)

    for period, rows in grouped.items():
        total_ip = 0
        total_er = 0
        total_ab = 0
        total_h = 0
        total_hr = 0
        total_bb = 0
        total_sf = 0
        total_hbp = 0  # Not tracked; assumed 0 for now

        for r in rows:
            ip = r['ip'] or 0
            era = r['era'] or 0
            ab = r['ab'] or 0
            h = r['h'] or 0
            hr = r['hr'] or 0
            bb = r['bb'] or 0
            sf = r['sf'] or 0

            total_ip += ip
            total_er += (era * ip / 9) if ip else 0
            total_ab += ab
            total_h += h
            total_hr += hr
            total_bb += bb
            total_sf += sf

        # ERA = (ER / IP) * 9
        league_era = (9 * total_er / total_ip) if total_ip else 0

        # Crude wOBA: simplified with approximated weights
        singles = total_h - total_hr
        woba_numerator = (0.69 * total_bb) + (0.72 * total_hbp) + (0.89 * singles) + (2.10 * total_hr)
        woba_denominator = total_ab + total_bb + total_hbp + total_sf
        league_woba = woba_numerator / woba_denominator if woba_denominator > 0 else 0

        era_by_period[period] = league_era
        woba_by_period[period] = league_woba

    return era_by_period, woba_by_period

def calc_advanced_stats(row, league_era, league_woba):
    try:
        # Basic vars
        ab = row['ab']
        h = row['h']
        hr = row['hr']
        bb = row['bb']
        sf = row['sf']
        k = row['k']
        ip = row['ip']
        era = row['era']
        qs = row['qs']
        g = row['games']

        # BABIP
        babip = (h - hr) / (ab - k - hr + sf) if (ab - k - hr + sf) > 0 else 0

        # FIP
        fip = ((13 * hr + 3 * bb - 2 * k) / ip) + 3.2 if ip > 0 else 0

        # ERA-
        era_minus = 100 * (era / league_era) if league_era > 0 else 0

        # K%, BB%, HR/9
        k_perc = k / ab if ab > 0 else 0
        bb_perc = bb / ab if ab > 0 else 0
        hr_per_9 = (9 * hr) / ip if ip > 0 else 0

        # QS%
        qs_perc = qs / g if g > 0 else 0

        # wOBA / wRC+
        woba = ((0.69 * bb) + (0.72 * hbp) + (1.95 * hr) + (0.9 * (h - hr))) / (ab + bb + hbp + sf)
        wrc_plus = 100 * (woba / league_woba) if league_woba > 0 else 100

        return babip, fip, era_minus, woba, wrc_plus, k_perc, bb_perc, hr_per_9, qs_perc

    except Exception as e:
        logger.warning(f"Failed to calculate stats: {e}")
        return [0] * 9


def main():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    insert_cursor = conn.cursor()

    cursor.execute("SELECT * FROM player_stats")
    rows = cursor.fetchall()

    league_era_by_period, league_woba_by_period = compute_league_averages(rows)

    batch = []
    for row in rows:
        period = row['stat_period']
        era = league_era_by_period.get(period, LEAGUE_ERA)
        woba = league_woba_by_period.get(period, LEAGUE_WOBA)
        normalised_name = row['normalised_name']

        stats = calc_advanced_stats(row, era, woba, normalised_name)
        if stats:
            batch.append(stats)

    for batch in chunked(batch, BATCH_SIZE):
        insert_cursor.executemany("""
            INSERT INTO player_stats_advanced (player_id, stat_period, babip, fip, era_minus, woba, wrc_plus, k_perc, bb_perc, hr_per_9, qs_perc, normalised_name)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                babip=VALUES(babip), fip=VALUES(fip), era_minus=VALUES(era_minus),
                woba=VALUES(woba), wrc_plus=VALUES(wrc_plus), k_perc=VALUES(k_perc),
                bb_perc=VALUES(bb_perc), hr_per_9=VALUES(hr_per_9), qs_perc=VALUES(qs_perc), normalised_name=VALUES(normalised_name)
        """, batch)

    conn.commit()
    logger.info("Advanced player stats synced.")

if __name__ == "__main__":
    main()
