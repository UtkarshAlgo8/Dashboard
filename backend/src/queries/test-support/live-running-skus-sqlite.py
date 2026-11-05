"""Execute production CTEs through stdlib SQLite without installing dependencies.

Only Athena dialect constructs are adapted; roster, ranking, joins and status
logic run unchanged. This is semantic fixture coverage, not an Athena parser test.
"""
import datetime
import json
import re
import sqlite3
import sys

payload = json.load(sys.stdin)
sql = payload['sql']
sql = re.sub(r"SELECT\s+CAST\(format_datetime\(current_timestamp AT TIME ZONE 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss.SSS'\) AS timestamp\) AS as_of", "SELECT '" + payload['asOf'] + "' AS as_of", sql, flags=re.I)
sql = re.sub(r"\bsilver\.(\w+)", r"\1", sql)
sql = re.sub(r"CAST\(([pc]\.event_time) AS timestamp\)", r"\1", sql, flags=re.I)
sql = re.sub(r"k\.as_of - INTERVAL '168' HOUR", "datetime(k.as_of, '-168 hours')", sql)
sql = re.sub(r"cfg AS \(\s*SELECT \* FROM \(VALUES(.*?)\)\s+AS cfg\(source_machine, section, sub_section, run_window_min\)\s*\)", r"cfg(source_machine, section, sub_section, run_window_min) AS (VALUES\1)", sql, flags=re.S)
sql = re.sub(r'\btry_cast\(', 'CAST(', sql, flags=re.I)
sql = sql.replace("format_datetime(c.last_event_time, 'yyyy-MM-dd HH:mm:ss')", "strftime('%Y-%m-%d %H:%M:%S', c.last_event_time)")

db = sqlite3.connect(':memory:')
db.row_factory = sqlite3.Row
db.create_function('chr', 1, chr)
db.create_function('to_unixtime', 1, lambda s: datetime.datetime.fromisoformat(s).timestamp() if s else None)
db.create_function('concat', -1, lambda *parts: ''.join(str(p) for p in parts if p is not None))
db.create_function('translate', 3, lambda s, chars, _: s.translate(str.maketrans('', '', chars)) if s else s)
db.create_function('regexp_replace', 3, lambda s, pattern, replacement: re.sub(pattern, replacement, s) if s else s)
db.create_function('regexp_like', 2, lambda s, pattern: bool(re.search(pattern, s)) if s else False)
schemas = {
    'fct_o_production': 'source_machine machine_no item_code item_name event_time record_id',
    'fct_tbmpcr': 'wc_id recipe_id event_time barcode',
    'fct_curingpcr': 'wc_id recipe_id event_time barcode',
    'dim_wcmaster': 'record_id name',
    'dim_recipemaster': 'record_id description name',
    'dim_tblitemmaster': 'item_code description is_current',
    'dim_bom': 'plcbomname materialcode_o revision',
}
for name, fields in schemas.items():
    columns = fields.split()
    db.execute('CREATE TABLE ' + name + '(' + ','.join(c + ' TEXT' for c in columns) + ')')
    for row in payload['tables'][name]:
        db.execute('INSERT INTO ' + name + ' VALUES (' + ','.join('?' for _ in columns) + ')', [row.get(c) for c in columns])
print(json.dumps([dict(row) for row in db.execute(sql)]))
