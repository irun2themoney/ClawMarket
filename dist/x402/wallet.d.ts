import { ethers } from 'ethers';
interface WalletInfo {
    address: string;
    encryptedKey: string;
}
/**
 * Generate a new EVM wallet for a bot.
 * Private key is encrypted with the master key before storage.
 */
export declare function createBotWallet(): WalletInfo;
/**
 * Decrypt a private key from storage.
 */
export declare function decryptPrivateKey(encryptedKey: string): string;
/**
 * Get an ethers.js Wallet instance for a bot (for signing x402 payments).
 */
export declare function getBotWallet(encryptedKey: string): ethers.Wallet;
/**
 * Get the USDC balance of a wallet on Base L2.
 */
export declare function getUsdcBalance(address: string): Promise<bigint>;
/**
 * Transfer USDC from one wallet to another on Base L2.
 */
export declare function transferUsdc(fromEncryptedKey: string, toAddress: string, amount: bigint): Promise<string>;
/**
 * Sign an EIP-712 x402 payment payload.
 */
export declare function signX402Payment(encryptedKey: string, paymentPayload: {
    amount: string;
    currency: string;
    recipient: string;
    deadline: number;
    chainId: number;
}): Promise<string>;
export {};
