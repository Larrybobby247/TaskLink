import mongoose from 'mongoose';
import { Transaction, User } from '../models/index.js';
import { generateReference } from '../utils/crypto.js';

/**
 * Returns a user's current available balance by summing their ledger.
 * We never store a directly-editable "balance" field - this IS the balance.
 */
export async function getWalletBalanceKobo(userId) {
  const result = await Transaction.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId) } },
    { $group: { _id: null, total: { $sum: '$amountKobo' } } },
  ]);
  return result[0]?.total || 0;
}

/**
 * Appends a single ledger entry inside the given (optional) session, keeping the
 * running balance snapshot correct. Every wallet-affecting action in the app must
 * go through this function rather than touching Transaction directly.
 */
export async function appendLedgerEntry(
  { userId, type, amountKobo, description, order, payment, withdrawal, createdByAdmin, adjustmentReason },
  session = null
) {
  const currentBalance = await getWalletBalanceKobo(userId);
  const balanceAfterKobo = currentBalance + amountKobo;

  const [entry] = await Transaction.create(
    [
      {
        user: userId,
        type,
        amountKobo,
        balanceAfterKobo,
        order,
        payment,
        withdrawal,
        description,
        reference: generateReference('LEDGER'),
        createdByAdmin,
        adjustmentReason,
      },
    ],
    { session }
  );
  return entry;
}

export async function getTransactionHistory(userId, { page, limit, skip, type }) {
  const filter = { user: userId };
  if (type && type !== 'ALL') filter.type = type;

  const [items, total] = await Promise.all([
    Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Transaction.countDocuments(filter),
  ]);
  return { items, total };
}
