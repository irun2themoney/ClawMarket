import { Request, Response, NextFunction } from 'express';
/**
 * x402 paywall middleware factory.
 * In dev mode: passes through (internal balance used by matching engine).
 * In production: requires x402 payment signature.
 */
export declare function x402Paywall(costFn: (req: Request) => number): (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare function freeRoute(): (_req: Request, _res: Response, next: NextFunction) => void;
