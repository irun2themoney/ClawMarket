import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

interface PaymentRequirement {
  amount: string;
  currency: string;
  chain: string;
  recipient: string;
  deadline: number;
  description?: string;
}

/**
 * x402 paywall middleware factory.
 * In dev mode: passes through (internal balance used by matching engine).
 * In production: requires x402 payment signature.
 */
export function x402Paywall(costFn: (req: Request) => number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const amount = costFn(req);

    // Free request — always pass through
    if (amount <= 0) {
      return next();
    }

    // Dev mode: skip x402, validate internal balance instead
    if (config.devMode) {
      const bot = (req as any).bot;
      if (bot) {
        const { getDb } = await import('../db/index.js');
        const db = getDb();
        const botRecord = db.prepare('SELECT balance_usdc FROM bots WHERE id = ?').get(bot.id) as any;
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
    const paymentSignature = req.headers['x-payment-signature'] as string | undefined;

    if (!paymentSignature) {
      const requirement: PaymentRequirement = {
        amount: (amount / 1_000_000).toFixed(6),
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
      const verified = await verifyPayment(paymentSignature, amount);
      if (!verified.valid) {
        return res.status(402).json({ error: 'Invalid payment', reason: verified.reason });
      }

      (req as any).x402Payment = {
        txHash: verified.txHash,
        amount: verified.amount,
        payer: verified.payer,
      };

      next();
    } catch (err: any) {
      return res.status(402).json({ error: 'Payment verification failed', reason: err.message });
    }
  };
}

interface VerificationResult {
  valid: boolean;
  reason?: string;
  txHash?: string;
  amount?: number;
  payer?: string;
}

async function verifyPayment(signature: string, expectedAmount: number): Promise<VerificationResult> {
  try {
    const paymentData = JSON.parse(Buffer.from(signature, 'base64').toString());
    const facilitatorUrl = config.x402FacilitatorUrl;

    const verifyRes = await fetch(`${facilitatorUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment: paymentData,
        expectedAmount: (expectedAmount / 1_000_000).toFixed(6),
        expectedCurrency: 'USDC',
        expectedRecipient: config.treasuryAddress,
      }),
    });

    if (!verifyRes.ok) {
      const err = await verifyRes.text();
      return { valid: false, reason: `Facilitator rejected: ${err}` };
    }

    const result = await verifyRes.json();
    return {
      valid: true,
      txHash: result.txHash || result.transactionHash,
      amount: expectedAmount,
      payer: result.payer || paymentData.payer,
    };
  } catch (err: any) {
    return { valid: false, reason: err.message };
  }
}

export function freeRoute() {
  return (_req: Request, _res: Response, next: NextFunction) => next();
}
