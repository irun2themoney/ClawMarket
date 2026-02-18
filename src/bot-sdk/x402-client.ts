import { signX402Payment } from '../x402/wallet.js';

interface X402ClientConfig {
  baseUrl: string;
  botId: string;
  encryptedKey: string;
  walletAddress: string;
}

/**
 * HTTP client that transparently handles x402 payment responses.
 * When a request returns 402, it auto-signs the payment and retries.
 */
export class X402Client {
  private config: X402ClientConfig;

  constructor(config: X402ClientConfig) {
    this.config = config;
  }

  async request<T = any>(
    method: string,
    path: string,
    body?: any,
    headers?: Record<string, string>
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Bot-Id': this.config.botId,
      'X-Wallet-Address': this.config.walletAddress,
      ...headers,
    };

    // First attempt — may get 402
    let res = await fetch(url, {
      method,
      headers: reqHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Handle x402 payment required
    if (res.status === 402) {
      const paymentRequired = res.headers.get('x-payment-required');
      if (!paymentRequired) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(`Payment required but no payment details provided: ${JSON.stringify(errorBody)}`);
      }

      // Decode payment requirements
      const requirement = JSON.parse(Buffer.from(paymentRequired, 'base64').toString());

      // Auto-sign the payment
      const signature = await signX402Payment(this.config.encryptedKey, {
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

      res = await fetch(url, {
        method,
        headers: reqHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });
    }

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`API error ${res.status}: ${JSON.stringify(errorBody)}`);
    }

    return await res.json();
  }

  async get<T = any>(path: string): Promise<T> {
    return this.request('GET', path);
  }

  async post<T = any>(path: string, body: any): Promise<T> {
    return this.request('POST', path, body);
  }

  async del<T = any>(path: string): Promise<T> {
    return this.request('DELETE', path);
  }
}
