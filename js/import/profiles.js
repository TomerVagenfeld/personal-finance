window.PF = window.PF || {};

// Each profile: detect(workbook) -> true/false, parse(workbook) -> array of
// { date, amount, payee, type: 'expense'|'income', categoryNameSuggestion, notes, suggestTransfer }
PF.importProfiles = (function () {
  const P = PF.importParse;

  // Cal (כאל) credit card export — ויזה/מאסטרקארד, multi-month, has ענף category column.
  const calCard = {
    id: "cal_card",
    label: "כרטיס אשראי (כאל / ישראכרט רב-חודשי)",
    detect(wb) {
      return wb.SheetNames.some(name => {
        const rows = P.sheetRows(wb, name);
        return P.findHeaderRow(rows, ["תאריך עסקה", "שם בית עסק", "סכום חיוב", "ענף"]) >= 0;
      });
    },
    parse(wb) {
      const out = [];
      for (const name of wb.SheetNames) {
        const rows = P.sheetRows(wb, name);
        const headerIdx = P.findHeaderRow(rows, ["תאריך עסקה", "שם בית עסק", "סכום חיוב", "ענף"]);
        if (headerIdx < 0) continue;
        const header = rows[headerIdx];
        const dateCol = P.colIndex(header, "תאריך עסקה");
        const payeeCol = P.colIndex(header, "שם בית עסק");
        const txnAmountCol = P.colIndex(header, "סכום עסקה");
        const billedAmountCol = P.colIndex(header, "סכום חיוב");
        const branchCol = P.colIndex(header, "ענף");
        const notesCol = P.colIndex(header, "הערות");
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const row = rows[i];
          const dateRaw = row[dateCol];
          const date = P.parseIsraeliDate(dateRaw);
          if (!date) continue; // skip footer/legal rows
          const billed = row[billedAmountCol];
          const txnAmt = row[txnAmountCol];
          const amount = (billed != null && billed !== "") ? Number(billed) : Number(txnAmt);
          if (!amount || isNaN(amount)) continue;
          out.push({
            date,
            amount: Math.abs(amount),
            type: "expense",
            payee: row[payeeCol] != null ? String(row[payeeCol]).trim() : "",
            categoryNameSuggestion: row[branchCol] != null ? String(row[branchCol]).trim() : null,
            notes: row[notesCol] != null ? String(row[notesCol]).trim() : ""
          });
        }
      }
      return out;
    }
  };

  // Cal (כאל) "פירוט עסקאות וזיכויים" — ALL cards on the account in one sheet,
  // one row per transaction, tagged with which physical card it was on (e.g.
  // "מאסטרקארד 1169", "ויזה 3256"). Different shape from the per-card `calCard`
  // profile above: single amount column (negative = credit/refund), no ענף
  // category column, but a כרטיס column — which is exactly what lets every row
  // get tagged with its real card automatically instead of one card per file.
  const calAllCards = {
    id: "cal_all_cards",
    label: "כרטיס אשראי (כאל - פירוט עסקאות וזיכויים, כל הכרטיסים)",
    detect(wb) {
      return wb.SheetNames.some(name => {
        const rows = P.sheetRows(wb, name);
        return P.findHeaderRow(rows, ["תאריך עסקה", "שם בית עסק", "כרטיס", "סוג עסקה"]) >= 0;
      });
    },
    parse(wb) {
      const out = [];
      for (const name of wb.SheetNames) {
        const rows = P.sheetRows(wb, name);
        const headerIdx = P.findHeaderRow(rows, ["תאריך עסקה", "שם בית עסק", "כרטיס", "סוג עסקה"]);
        if (headerIdx < 0) continue;
        const header = rows[headerIdx];
        const dateCol = P.colIndex(header, "תאריך עסקה");
        const payeeCol = P.colIndex(header, "שם בית עסק");
        const amountCol = P.colIndex(header, 'סכום בש"ח');
        const cardCol = P.colIndex(header, "כרטיס");
        const txnTypeCol = P.colIndex(header, "סוג עסקה");
        const notesCol = P.colIndex(header, "הערות");
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const row = rows[i];
          const date = P.parseIsraeliDate(row[dateCol]);
          if (!date) continue; // skips the trailing "סה"כ עסקאות..." + legal rows
          const rawAmount = Number(row[amountCol]);
          if (!rawAmount || isNaN(rawAmount)) continue; // 0-amount rows are just informational (e.g. PayBox sub-purchases already billed via the periodic PayBox charge on this same card)
          const txnType = row[txnTypeCol] != null ? String(row[txnTypeCol]).trim() : "";
          out.push({
            date,
            amount: Math.abs(rawAmount),
            type: rawAmount < 0 ? "income" : "expense", // negative = credit/refund ("זיכוי")
            payee: row[payeeCol] != null ? String(row[payeeCol]).trim() : "",
            categoryNameSuggestion: null,
            cardNameSuggestion: row[cardCol] != null ? String(row[cardCol]).trim() : null,
            notes: [txnType, row[notesCol] != null ? String(row[notesCol]).trim() : ""].filter(Boolean).join(" - ")
          });
        }
      }
      return out;
    }
  };

  // Isracard single-month card export (e.g. card 7801) — no category column.
  const isracardCard = {
    id: "isracard_card",
    label: "כרטיס אשראי (ישראכרט - פירוט חודשי)",
    detect(wb) {
      return wb.SheetNames.some(name => {
        const rows = P.sheetRows(wb, name);
        return P.findHeaderRow(rows, ["תאריך רכישה", "שם בית עסק", "סכום חיוב"]) >= 0;
      });
    },
    parse(wb) {
      const out = [];
      for (const name of wb.SheetNames) {
        const rows = P.sheetRows(wb, name);
        const headerIdx = P.findHeaderRow(rows, ["תאריך רכישה", "שם בית עסק", "סכום חיוב"]);
        if (headerIdx < 0) continue;
        const header = rows[headerIdx];
        const dateCol = P.colIndex(header, "תאריך רכישה");
        const payeeCol = P.colIndex(header, "שם בית עסק");
        const txnAmountCol = P.colIndex(header, "סכום עסקה");
        const billedAmountCol = P.colIndex(header, "סכום חיוב");
        const notesCol = P.colIndex(header, "פירוט נוסף");
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const row = rows[i];
          const date = P.parseIsraeliDate(row[dateCol]);
          if (!date) continue; // skips the "סה"כ לחיוב" total row + legal text
          if (row[payeeCol] == null || String(row[payeeCol]).includes('סה"כ')) continue;
          const billed = row[billedAmountCol];
          const txnAmt = row[txnAmountCol];
          const amount = (billed != null && billed !== "") ? Number(billed) : Number(txnAmt);
          if (!amount || isNaN(amount)) continue;
          out.push({
            date,
            amount: Math.abs(amount),
            type: "expense",
            payee: String(row[payeeCol]).trim(),
            categoryNameSuggestion: null,
            notes: row[notesCol] != null ? String(row[notesCol]).trim() : ""
          });
        }
      }
      return out;
    }
  };

  // Known descriptions on the bank ledger that are really credit-card-company
  // settlements for purchases already captured in detail via the card imports
  // above — flag these as transfers so they aren't double-counted as expenses.
  // NOTE: "ישראכרט בע"מ" (bare, no " - 1234" card-number suffix) is the Isracard
  // LOAN direct debit, not a card-purchase settlement — it must NOT be skipped,
  // or loan payments would silently vanish from the import. Only the suffixed
  // form ("ישראכרט בע"מ - 7801") is a card settlement.
  const CARD_SETTLEMENT_PATTERNS = [/ישראכרט בע"?מ\s*-\s*\d/, /עפ"?י הרשאה כאל/, /^כאל/, /ויזה/, /מאסטרקארד/];
  const LOAN_PAYMENT_PATTERNS = [/^ישראכרט בע"?מ$/];
  // "זיכוי מביט ..." = money moved from the Bit balance into this bank account —
  // a transfer between your own tracked accounts, not new income.
  const BIT_TRANSFER_PATTERNS = [/זיכוי מביט/];

  const bankLedger = {
    id: "bank_ledger",
    label: "בנק (תנועות עו\"ש)",
    detect(wb) {
      return wb.SheetNames.some(name => {
        const rows = P.sheetRows(wb, name);
        return P.findHeaderRow(rows, ["יתרה", "זכות", "חובה", "תיאור"]) >= 0;
      });
    },
    parse(wb) {
      const out = [];
      for (const name of wb.SheetNames) {
        const rows = P.sheetRows(wb, name);
        const headerIdx = P.findHeaderRow(rows, ["יתרה", "זכות", "חובה", "תיאור"]);
        if (headerIdx < 0) continue;
        const header = rows[headerIdx];
        const creditCol = P.colIndex(header, "זכות");
        const debitCol = P.colIndex(header, "חובה");
        const descCol = P.colIndex(header, "תיאור");
        const dateCol = P.colIndex(header, "תאריך ערך") >= 0 ? P.colIndex(header, "תאריך ערך") : P.colIndex(header, "תאריך");
        const refCol = P.colIndex(header, "אסמכתא");
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const row = rows[i];
          const date = P.parseIsraeliDate(row[dateCol]);
          if (!date) continue;
          const credit = row[creditCol];
          const debit = row[debitCol];
          const desc = row[descCol] != null ? String(row[descCol]).trim() : "";
          let amount, type;
          if (credit != null && credit !== "" && Number(credit) !== 0) {
            amount = Number(credit); type = "income";
          } else if (debit != null && debit !== "" && Number(debit) !== 0) {
            amount = Number(debit); type = "expense";
          } else continue;
          const looksLikeCardSettlement = CARD_SETTLEMENT_PATTERNS.some(re => re.test(desc));
          const looksLikeLoanPayment = !looksLikeCardSettlement && LOAN_PAYMENT_PATTERNS.some(re => re.test(desc));
          const looksLikeBitTransfer = !looksLikeCardSettlement && !looksLikeLoanPayment && BIT_TRANSFER_PATTERNS.some(re => re.test(desc));
          out.push({
            date,
            amount: Math.abs(amount),
            type,
            payee: desc,
            categoryNameSuggestion: looksLikeLoanPayment ? "הלוואה" : null,
            notes: refCol >= 0 && row[refCol] != null ? `אסמכתא ${row[refCol]}` : "",
            suggestTransfer: looksLikeCardSettlement,
            suggestLoanPayment: looksLikeLoanPayment,
            suggestBitTransfer: looksLikeBitTransfer
          });
        }
      }
      return out;
    }
  };

  const all = [calCard, calAllCards, isracardCard, bankLedger];

  function detectProfile(wb) {
    return all.find(p => p.detect(wb)) || null;
  }

  return { all, detectProfile, CARD_SETTLEMENT_PATTERNS, LOAN_PAYMENT_PATTERNS, BIT_TRANSFER_PATTERNS };
})();
