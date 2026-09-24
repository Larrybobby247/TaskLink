import mongoose from 'mongoose';
import { Withdrawal, User } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { getWalletBalanceKobo, appendLedgerEntry } from './wallet.service.js';
import { getPlatformSettings } from './platformSettings.service.js';
import { generateReference } from '../utils/crypto.js';
import { notify } from './notification.service.js';
import { emailService } from './email.service.js';

export async function requestWithdrawal(user, amountKobo) {
  if (!Number.isInteger(amountKobo) || amountKobo <= 0) throw new AppError('Invalid withdrawal amount', 400);

  const accountOwner = await User.findById(user._id).select('+bankDetails.accountNumber');
  const bankDetails = accountOwner?.bankDetails;
  if (!bankDetails?.accountNumber || !bankDetails.bankName || !bankDetails.accountName) {
    throw new AppError('Please add your bank account details before withdrawing', 400);
  }

  const balance = await getWalletBalanceKobo(user._id);
  const settings = await getPlatformSettings();
  const feeKobo = user.plan === 'PRO' ? 0 : settings.withdrawalFeeKobo;

  if (amountKobo > balance) throw new AppError('Insufficient wallet balance', 400);

  const netAmountKobo = amountKobo - feeKobo;
  if (netAmountKobo <= 0) throw new AppError('Withdrawal amount must be greater than the withdrawal fee', 400);
  const reference = generateReference('WD');

  const session = await mongoose.startSession();
  let withdrawal;
  try {
    await session.withTransaction(async () => {
      [withdrawal] = await Withdrawal.create(
        [{
          user: user._id,
          amountKobo,
          feeKobo,
          netAmountKobo,
          bankName: bankDetails.bankName,
          bankCode: bankDetails.bankCode,
          accountNumberLast4: bankDetails.accountNumber.slice(-4),
          accountName: bankDetails.accountName,
          status: 'PENDING',
          reference,
        }],
        { session }
      );

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

export async function markWithdrawalSuccess(withdrawalId, paystackTransferCode) {
  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal) throw new AppError('Withdrawal not found', 404);
  withdrawal.status = 'SUCCESS';
  withdrawal.paystackTransferCode = paystackTransferCode;
  withdrawal.processedAt = new Date();
  await withdrawal.save();

  const user = await User.findById(withdrawal.user);
  await notify({ userId: withdrawal.user, type: 'WITHDRAWAL_SUCCESSFUL', title: 'Withdrawal successful', body: `${withdrawal.netAmountKobo / 100} NGN was sent to your bank account`, entityType: 'WITHDRAWAL', entityId: withdrawal._id });
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
  await appendLedgerEntry({ userId: withdrawal.user, type: 'REFUND', amountKobo: withdrawal.amountKobo, description: `Reversal for failed withdrawal ${withdrawal.reference}`, withdrawal: withdrawal._id });

  const user = await User.findById(withdrawal.user);
  await notify({ userId: withdrawal.user, type: 'WITHDRAWAL_FAILED', title: 'Withdrawal failed', body: 'Your withdrawal could not be completed. The funds have been returned to your wallet.', entityType: 'WITHDRAWAL', entityId: withdrawal._id });
  if (user) emailService.sendWithdrawalFailed(user, withdrawal);
  return withdrawal;
}

export async function addBankAccount(userId, { bankName, bankCode, accountNumber, accountName }) {
  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        bankDetails: { bankName, bankCode, accountNumber, accountName, updatedAt: new Date() },
      },
    },
    { new: true, runValidators: true }
  );
  if (!user) throw new AppError('User not found', 404);
  return user;
}
