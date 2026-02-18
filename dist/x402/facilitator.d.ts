/**
 * Interface to the x402 facilitator (Coinbase CDP or self-hosted).
 * The facilitator handles on-chain USDC settlement.
 */
export interface FacilitatorConfig {
    url: string;
    apiKey?: string;
}
export declare function configureFacilitator(cfg: Partial<FacilitatorConfig>): void;
/**
 * Settle a payment through the facilitator.
 * This is called after verifying a payment signature to move USDC on-chain.
 */
export declare function settlePayment(paymentData: {
    signature: string;
    amount: string;
    currency: string;
    payer: string;
    recipient: string;
    chainId: number;
}): Promise<{
    txHash: string;
    settled: boolean;
}>;
/**
 * Check the health/status of the facilitator.
 */
export declare function checkFacilitatorHealth(): Promise<boolean>;
/**
 * Get supported networks from the facilitator.
 */
export declare function getSupportedNetworks(): Promise<string[]>;
