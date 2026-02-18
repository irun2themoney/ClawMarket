var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { signX402Payment } from '../x402/wallet.js';
/**
 * HTTP client that transparently handles x402 payment responses.
 * When a request returns 402, it auto-signs the payment and retries.
 */
export class X402Client {
    constructor(config) {
        this.config = config;
    }
    request(method, path, body, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            const url = `${this.config.baseUrl}${path}`;
            const reqHeaders = Object.assign({ 'Content-Type': 'application/json', 'X-Bot-Id': this.config.botId, 'X-Wallet-Address': this.config.walletAddress }, headers);
            // First attempt — may get 402
            let res = yield fetch(url, {
                method,
                headers: reqHeaders,
                body: body ? JSON.stringify(body) : undefined,
            });
            // Handle x402 payment required
            if (res.status === 402) {
                const paymentRequired = res.headers.get('x-payment-required');
                if (!paymentRequired) {
                    const errorBody = yield res.json().catch(() => ({}));
                    throw new Error(`Payment required but no payment details provided: ${JSON.stringify(errorBody)}`);
                }
                // Decode payment requirements
                const requirement = JSON.parse(Buffer.from(paymentRequired, 'base64').toString());
                // Auto-sign the payment
                const signature = yield signX402Payment(this.config.encryptedKey, {
                    amount: requirement.amount,
                    currency: requirement.currency,
                    recipient: requirement.recipient,
                    deadline: requirement.deadline,
                    chainId: 8453, // Base mainnet
                });
                // Build payment payload
                const paymentPayload = {
                    signature,
                    payer: this.config.walletAddress,
                    amount: requirement.amount,
                    currency: requirement.currency,
                    recipient: requirement.recipient,
                    deadline: requirement.deadline,
                };
                // Retry with payment signature
                reqHeaders['X-Payment-Signature'] = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
                res = yield fetch(url, {
                    method,
                    headers: reqHeaders,
                    body: body ? JSON.stringify(body) : undefined,
                });
            }
            if (!res.ok) {
                const errorBody = yield res.json().catch(() => ({ error: res.statusText }));
                throw new Error(`API error ${res.status}: ${JSON.stringify(errorBody)}`);
            }
            return yield res.json();
        });
    }
    get(path) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.request('GET', path);
        });
    }
    post(path, body) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.request('POST', path, body);
        });
    }
    del(path) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.request('DELETE', path);
        });
    }
}
//# sourceMappingURL=x402-client.js.map