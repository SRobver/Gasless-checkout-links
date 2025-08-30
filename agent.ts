import { Agentkit, AgentkitToolkit, } from "@0xgasless/agentkit";
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import * as dotenv from "dotenv";
import * as readline from "readline";                                                                                                     

dotenv.config();

function validateEnvironment(): void {
  const missingVars: string[] = [];

  const requiredVars = ["OPENAI_API_KEY", "PRIVATE_KEY", "RPC_URL", "API_KEY", "CHAIN_ID"];

  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  });

  if (missingVars.length > 0) {
    console.error("Error: Required environment variables are not set");
    missingVars.forEach(varName => {
      console.error(`${varName}=your_${varName.toLowerCase()}_here`);
    });
    process.exit(1);
  }

  if (!process.env.CHAIN_ID) {
    console.warn("Warning: CHAIN_ID not set, defaulting to Avalanche Fuji testnet");
  }
}

validateEnvironment();

type CheckoutParams = {
  to: `0x${string}`;
  amount: string; // in ETH or token units as string
  token?: string; // 'ETH' or token address
  memo?: string;
};

// Common token addresses on Avalanche Fuji testnet
const AVALANCHE_TOKENS: Record<string, `0x${string}`> = {
  "USDC": "0x5425890298aed601595a70AB815c96711a31Bc65",
  "USDT": "0x50DF4892Bd13f01E4e1Cd077ff394A8fa1A3fD7c",
  "WAVAX": "0xd00ae08403B9bbb9124bB305C09058E32C39A48c",
  "LINK": "0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846",
  "DAI": "0x5c4242beB94dE30b922f57241f1D02f36e906915",
  "WBTC": "0x9C1DCacB57ADa1E9e2D3a8280B7cfC7EB936186F",
  "UNI": "0x4ebAe49B4E34f7C5D3F26B3c365F3CBEbd6fEf98",
  "AAVE": "0x2C5b7E89b8C5c9c3C7C8C5C9c3C7C8C5C9c3C7C8", // Placeholder
  "CRV": "0x2C5b7E89b8C5c9c3C7C8C5C9c3C7C8C5C9c3C7C8", // Placeholder
};

