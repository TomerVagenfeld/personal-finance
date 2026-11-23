window.PF = window.PF || {};

PF.dedupe = {
  // Strips the noise that makes the SAME merchant read as a different string
  // between a hand-typed entry and a bank/card statement's raw text ("בע"מ"
  // suffixes, dashes, branch names tacked on, extra whitespace), so fuzzy
  // matching can look past it instead of requiring a byte-for-byte match.
  normalizePayee(payee) {
    return (payee || "")
      .replace(/בע"מ|בעמ|ltd\.?|inc\.?/gi, "")
      .replace(/["'״׳]/g, "")
      .replace(/[-–—]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  },

  // Not an exact match, but "the same merchant" either way: identical after
  // normalizing, or one is a substring of the other (covers "סופר פארם"
  // written by hand vs. "סופר פארם בע"מ - רחובות" from a statement).
  payeeFuzzyMatch(a, b) {
    const na = PF.dedupe.normalizePayee(a), nb = PF.dedupe.normalizePayee(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    return na.includes(nb) || nb.includes(na);
  },

  datesClose(d1, d2, toleranceDays) {
    const t1 = new Date(d1).getTime(), t2 = new Date(d2).getTime();
    if (isNaN(t1) || isNaN(t2)) return false;
    return Math.abs(t1 - t2) <= toleranceDays * 86400000;
  },

  // Same type + account, exact amount, dates within a few days, fuzzy payee —
  // loose enough to catch "entered by hand, then imported from the real
  // statement" without amount/date drifting enough to risk false positives.
  DATE_TOLERANCE_DAYS: 3,
  looksLikeSameTransaction(a, b) {
    if (a.type !== b.type) return false;
    if (a.accountId !== b.accountId) return false;
    if (Math.abs(a.amount - b.amount) > 0.005) return false;
    if (!PF.dedupe.datesClose(a.date, b.date, PF.dedupe.DATE_TOLERANCE_DAYS)) return false;
    return PF.dedupe.payeeFuzzyMatch(a.payee, b.payee);
  },

  // Tags each candidate row with isDuplicate (exact hash match - certain) and
  // isSuspectedDuplicate (fuzzy match against an existing transaction -
  // probable, not certain) against existing transactions AND against earlier
  // rows in this same batch (handles re-importing an overlapping statement,
  // and importing the same file twice).
  annotate(candidates, accountId) {
    const existingTxns = PF.transactions.all();
    const existingHashes = PF.transactions.existingHashes();
    const seenInBatch = new Set();
    const hasBitAccount = PF.store.data.accounts.some(a => a.type === "bit");
    return candidates.map(c => {
      // Mirror what commitBatch will actually store: a Bit row becomes a
      // transfer (no accountId field) when a Bit account exists. A loan
      // payment is always stored as a plain expense on `accountId` now (a
      // loan isn't an account), so it needs no special-casing here.
      const willBeTransfer = c.suggestBitTransfer && hasBitAccount;
      const probe = { date: c.date, amount: c.amount, payee: c.payee, accountId: willBeTransfer ? "" : accountId, type: willBeTransfer ? "transfer" : c.type };
      const h = PF.transactions.hash(probe);
      const isDuplicate = existingHashes.has(h) || seenInBatch.has(h);
      seenInBatch.add(h);
      const isSuspectedDuplicate = !isDuplicate && existingTxns.some(t => PF.dedupe.looksLikeSameTransaction(t, probe));
      return { ...c, hash: h, isDuplicate, isSuspectedDuplicate };
    });
  },

  // Pair-key is the two ids sorted so (a,b) and (b,a) are the same key —
  // order never matters for "are these two the same transaction".
  pairKey(idA, idB) {
    return [idA, idB].sort().join("|");
  },

  isDismissed(idA, idB) {
    const list = PF.store.data.dismissedDuplicatePairs || [];
    const key = PF.dedupe.pairKey(idA, idB);
    return list.some(p => PF.dedupe.pairKey(p[0], p[1]) === key);
  },

  // "These two rows are genuinely separate transactions, stop flagging them"
  // — persisted so the suspicion doesn't come back on every later scan.
  dismissPair(idA, idB) {
    PF.store.data.dismissedDuplicatePairs = PF.store.data.dismissedDuplicatePairs || [];
    if (!PF.dedupe.isDismissed(idA, idB)) {
      PF.store.data.dismissedDuplicatePairs.push([idA, idB]);
      PF.store.touch();
    }
  },

  // Scans ALL existing transactions (not just a fresh import) for pairs that
  // look like the same real-world transaction entered twice — e.g. once by
  // hand, once later from an imported statement. O(n²), fine at personal-
  // finance-app scale. Returns [{a, b}] excluding any pair the user already
  // said are genuinely different.
  findSuspectedDuplicatePairs() {
    const txns = PF.transactions.all();
    const pairs = [];
    for (let i = 0; i < txns.length; i++) {
      for (let j = i + 1; j < txns.length; j++) {
        const a = txns[i], b = txns[j];
        if (PF.dedupe.isDismissed(a.id, b.id)) continue;
        if (PF.dedupe.looksLikeSameTransaction(a, b)) pairs.push({ a, b });
      }
    }
    return pairs;
  },

  // Convenience: which transaction ids are involved in at least one
  // suspected-duplicate pair, and (per id) the other transaction(s) it's
  // suspected against — for the "suspected duplicates" filter/badges.
  suspectedDuplicateIndex() {
    const pairs = PF.dedupe.findSuspectedDuplicatePairs();
    const byId = {};
    pairs.forEach(({ a, b }) => {
      (byId[a.id] = byId[a.id] || []).push(b);
      (byId[b.id] = byId[b.id] || []).push(a);
    });
    return byId;
  }
};
