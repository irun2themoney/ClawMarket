import { ethers } from 'ethers';
import * as crypto from 'crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

interface WalletInfo {
  address: string;
  encryptedKey: string;
}

/**
 * Generate a new EVM wallet for a bot.
 * Private key is encrypted with the master key before storage.
 */
export function createBotWallet(): WalletInfo {
  const wallet = ethers.Wallet.createRandom();
  const encryptedKey = encryptPrivateKey(wallet.privateKey);
  return {
    address: wallet.address,
    encryptedKey,
  };
}

/**
 * Encrypt a private key using AES-256-GCM with the master key.
 */
function encryptPrivateKey(privateKey: string): string {
  const key = Buffer.from(config.masterKey, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a private key from storage.
 */
export function decryptPrivateKey(encryptedKey: string): string {
  const key = Buffer.from(config.masterKey, 'hex');
  const [ivHex, tagHex, ciphertext] = encryptedKey.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Get an ethers.js Wallet instance for a bot (for signing x402 payments).
 */
export function getBotWallet(encryptedKey: string): ethers.Wallet {
  const privateKey = decryptPrivateKey(encryptedKey);
  const provider = new ethers.JsonRpcProvider(config.baseRpcUrl);
  return new ethers.Wallet(privateKey, provider);
}

/**
 * Get the USDC balance of a wallet on Base L2.
 */
export async function getUsdcBalance(address: string): Promise<bigint> {
  const provider = new ethers.JsonRpcProvider(config.baseRpcUrl);
  const usdcAbi = ['function balanceOf(address) view returns (uint256)'];
  const usdc = new ethers.Contract(config.baseUsdcAddress, usdcAbi, provider);
  return await usdc.balanceOf(address);
}

/**
 * Transfer USDC from one wallet to another on Base L2.
 */
export async function transferUsdc(
  fromEncryptedKey: string,
  toAddress: string,
  amount: bigint
): Promise<string> {
  const wallet = getBotWallet(fromEncryptedKey);
  const usdcAbi = [
    'function transfer(address to, uint256 amount) returns (bool)',
  ];
  const usdc = new ethers.Contract(config.baseUsdcAddress, usdcAbi, wallet);
  const tx = await usdc.transfer(toAddress, amount);
  const receipt = await tx.wait();
  return receipt.hash;
}

/**
 * Sign an EIP-712 x402 payment payload.
 */
export async function signX402Payment(
  encryptedKey: string,
  paymentPayload: {
    amount: string;
    currency: string;
    recipient: string;
    deadline: number;
    chainId: number;
  }
): Promise<string> {
  const wallet = getBotWallet(encryptedKey);

  const domain = {
    name: 'x402',
    version: '1',
    chainId: paymentPayload.chainId,
  };

  const types = {
    Payment: [
      { name: 'amount', type: 'string' },
      { name: 'currency', type: 'string' },
      { name: 'recipient', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
  };

  const value = {
    amount: paymentPayload.amount,
    currency: paymentPayload.currency,
    recipient: paymentPayload.recipient,
    deadline: paymentPayload.deadline,
  };

  return await wallet.signTypedData(domain, types, value);
}
