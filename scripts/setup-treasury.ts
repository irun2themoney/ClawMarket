/**
 * Set up the treasury wallet for ClawMarket.
 * Generates a new wallet or displays the existing one.
 *
 * Run with: npm run setup-treasury
 */

import { ethers } from 'ethers';
import crypto from 'crypto';

function setup() {
  console.log('=== ClawMarket Treasury Setup ===\n');

  // Generate master encryption key if not set
  if (!process.env.CLAWMARKET_MASTER_KEY) {
    const masterKey = crypto.randomBytes(32).toString('hex');
    console.log('Generated master encryption key (add to .env):');
    console.log(`CLAWMARKET_MASTER_KEY=${masterKey}\n`);
  }

  // Generate treasury wallet
  const wallet = ethers.Wallet.createRandom();

  console.log('Generated treasury wallet (add to .env):');
  console.log(`CLAWMARKET_TREASURY_ADDRESS=${wallet.address}`);
  console.log(`CLAWMARKET_TREASURY_PRIVATE_KEY=${wallet.privateKey}\n`);

  console.log('IMPORTANT:');
  console.log('1. Save these values to your .env file');
  console.log('2. The treasury address receives all trading fees');
  console.log('3. NEVER share the private key');
  console.log('4. Fund the treasury wallet with a small amount of ETH on Base for gas (if needed)');
  console.log('\nChain: Base L2 (eip155:8453)');
  console.log('Currency: USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)');
}

setup();
