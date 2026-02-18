import { EventEmitter } from 'eventemitter3';
interface ResolverEvents {
    'market-resolved': (data: {
        marketId: string;
        resolution: 'yes' | 'no';
    }) => void;
}
export declare class ResolutionWatcher extends EventEmitter<ResolverEvents> {
    private timer;
    start(): void;
    stop(): void;
    private checkResolutions;
}
export {};
