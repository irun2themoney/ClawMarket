import http from 'http';
export declare function createServer(): {
    app: import("express-serve-static-core").Express;
    server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
    wss: import("ws").Server<typeof import("ws").default, typeof http.IncomingMessage>;
    broadcast: (event: string, data: any) => void;
};
export declare function startServer(broadcast: (event: string, data: any) => void): (event: string, data: any) => void;
