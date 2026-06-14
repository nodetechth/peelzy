import { AccountStatus, getAccountStatus } from './storage';
import {
  configureRevenueCat,
  isRevenueCatConfigured,
  syncRevenueCatStatus,
} from './revenuecat';

export function markAccountStatusPaid(status: AccountStatus): AccountStatus {
  const paidLimit = Math.max(status.sticker_limit, 100);
  const paidRemaining = Math.max(status.stickers_remaining, Math.max(0, paidLimit - status.stickers_used));

  return {
    ...status,
    plan: 'paid',
    sticker_limit: paidLimit,
    stickers_remaining: paidRemaining,
    subscription_status: status.subscription_status ?? 'active',
  };
}

export async function getEffectiveAccountStatus(
  userId?: string | null
): Promise<{ status: AccountStatus; error: Error | null }> {
  const baseResult = await getAccountStatus();

  if (baseResult.status.plan === 'paid' || !userId || !isRevenueCatConfigured()) {
    return baseResult;
  }

  try {
    await configureRevenueCat(userId);
    const revenueCatResult = await syncRevenueCatStatus();

    if (revenueCatResult.isPlus) {
      return {
        status: markAccountStatusPaid(baseResult.status),
        error: baseResult.error ?? revenueCatResult.error,
      };
    }

    return baseResult;
  } catch (error) {
    return {
      status: baseResult.status,
      error: baseResult.error ?? (error as Error),
    };
  }
}
