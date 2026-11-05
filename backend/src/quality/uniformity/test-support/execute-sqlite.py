"""Offline relational fixtures; translate only Athena date/page syntax, not query logic.

This is NOT real Athena dialect/transport validation. clock() deliberately keeps
source wall-clock fields, including when synthetic timestamps carry offsets.
"""
import json
import re
import sqlite3
import sys

payload = json.load(sys.stdin)
db = sqlite3.connect(':memory:')
db.row_factory = sqlite3.Row
db.execute("ATTACH DATABASE ':memory:' AS silver")
db.execute("ATTACH DATABASE ':memory:' AS gold")
def clock(value):
    if value is None:
        return None
    match = re.match(r'^(\d{4}-\d{2}-\d{2})[ T](\d\d:\d\d:\d\d)(?:\.(\d{1,3}))?', value)
    if not match:
        raise ValueError('invalid fixture clock')
    return match[1] + ' ' + match[2] + '.' + (match[3] or '').ljust(3, '0')
db.create_function('recorded_clock', 1, clock)
for table, spec in payload['tables'].items():
    db.execute('CREATE TABLE ' + table + ' (' + ', '.join('"' + c + '" ' + t for c, t in spec['columns'].items()) + ')')
    for row in spec['rows']:
        names = list(row)
        db.execute('INSERT INTO ' + table + ' (' + ','.join('"' + k + '"' for k in names) + ') VALUES (' + ','.join('?' for _ in names) + ')', [row[k] for k in names])
output = []
for sql in payload['queries']:
    sql = re.sub(r"CAST\(format_datetime\(event_time, 'yyyy-MM-dd HH:mm:ss.SSS'\) AS timestamp\)", 'recorded_clock(event_time)', sql)
    sql = re.sub(r"CAST\(b.test_clock - INTERVAL '7' HOUR AS DATE\)", "date(b.test_clock, '-7 hours')", sql)
    sql = re.sub(r"CAST\(DATE '([0-9-]+)' \+ INTERVAL '1' DAY AS timestamp\) \+ INTERVAL '7' HOUR", r"datetime('\1', '+1 day', '+7 hours')", sql)
    sql = re.sub(r"TIMESTAMP ('[^']*')", r'\1', sql)
    sql = re.sub(r'HOUR\(b.test_clock\)', "CAST(strftime('%H', b.test_clock) AS INTEGER)", sql)
    sql = re.sub(r'OFFSET (\d+) LIMIT (\d+)\s*$', r'LIMIT \2 OFFSET \1', sql)
    try:
        output.append([dict(r) for r in db.execute(sql).fetchall()])
    except Exception as exc:
        raise RuntimeError(str(exc) + '\n' + sql) from exc
json.dump(output, sys.stdout)
