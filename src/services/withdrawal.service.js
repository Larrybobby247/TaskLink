import mongoose from 'mongoose';
import { Withdrawal, WorkerProfile } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { getWalletBalanceKobo, appendLedgerEntry } from './wallet.service.js';
import { getPlatformSettings } from './platformSettings.service.js';
import { generateReference } from '../utils/crypto.js';
import * as paystack from './paystack.service.js';
import { notify } from './notification.service.js';
import { emailService } from './email.service.js';

export async function requestWithdrawal(user, amountKobo) {
  if (!Number.isInteger(amountKobo) || amountKobo <= 0) throw new AppError('Invalid withdrawal amount', 400);

  const profile = await WorkerProfile.findOne({ user: user._id }).select('+bankAccount.accountNumber');
  if (!profile?.bankAccount?.accountNumber) {
    throw new AppError('Please add and verify a bank account before withdrawing', 400);
  }

  const balance = await getWalletBalanceKobo(user._id);
  const settings = await getPlatformSettings();
  const feeKobo = user.plan === 'PRO' ? 0 : settings.withdrawalFeeKobo;

  if (amountKobo > balance) throw new AppError('Insufficient wallet balance', 400);

  const netAmountKobo = amountKobo - feeKobo;
  const reference = generateReference('WD');

  const session = await mongoose.startSession();
  let withdrawal;
  try {
    await session.withTransaction(async () => {
      [withdrawal] = await Withdrawal.create(
        [
          {
            user: user._id,
            amountKobo,
            feeKobo,
            netAmountKobo,
            bankName: profile.bankAccount.bankName,
            bankCode: profile.bankAccount.bankCode,
            accountNumberLast4: profile.bankAccount.accountNumberLast4,
            accountName: profile.bankAccount.accountName,
            paystackRecipientCode: profile.bankAccount.recipientCode,
            status: 'PENDING',
            reference,
          },
        ],
        { session }
      );

      // Debit the wallet immediately so the same funds can't be withdrawn twice
      // while the transfer is in flight. If the transfer later fails, a REFUND
      // ledger entry (see markWithdrawalFailed) reverses this.
      await appendLedgerEntry(
        {
          userId: user._id,
          type: 'WITHDRAWAL',
          amountKobo: -amountKobo,
          description: `Withdrawal request ${reference}`,
          withdrawal: withdrawal._id,
        },
        session
      );
    });
  } finally {
    session.endSession();
  }

  await notify({
    userId: user._id,
    type: 'WITHDRAWAL_REQUESTED',
    title: 'Withdrawal received',
    body: `Your withdrawal request for the equivalent of ${netAmountKobo / 100} NGN is being processed`,
    entityType: 'WITHDRAWAL',
    entityId: withdrawal._id,
  });
  emailService.sendWithdrawalRequested(user, withdrawal);

  return withdrawal;
}

/**
 * Called by an admin action or an automated payout worker once the Paystack
 * transfer succeeds. Never callable directly from arbitrary frontend input.
 */
export async function markWithdrawalSuccess(withdrawalId, paystackTransferCode) {
  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal) throw new AppError('Withdrawal not found', 404);
  withdrawal.status = 'SUCCESS';
  withdrawal.paystackTransferCode = paystackTransferCode;
  withdrawal.processedAt = new Date();
  await withdrawal.save();

  const user = await (await import('../models/index.js')).User.findById(withdrawal.user);
  await notify({
    userId: withdrawal.user,
    type: 'WITHDRAWAL_SUCCESSFUL',
    title: 'Withdrawal successful',
    body: `${withdrawal.netAmountKobo / 100} NGN was sent to your bank account`,
    entityType: 'WITHDRAWAL',
    entityId: withdrawal._id,
  });
  if (user) emailService.sendWithdrawalSuccessful(user, withdrawal);
  return withdrawal;
}

export async function markWithdrawalFailed(withdrawalId, reason) {
  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal) throw new AppError('Withdrawal not found', 404);
  withdrawal.status = 'FAILED';
  withdrawal.failureReason = reason;
  withdrawal.processedAt = new Date();
  await withdrawal.save();

  // Reverse the earlier debit since the transfer never completed.
  await appendLedgerEntry({
    userId: withdrawal.user,
    type: 'REFUND',
    amountKobo: withdrawal.amountKobo,
    description: `Reversal for failed withdrawal ${withdrawal.reference}`,
    withdrawal: withdrawal._id,
  });

  const user = await (await import('../models/index.js')).User.findById(withdrawal.user);
  await notify({
    userId: withdrawal.user,
    type: 'WITHDRAWAL_FAILED',
    title: 'Withdrawal failed',
    body: `Your withdrawal could not be completed. The funds have been returned to your wallet.`,
    entityType: 'WITHDRAWAL',
    entityId: withdrawal._id,
  });
  if (user) emailService.sendWithdrawalFailed(user, withdrawal);
  return withdrawal;
}

export async function addBankAccount(userId, { bankName, bankCode, accountNumber }) {
  const resolved = await paystack.resolveAccountNumber({ accountNumber, bankCode });
  const recipient = await paystack.createTransferRecipient({
    name: resolved.account_name,
    accountNumber,
    bankCode,
  });

  const profile = await WorkerProfile.findOneAndUpdate(
    { user: userId },
    {
      'bankAccount.bankName': bankName,
      'bankAccount.bankCode': bankCode,
      'bankAccount.accountNumber': accountNumber,
      'bankAccount.accountNumberLast4': accountNumber.slice(-4),
      'bankAccount.accountName': resolved.account_name,
      'bankAccount.recipientCode': recipient.recipient_code,
      'bankAccount.verifiedAt': new Date(),
    },
    { upsert: true, new: true }
  );
  return profile;
}
