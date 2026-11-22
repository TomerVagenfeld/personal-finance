window.PF = window.PF || {};
PF.importParse = (function () {

  async function readWorkbook(file) {
    const buf = await file.arrayBuffer();
    // Deliberately NOT using cellDates: true — SheetJS's serial->JS Date
    // conversion can land a hair before midnight (float precision in the
    // stored serial) and roll the calendar day back by one. Decoding the
    // raw numeric serial via XLSX.SSF.parse_date_code (below) avoids that.
    return XLSX.read(buf, { type: "array" });
  }

  function sheetRows(workbook, sheetName) {
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  }

  // Normalize a header cell: collapse embedded newlines/whitespace, trim quotes.
  function normHeader(cell) {
    if (cell == null) return "";
    return String(cell).replace(/\s+/g, " ").trim();
  }

  // Find the row index whose cells' normalized text matches ALL of `mustContain`
  // (order-independent), searching at most the first `maxScan` rows.
  function findHeaderRow(rows, mustContain, maxScan = 10) {
    const limit = Math.min(rows.length, maxScan);
    for (let i = 0; i < limit; i++) {
      const normalized = rows[i].map(normHeader);
      const ok = mustContain.every(needle => normalized.some(c => c.includes(needle)));
      if (ok) return i;
    }
    return -1;
  }

  function colIndex(headerRow, needle) {
    const normalized = headerRow.map(normHeader);
    return normalized.findIndex(c => c.includes(needle));
  }

  // Parse a date cell into "YYYY-MM-DD". Handles raw Excel date serials
  // (via XLSX.SSF, rounded to the nearest day to shrug off float noise),
  // "DD.MM.YY"/"DD.MM.YYYY"/"DD/MM/YYYY" strings, and JS Date objects.
  function parseIsraeliDate(value) {
    if (typeof value === "number" && isFinite(value)) {
      const decoded = XLSX.SSF.parse_date_code(Math.round(value));
      if (!decoded) return null;
      return `${decoded.y}-${String(decoded.m).padStart(2, "0")}-${String(decoded.d).padStart(2, "0")}`;
    }
    if (value instanceof Date) {
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    }
    if (typeof value === "string") {
      const m = value.trim().match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
      if (m) {
        let [, d, mo, y] = m;
        if (y.length === 2) y = "20" + y;
        return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
    }
    return null;
  }

  return { readWorkbook, sheetRows, normHeader, findHeaderRow, colIndex, parseIsraeliDate };
})();