function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string | undefined;
    if (typeof arg === "string" && arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1] as string | undefined;
      if (typeof next === "string" && !next.startsWith("--")) {
        out[key] = next;
        i += 1;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

function isHexAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function resolveTokenSymbol(symbol: string): `0x${string}` | null {
  const upperSymbol = symbol.toUpperCase();
  if (upperSymbol === "AVAX" || upperSymbol === "ETH") {
    return null; // Native token, no contract address needed
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

function buildCheckoutLink(params: CheckoutParams): string {
  const base = "checkout://pay";
  const query = new URLSearchParams({
    to: params.to,
    amount: params.amount,
    token: params.token ?? "ETH",
    memo: params.memo ?? "",
  });
  return `${base}?${query.toString()}`;
}

function buildWebCheckoutLink(params: CheckoutParams): string {
  const base = "https://checkout.example.com/pay";
  const query = new URLSearchParams({
    to: params.to,
    amount: params.amount,
    token: params.token ?? "ETH",
    memo: params.memo ?? "",
  });
  return `${base}?${query.toString()}`;
}

async function confirmPrompt(questionText: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>(resolve => rl.question(q, resolve));
  const ans = (await ask(`${questionText} (y/N): `)).trim().toLowerCase();
  rl.close();
  return ans === "y" || ans === "yes";
}

async function initializeAgent() {
  try {
    const llm = new ChatOpenAI({
      model: "gpt-4o-mini",
      apiKey: process.env.OPENAI_API_KEY
    });
    

    // Initialize 0xGasless AgentKit
    const agentkit = await Agentkit.configureWithWallet({
      privateKey: process.env.PRIVATE_KEY as `0x${string}`,
      rpcUrl: process.env.RPC_URL as string,
      apiKey: process.env.API_KEY as string,
      chainID: Number(process.env.CHAIN_ID) || 43113,
    });
    

    // Initialize AgentKit Toolkit and get tools
    const agentkitToolkit = new AgentkitToolkit(agentkit);
    const tools = agentkitToolkit.getTools();

    const memory = new MemorySaver();
    const agentConfig = { configurable: { thread_id: "0xGasless AgentKit Chatbot Example!" } };

    const agent = createReactAgent({
      llm,
      tools,
      checkpointSaver: memory,
      messageModifier: `
        You are a helpful agent that can interact with EVM chains using 0xGasless smart accounts. You can perform 
        gasless transactions using the account abstraction wallet. You can check balances of ETH and any ERC20 token 
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

// For runAutonomousMode, runChatMode, chooseMode and main functions, reference:

/**
 * Run the agent autonomously with specified intervals
 *
 * @param agent - The agent executor
 * @param config - Agent configuration
 * @param interval - Time interval between actions in seconds
 */

//biome-ignore lint/suspicious/noExplicitAny: <explanation>
async function runAutonomousMode(agent: any, config: any, interval = 10) {
  console.log("Starting autonomous mode...");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const thought =
        "Be creative and do something interesting on the blockchain. " +
        "Choose an action or set of actions and execute it that highlights your abilities.";

      const stream = await agent.stream({ messages: [new HumanMessage(thought)] }, config);

      for await (const chunk of stream) {
        console.log(typeof chunk === "string" ? chunk : JSON.stringify(chunk));
        console.log("-------------------");
      }

      await new Promise(resolve => setTimeout(resolve, interval * 1000));
    } catch (error) {
      if (error instanceof Error) {
        console.error("Error:", error.message);
      }
      process.exit(1);
    }
  }
}

//biome-ignore lint/suspicious/noExplicitAny: <explanation>
async function runChatMode(agent: any, config: any) {
  console.log("Starting chat mode... Type 'exit' to end.");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise(resolve => rl.question(prompt, resolve));

  try {
    while (true) {
      const userInput = await question("\nPrompt: ");

      if (userInput.toLowerCase() === "exit") {
        break;
      }

      const stream = await agent.stream({ messages: [new HumanMessage(userInput)] }, config);

      for await (const chunk of stream) {
        console.log(typeof chunk === "string" ? chunk : JSON.stringify(chunk));
        console.log("-------------------");
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error:", error.message);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

async function chooseMode(): Promise<"chat" | "auto"> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise(resolve => rl.question(prompt, resolve));

  // eslint-disable-next-line no-constant-condition
  while (true) {
    console.log("\nAvailable modes:");
    console.log("1. chat    - Interactive chat mode");
    console.log("2. auto    - Autonomous action mode");

    const choice = (await question("\nChoose a mode (enter number or name): "))
      .toLowerCase()
      .trim();

    if (choice === "1" || choice === "chat") {
      rl.close();
      return "chat";
    } else if (choice === "2" || choice === "auto") {
      rl.close();
      return "auto";
    }
    console.log("Invalid choice. Please try again.");
  }
}

async function main() {
  try {
    const { agent, config } = await initializeAgent();

    // CLI checkout handling
    const args = parseArgs(process.argv.slice(2));
    if (args.checkout === "create" || args["checkout-create"]) {
      const to = String(args.to || "");
      const amount = String(args.amount || "");
      const tokenInput = args.token ? String(args.token) : "ETH";
      const memo = args.memo ? String(args.memo) : undefined;

      if (!isHexAddress(to)) {
        console.error("Invalid --to address");
        process.exit(1);
      }
      if (!amount) {
        console.error("Missing --amount");
        process.exit(1);
      }

      // Resolve token symbol to address
      let token = tokenInput;
      if (tokenInput.toUpperCase() !== "ETH") {
        const resolvedToken = resolveTokenSymbol(tokenInput);
        if (resolvedToken) {
          token = resolvedToken;
          console.log(`Resolved ${tokenInput.toUpperCase()} to: ${resolvedToken}`);
        } else {
          console.warn(`Warning: Unknown token symbol "${tokenInput}". Using as address.`);
        }
      }

      const params = { to, amount, token, memo };
      const link = buildCheckoutLink(params);
      const webLink = buildWebCheckoutLink(params);
      
      console.log("Checkout link:", link);
      console.log("Web link:", webLink);
      console.log(`\nPayment Details:`);
      console.log(`  To: ${to}`);
      console.log(`  Amount: ${amount} ${getTokenDisplayName(token)}`);
      if (memo) console.log(`  Memo: ${memo}`);
      return;
    }

    if (args.checkout === "pay" || args["checkout-pay"]) {
      const to = String(args.to || "");
      const amount = String(args.amount || "");
      const tokenInput = args.token ? String(args.token) : "ETH";
      const memo = args.memo ? String(args.memo) : undefined;

      if (!isHexAddress(to)) {
        console.error("Invalid --to address");
        process.exit(1);
      }
      if (!amount) {
        console.error("Missing --amount");
        process.exit(1);
      }

      // Resolve token symbol to address
      let token = tokenInput;
      if (tokenInput.toUpperCase() !== "ETH") {
        const resolvedToken = resolveTokenSymbol(tokenInput);
        if (resolvedToken) {
          token = resolvedToken;
          console.log(`Resolved ${tokenInput.toUpperCase()} to: ${resolvedToken}`);
        } else {
          console.warn(`Warning: Unknown token symbol "${tokenInput}". Using as address.`);
        }
      }

      console.log("About to pay:");
      console.log("  To:", to);
      console.log("  Amount:", amount);
      console.log("  Token:", getTokenDisplayName(token));
      if (memo) console.log("  Memo:", memo);

      // Check balance before payment
      console.log("\nChecking balance...");
      const balanceInstruction = token.toUpperCase() === "ETH" 
        ? `Check my ETH balance`
        : `Check my balance of token ${token}`;
      
      const balanceStream = await agent.stream({ messages: [new HumanMessage(balanceInstruction)] }, config);
      for await (const chunk of balanceStream) {
        console.log(typeof chunk === "string" ? chunk : JSON.stringify(chunk));
      }

      const ok = await confirmPrompt("\nProceed with gasless payment?");
      if (!ok) {
        console.log("Cancelled.");
        return;
      }

      const instruction = token.toUpperCase() === "ETH"
        ? `Send ${amount} ETH to ${to} gaslessly${memo ? ` with memo: ${memo}` : ""}.`
        : `Send ${amount} of token ${token} to ${to} gaslessly${memo ? ` with memo: ${memo}` : ""}.`;

      console.log("\nExecuting payment...");
      const stream = await agent.stream({ messages: [new HumanMessage(instruction)] }, config);
      for await (const chunk of stream) {
        console.log(typeof chunk === "string" ? chunk : JSON.stringify(chunk));
        console.log("-------------------");
      }
      return;
    }

    // Balance check command
    if (args.balance) {
      const tokenInput = String(args.balance);
      let token = tokenInput;
      
      if (tokenInput.toUpperCase() !== "ETH") {
        const resolvedToken = resolveTokenSymbol(tokenInput);
        if (resolvedToken) {
          token = resolvedToken;
          console.log(`Checking balance for ${tokenInput.toUpperCase()} (${resolvedToken})`);
        } else {
          console.log(`Checking balance for token: ${tokenInput}`);
        }
      } else {
        console.log("Checking ETH balance");
      }

      const instruction = token.toUpperCase() === "ETH" 
        ? `Check my ETH balance`
        : `Check my balance of token ${token}`;
      
      const stream = await agent.stream({ messages: [new HumanMessage(instruction)] }, config);
      for await (const chunk of stream) {
        console.log(typeof chunk === "string" ? chunk : JSON.stringify(chunk));
      }
      return;
    }

    // default: chat mode
    await runChatMode(agent, config);
    // if (mode === "chat") {
    // } else {
    //   await runAutonomousMode(agent, config);
    // }
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error:", error.message);
    }
    process.exit(1);
  }
}

// Bun/ESM entrypoint (replaces require.main === module in ESM)
if (import.meta.main) {
  console.log("Starting Agent...");
  main().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
