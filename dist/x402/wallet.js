var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { ethers } from 'ethers';
import * as crypto from 'crypto';
import { config } from '../config.js';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
/**
 * Generate a new EVM wallet for a bot.
 * Private key is encrypted with the master key before storage.
 */
export function createBotWallet() {
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
function encryptPrivateKey(privateKey) {
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
export function decryptPrivateKey(encryptedKey) {
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
export function getBotWallet(encryptedKey) {
    const privateKey = decryptPrivateKey(encryptedKey);
    const provider = new ethers.JsonRpcProvider(config.baseRpcUrl);
    return new ethers.Wallet(privateKey, provider);
}
/**
 * Get the USDC balance of a wallet on Base L2.
 */
export function getUsdcBalance(address) {
    return __awaiter(this, void 0, void 0, function* () {
        const provider = new ethers.JsonRpcProvider(config.baseRpcUrl);
        const usdcAbi = ['function balanceOf(address) view returns (uint256)'];
        const usdc = new ethers.Contract(config.baseUsdcAddress, usdcAbi, provider);
        return yield usdc.balanceOf(address);
    });
}
/**
 * Transfer USDC from one wallet to another on Base L2.
 */
export function transferUsdc(fromEncryptedKey, toAddress, amount) {
    return __awaiter(this, void 0, void 0, function* () {
        const wallet = getBotWallet(fromEncryptedKey);
        const usdcAbi = [
            'function transfer(address to, uint256 amount) returns (bool)',
        ];
        const usdc = new ethers.Contract(config.baseUsdcAddress, usdcAbi, wallet);
        const tx = yield usdc.transfer(toAddress, amount);
        const receipt = yield tx.wait();
        return receipt.hash;
    });
}
/**
 * Sign an EIP-712 x402 payment payload.
 */
export function signX402Payment(encryptedKey, paymentPayload) {
    return __awaiter(this, void 0, void 0, function* () {
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
        return yield wallet.signTypedData(domain, types, value);
    });
}
//# sourceMappingURL=wallet.js.map