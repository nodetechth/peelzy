import { Platform } from 'react-native';
import { supabase } from './supabase';

const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
const PLUS_ENTITLEMENT_ID = process.env.EXPO_PUBLIC_REVENUECAT_PLUS_ENTITLEMENT_ID || 'plus';

let configuredUserId: string | null = null;
let configuredApiKey: string | null = null;

function getRevenueCatApiKey(): string | undefined {
  if (Platform.OS === 'ios') {
    return REVENUECAT_IOS_API_KEY;
  }

  if (Platform.OS === 'android') {
    return REVENUECAT_ANDROID_API_KEY;
  }

  return undefined;
}

async function getPurchases() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    throw new Error('In-app purchases are only available on iOS and Android.');
  }

  const module = await import('react-native-purchases');
  return module.default;
}

export function isRevenueCatConfigured(): boolean {
  return Boolean(getRevenueCatApiKey());
}

export async function configureRevenueCat(userId: string): Promise<void> {
  const apiKey = getRevenueCatApiKey();
  if (!apiKey) {
    throw new Error('RevenueCat is not configured for this platform.');
  }

  if (configuredUserId === userId && configuredApiKey === apiKey) {
    return;
  }

  const Purchases = await getPurchases();
  Purchases.configure({
    apiKey,
    appUserID: userId,
  });
  configuredUserId = userId;
  configuredApiKey = apiKey;
}

function hasPlusEntitlement(customerInfo: {
  entitlements: { active: Record<string, unknown> };
}): boolean {
  return Boolean(customerInfo.entitlements.active[PLUS_ENTITLEMENT_ID]);
}

export async function syncRevenueCatStatus(): Promise<{ isPlus: boolean; error: Error | null }> {
  try {
    if (!isRevenueCatConfigured()) {
      return { isPlus: false, error: new Error('RevenueCat is not configured.') };
    }

    let syncError: Error | null = null;
    const { error } = await supabase.functions.invoke('sync-revenuecat-status');
    if (error) {
      syncError = error;
    }

    const Purchases = await getPurchases();
    const customerInfo = await Purchases.getCustomerInfo();
    return { isPlus: hasPlusEntitlement(customerInfo), error: syncError };
  } catch (error) {
    return { isPlus: false, error: error as Error };
  }
}

export async function purchasePeelzyPlus(userId: string): Promise<{ isPlus: boolean; error: Error | null }> {
  try {
    await configureRevenueCat(userId);
    const Purchases = await getPurchases();
    const offerings = await Purchases.getOfferings();
    const offering = offerings.current;
    const packageToPurchase =
      offering?.monthly ?? offering?.availablePackages?.[0] ?? null;

    if (!packageToPurchase) {
      return { isPlus: false, error: new Error('Peelzy Plus is not available yet.') };
    }

    const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
    const syncResult = await syncRevenueCatStatus();
    return {
      isPlus: hasPlusEntitlement(customerInfo) || syncResult.isPlus,
      error: syncResult.error,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('cancel')) {
      return { isPlus: false, error: null };
    }
    return { isPlus: false, error: error as Error };
  }
}

export async function restorePeelzyPlus(userId: string): Promise<{ isPlus: boolean; error: Error | null }> {
  try {
    await configureRevenueCat(userId);
    const Purchases = await getPurchases();
    const customerInfo = await Purchases.restorePurchases();
    const syncResult = await syncRevenueCatStatus();
    return {
      isPlus: hasPlusEntitlement(customerInfo) || syncResult.isPlus,
      error: syncResult.error,
    };
  } catch (error) {
    return { isPlus: false, error: error as Error };
  }
}
