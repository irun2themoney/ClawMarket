import { Request, Response, NextFunction } from 'express';
/**
 * Wallet-based bot authentication middleware.
 */
export declare function botAuth(req: Request, res: Response, next: NextFunction): void;
export declare function optionalBotAuth(req: Request, _res: Response, next: NextFunction): void;
export declare function adminAuth(req: Request, res: Response, next: NextFunction): void;
