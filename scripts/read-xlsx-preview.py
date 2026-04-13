#!/usr/bin/env python3
"""
XLSX ning birinchi varag'ini konsolga chiqarish (openpyxl talab qilinmaydi).
Ishlatish: python scripts/read-xlsx-preview.py "yo'l\\fayl.xlsx"
"""
from __future__ import annotations

import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def col_letters(ref: str) -> str:
    return re.sub(r"\d+", "", ref or "")


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python scripts/read-xlsx-preview.py <file.xlsx>", file=sys.stderr)
        sys.exit(2)
    path = sys.argv[1]

    with zipfile.ZipFile(path) as z:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            sxml = z.read("xl/sharedStrings.xml").decode("utf-8")
            sroot = ET.fromstring(sxml)
            for si in sroot.findall(f".//{NS}si"):
                parts: list[str] = []
                for t in si.findall(f".//{NS}t"):
                    if t.text:
                        parts.append(t.text)
                shared.append("".join(parts))

        xml = z.read("xl/worksheets/sheet1.xml").decode("utf-8")
        root = ET.fromstring(xml)
        rows = root.findall(f".//{NS}row")
        for row in rows:
            cells: dict[str, str] = {}
            for c in row.findall(f"{NS}c"):
                ref = c.attrib.get("r", "")
                col = col_letters(ref)
                t = c.attrib.get("t")
                v = c.find(f"{NS}v")
                is_el = c.find(f"{NS}is")
                val = ""
                if v is not None and v.text is not None:
                    val = v.text
                    if t == "s":
                        val = shared[int(val)] if val.isdigit() and int(val) < len(shared) else val
                elif is_el is not None:
                    for te in is_el.findall(f".//{NS}t"):
                        if te.text:
                            val += te.text
                if val or col:
                    cells[col] = val
            if cells:
                keys = sorted(cells.keys(), key=lambda x: (len(x), x))
                line = " | ".join(f"{k}={cells[k]}" for k in keys)
                print(line)


if __name__ == "__main__":
    main()
