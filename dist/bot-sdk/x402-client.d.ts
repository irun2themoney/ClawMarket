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
export declare class X402Client {
    private config;
    constructor(config: X402ClientConfig);
    request<T = any>(method: string, path: string, body?: any, headers?: Record<string, string>): Promise<T>;
    get<T = any>(path: string): Promise<T>;
    post<T = any>(path: string, body: any): Promise<T>;
    del<T = any>(path: string): Promise<T>;
}
export {};
