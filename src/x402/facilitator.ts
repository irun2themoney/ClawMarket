import { config } from '../config.js';

/**
 * Interface to the x402 facilitator (Coinbase CDP or self-hosted).
 * The facilitator handles on-chain USDC settlement.
 */

export interface FacilitatorConfig {
  url: string;
  apiKey?: string;
}

let facilitatorConfig: FacilitatorConfig = {
  url: config.x402FacilitatorUrl,
  apiKey: config.cdpApiKey || undefined,
};

export function configureFacilitator(cfg: Partial<FacilitatorConfig>): void {
  facilitatorConfig = { ...facilitatorConfig, ...cfg };
}

/**
 * Settle a payment through the facilitator.
 * This is called after verifying a payment signature to move USDC on-chain.
 */
export async function settlePayment(paymentData: {
  signature: string;
  amount: string;
  currency: string;
  payer: string;
  recipient: string;
  chainId: number;
}): Promise<{ txHash: string; settled: boolean }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (facilitatorConfig.apiKey) {
    headers['Authorization'] = `Bearer ${facilitatorConfig.apiKey}`;
  }

  const res = await fetch(`${facilitatorConfig.url}/settle`, {
    method: 'POST',
    headers,
    body: JSON.stringify(paymentData),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Settlement failed: ${err}`);
  }

  return await res.json();
}

/**
 * Check the health/status of the facilitator.
 */
export async function checkFacilitatorHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${facilitatorConfig.url}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Get supported networks from the facilitator.
 */
export async function getSupportedNetworks(): Promise<string[]> {
  try {
    const res = await fetch(`${facilitatorConfig.url}/networks`);
    if (!res.ok) return ['eip155:8453']; // Default to Base
    const data = await res.json();
    return data.networks || ['eip155:8453'];
  } catch {
    return ['eip155:8453'];
  }
}
