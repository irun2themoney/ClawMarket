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
/**
 * x402 paywall middleware factory.
 * In dev mode: passes through (internal balance used by matching engine).
 * In production: requires x402 payment signature.
 */
export function x402Paywall(costFn) {
    return (req, res, next) => __awaiter(this, void 0, void 0, function* () {
        const amount = costFn(req);
        // Free request — always pass through
        if (amount <= 0) {
            return next();
        }
        // Dev mode: skip x402, validate internal balance instead
        if (config.devMode) {
            const bot = req.bot;
            if (bot) {
                const { getDb } = yield import('../db/index.js');
                const db = getDb();
                const botRecord = db.prepare('SELECT balance_usdc FROM bots WHERE id = ?').get(bot.id);
                if (botRecord && botRecord.balance_usdc < amount) {
                    return res.status(400).json({
                        error: 'Insufficient balance',
                        required: amount,
                        available: botRecord.balance_usdc,
                        hint: 'Use POST /api/bots/:id/deposit to add funds',
                    });
                }
            }
            return next();
        }
        // Production mode: require x402 payment
        const paymentSignature = req.headers['x-payment-signature'];
        if (!paymentSignature) {
            const requirement = {
                amount: (amount / 1000000).toFixed(6),
                currency: 'USDC',
                chain: 'eip155:8453',
                recipient: config.treasuryAddress,
                deadline: Math.floor(Date.now() / 1000) + 120,
                description: 'ClawMarket trade payment',
            };
            const encoded = Buffer.from(JSON.stringify(requirement)).toString('base64');
            res.status(402)
                .set('X-Payment-Required', encoded)
                .set('X-Payment-Currency', 'USDC')
                .set('X-Payment-Chain', 'eip155:8453')
                .json({
                error: 'Payment Required',
                payment: requirement,
            });
            return;
        }
        // Payment signature provided — verify it
        try {
            const verified = yield verifyPayment(paymentSignature, amount);
            if (!verified.valid) {
                return res.status(402).json({ error: 'Invalid payment', reason: verified.reason });
            }
            req.x402Payment = {
                txHash: verified.txHash,
                amount: verified.amount,
                payer: verified.payer,
            };
            next();
        }
        catch (err) {
            return res.status(402).json({ error: 'Payment verification failed', reason: err.message });
        }
    });
}
function verifyPayment(signature, expectedAmount) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const paymentData = JSON.parse(Buffer.from(signature, 'base64').toString());
            const facilitatorUrl = config.x402FacilitatorUrl;
            const verifyRes = yield fetch(`${facilitatorUrl}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    payment: paymentData,
                    expectedAmount: (expectedAmount / 1000000).toFixed(6),
                    expectedCurrency: 'USDC',
                    expectedRecipient: config.treasuryAddress,
                }),
            });
            if (!verifyRes.ok) {
                const err = yield verifyRes.text();
                return { valid: false, reason: `Facilitator rejected: ${err}` };
            }
            const result = yield verifyRes.json();
            return {
                valid: true,
                txHash: result.txHash || result.transactionHash,
                amount: expectedAmount,
                payer: result.payer || paymentData.payer,
            };
        }
        catch (err) {
            return { valid: false, reason: err.message };
        }
    });
}
export function freeRoute() {
    return (_req, _res, next) => next();
}
//# sourceMappingURL=paywall.js.map