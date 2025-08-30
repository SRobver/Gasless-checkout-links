import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';
import { Agentkit, AgentkitToolkit } from "@0xgasless/agentkit";
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Serve the payment page
app.get('/checkout/pay', (req, res) => {
  res.sendFile('public/checkout/pay.html', { root: '.' });
});

// Initialize agent (same as CLI)
async function initializeAgent() {
  try {
    const llm = new ChatOpenAI({
      model: "gpt-4o-mini",
      apiKey: process.env.OPENAI_API_KEY
    });

    const agentkit = await Agentkit.configureWithWallet({
      privateKey: process.env.PRIVATE_KEY as `0x${string}`,
      rpcUrl: process.env.RPC_URL as string,
      apiKey: process.env.API_KEY as string,
      chainID: Number(process.env.CHAIN_ID) || 43113,
    });

    const agentkitToolkit = new AgentkitToolkit(agentkit);
    const tools = agentkitToolkit.getTools();

    const memory = new MemorySaver();
    const agentConfig = { configurable: { thread_id: "0xGasless Web API" } };

    const agent = createReactAgent({
      llm,
      tools,
      checkpointSaver: memory,
      messageModifier: `
        You are a helpful agent that can interact with EVM chains using 0xGasless smart accounts. You can perform 
        gasless transactions using the account abstraction wallet. You can check balances of AVAX and any ERC20 token 
        by providing their contract address. If someone asks you to do something you can't do with your currently 
        available tools, you must say so. Be concise and helpful with your responses.
      `,
    });

    return { agent, config: agentConfig };
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    throw error;
  }
}

// Token resolution
const AVALANCHE_TOKENS: Record<string, `0x${string}`> = {
  "USDC": "0x5425890298aed601595a70AB815c96711a31Bc65",
  "USDT": "0x50DF4892Bd13f01E4e1Cd077ff394A8fa1A3fD7c",
  "WAVAX": "0xd00ae08403B9bbb9124bB305C09058E32C39A48c",
  "LINK": "0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846",
  "DAI": "0x5c4242beB94dE30b922f57241f1D02f36e906915",
  "WBTC": "0x9C1DCacB57ADa1E9e2D3a8280B7cfC7EB936186F",
  "UNI": "0x4ebAe49B4E34f7C5D3F26B3c365F3CBEbd6fEf98",
};

function resolveTokenSymbol(symbol: string): `0x${string}` | null {
  const upperSymbol = symbol.toUpperCase();
  if (upperSymbol === "AVAX" || upperSymbol === "ETH") {
    return null;
  }
  return AVALANCHE_TOKENS[upperSymbol] || null;
}

function getTokenDisplayName(token: string): string {
  if (token.toUpperCase() === "ETH" || token.toUpperCase() === "AVAX") return token.toUpperCase();
  const symbol = Object.keys(AVALANCHE_TOKENS).find(
    key => AVALANCHE_TOKENS[key] === token
  );
  return symbol || token;
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: '0xGasless Checkout API is running' });
});

// Create checkout link with QR code
app.post('/api/checkout/create', async (req, res) => {
  try {
    const { to, amount, token = 'AVAX', memo = '' } = req.body;

    if (!to || !amount) {
      return res.status(400).json({ error: 'Missing required fields: to, amount' });
    }

    // Resolve token symbol
    let resolvedToken = token;
    if (token.toUpperCase() !== "AVAX" && token.toUpperCase() !== "ETH") {
      const resolved = resolveTokenSymbol(token);
      if (resolved) {
        resolvedToken = resolved;
      }
    }

    // Create checkout URL
    const checkoutUrl = `${req.protocol}://${req.get('host')}/checkout/pay?to=${to}&amount=${amount}&token=${resolvedToken}&memo=${encodeURIComponent(memo)}`;
    
    // Generate QR code
    const qrCodeDataUrl = await QRCode.toDataURL(checkoutUrl);

    res.json({
      success: true,
      checkoutUrl,
      qrCode: qrCodeDataUrl,
      paymentDetails: {
        to,
        amount,
        token: getTokenDisplayName(resolvedToken),
        memo
      }
    });
  } catch (error) {
    console.error('Error creating checkout:', error);
    res.status(500).json({ error: 'Failed to create checkout' });
  }
});

// Get balance
app.get('/api/balance/:token', async (req, res) => {
  try {
    const { agent, config } = await initializeAgent();
    const token = req.params.token;

    const instruction = token.toUpperCase() === "AVAX" 
      ? `Check my AVAX balance`
      : `Check my balance of token ${token}`;

    const stream = await agent.stream({ messages: [new HumanMessage(instruction)] }, config);
    let result = '';
    
    for await (const chunk of stream) {
      if (typeof chunk === "string") {
        result += chunk;
      } else {
        result += JSON.stringify(chunk);
      }
    }

    res.json({ success: true, balance: result });
  } catch (error) {
    console.error('Error getting balance:', error);
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

// Execute payment
app.post('/api/checkout/pay', async (req, res) => {
  try {
    const { to, amount, token = 'AVAX', memo = '' } = req.body;

    if (!to || !amount) {
      return res.status(400).json({ error: 'Missing required fields: to, amount' });
    }

    const { agent, config } = await initializeAgent();

    // Resolve token symbol
    let resolvedToken = token;
    if (token.toUpperCase() !== "AVAX" && token.toUpperCase() !== "ETH") {
      const resolved = resolveTokenSymbol(token);
      if (resolved) {
        resolvedToken = resolved;
      }
    }

    const instruction = resolvedToken.toUpperCase() === "AVAX"
      ? `Send ${amount} AVAX to ${to} gaslessly${memo ? ` with memo: ${memo}` : ""}.`
      : `Send ${amount} of token ${resolvedToken} to ${to} gaslessly${memo ? ` with memo: ${memo}` : ""}.`;

    const stream = await agent.stream({ messages: [new HumanMessage(instruction)] }, config);
    let result = '';
    
    for await (const chunk of stream) {
      if (typeof chunk === "string") {
        result += chunk;
      } else {
        result += JSON.stringify(chunk);
      }
    }

    res.json({ success: true, transaction: result });
  } catch (error) {
    console.error('Error executing payment:', error);
    res.status(500).json({ error: 'Failed to execute payment' });
  }
});

// Get supported tokens
app.get('/api/tokens', (req, res) => {
  const tokens = [
    { symbol: 'AVAX', name: 'Avalanche', address: 'Native' },
    { symbol: 'USDC', name: 'USD Coin', address: AVALANCHE_TOKENS.USDC },
    { symbol: 'USDT', name: 'Tether', address: AVALANCHE_TOKENS.USDT },
    { symbol: 'WAVAX', name: 'Wrapped AVAX', address: AVALANCHE_TOKENS.WAVAX },
    { symbol: 'LINK', name: 'Chainlink', address: AVALANCHE_TOKENS.LINK },
    { symbol: 'DAI', name: 'Dai', address: AVALANCHE_TOKENS.DAI },
    { symbol: 'WBTC', name: 'Wrapped Bitcoin', address: AVALANCHE_TOKENS.WBTC },
    { symbol: 'UNI', name: 'Uniswap', address: AVALANCHE_TOKENS.UNI },
  ];
  
  res.json({ success: true, tokens });
});

app.listen(PORT, () => {
  console.log(`🚀 0xGasless Checkout Server running on http://localhost:${PORT}`);
  console.log(`📱 API Health: http://localhost:${PORT}/api/health`);
});
