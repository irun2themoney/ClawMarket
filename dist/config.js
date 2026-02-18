import 'dotenv/config';
export const config = {
    masterKey: process.env.CLAWMARKET_MASTER_KEY || '',
    feeRate: parseFloat(process.env.CLAWMARKET_FEE_RATE || '0.02'),
    treasuryAddress: process.env.CLAWMARKET_TREASURY_ADDRESS || '',
    treasuryPrivateKey: process.env.CLAWMARKET_TREASURY_PRIVATE_KEY || '',
    baseRpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    cdpApiKey: process.env.CDP_API_KEY || '',
    apiPort: parseInt(process.env.API_PORT || '3457', 10),
    dashboardPort: parseInt(process.env.DASHBOARD_PORT || '3456', 10),
    polySyncInterval: parseInt(process.env.POLY_SYNC_INTERVAL || '60000', 10),
    polyResolutionInterval: parseInt(process.env.POLY_RESOLUTION_INTERVAL || '300000', 10),
    // Polymarket API endpoints
    polyGammaApi: 'https://gamma-api.polymarket.com',
    polyClobApi: 'https://clob.polymarket.com',
    polyClobWs: 'wss://ws-subscriptions-clob.polymarket.com/ws/market',
    // Base L2 USDC contract address
    baseUsdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    // x402 facilitator URL
    x402FacilitatorUrl: 'https://x402.org/facilitator',
    // Dev mode (defaults to true — dev mode on unless explicitly disabled)
    devMode: process.env.CLAWMARKET_DEV_MODE !== 'false',
    // Admin token for admin routes
    adminToken: process.env.CLAWMARKET_ADMIN_TOKEN || 'clawmarket-admin-2024',
    // Domain
    domain: process.env.CLAWMARKET_DOMAIN || 'clawmarket.lol',
    // Default starting balance for new bots (in microcents, 10000000 = $10)
    defaultBotBalance: parseInt(process.env.CLAWMARKET_DEFAULT_BOT_BALANCE || '10000000', 10),
};
//# sourceMappingURL=config.js.map