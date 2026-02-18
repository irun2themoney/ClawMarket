var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { config } from '../config.js';
let facilitatorConfig = {
    url: config.x402FacilitatorUrl,
    apiKey: config.cdpApiKey || undefined,
};
export function configureFacilitator(cfg) {
    facilitatorConfig = Object.assign(Object.assign({}, facilitatorConfig), cfg);
}
/**
 * Settle a payment through the facilitator.
 * This is called after verifying a payment signature to move USDC on-chain.
 */
export function settlePayment(paymentData) {
    return __awaiter(this, void 0, void 0, function* () {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (facilitatorConfig.apiKey) {
            headers['Authorization'] = `Bearer ${facilitatorConfig.apiKey}`;
        }
        const res = yield fetch(`${facilitatorConfig.url}/settle`, {
            method: 'POST',
            headers,
            body: JSON.stringify(paymentData),
        });
        if (!res.ok) {
            const err = yield res.text();
            throw new Error(`Settlement failed: ${err}`);
        }
        return yield res.json();
    });
}
/**
 * Check the health/status of the facilitator.
 */
export function checkFacilitatorHealth() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const res = yield fetch(`${facilitatorConfig.url}/health`);
            return res.ok;
        }
        catch (_a) {
            return false;
        }
    });
}
/**
 * Get supported networks from the facilitator.
 */
export function getSupportedNetworks() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const res = yield fetch(`${facilitatorConfig.url}/networks`);
            if (!res.ok)
                return ['eip155:8453']; // Default to Base
            const data = yield res.json();
            return data.networks || ['eip155:8453'];
        }
        catch (_a) {
            return ['eip155:8453'];
        }
    });
}
//# sourceMappingURL=facilitator.js.map