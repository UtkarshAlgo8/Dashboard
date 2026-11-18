#!/usr/bin/env python3
"""Extract data only (never executable HTML/JS) from the supplied PdM export."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("html", type=Path)
args = parser.parse_args()
source = args.html.read_text()
marker = "const D = "
start = source.index(marker) + len(marker)
data, _ = json.JSONDecoder().raw_decode(source[start:])
target = Path(__file__).resolve().parents[1] / "public/anomaly/quintoplex-demo.json"
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n")
print(f"Extracted {len(data['tags'])} tags, {len(data['ses'])} equipment, "
      f"{len(data['episodes'])} episodes to {target}")
