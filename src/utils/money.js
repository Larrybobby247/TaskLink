export function nairaToKobo(naira) {
  if (typeof naira !== 'number' || Number.isNaN(naira) || naira < 0) throw new Error('Invalid Naira amount');
  return Math.round(naira * 100);
}
export function koboToNaira(kobo) {
  if (!Number.isInteger(kobo)) throw new Error('Kobo amount must be an integer');
  return kobo / 100;
}
export function formatNaira(kobo) {
  const naira = koboToNaira(kobo);
  return `₦${naira.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function calculatePlatformFeeKobo(amountKobo, commissionPercent) {
  if (!Number.isInteger(amountKobo) || amountKobo < 0) throw new Error('amountKobo must be a non-negative integer');
  const basisPoints = Math.round(commissionPercent * 100);
  return Math.round((amountKobo * basisPoints) / 10000);
}
export function calculateNetAmountKobo(amountKobo, commissionPercent) {
  return amountKobo - calculatePlatformFeeKobo(amountKobo, commissionPercent);
}
