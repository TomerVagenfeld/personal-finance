window.PF = window.PF || {};

PF.dedupe = {
  // Tags each candidate row with isDuplicate against existing transactions AND
  // against earlier rows in this same batch (handles re-importing an overlapping
  // statement, and importing the same file twice).
  annotate(candidates, accountId) {
    const existing = PF.transactions.existingHashes();
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
      const isDuplicate = existing.has(h) || seenInBatch.has(h);
      seenInBatch.add(h);
      return { ...c, hash: h, isDuplicate };
    });
  }
};
