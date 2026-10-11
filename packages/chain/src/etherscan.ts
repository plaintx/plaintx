import type { Address } from "@plaintx/core";

const API_URL = "https://api.etherscan.io/v2/api";

/** Free-tier keys allow 5 calls per second; stay just under it. */
const MIN_INTERVAL_MS = 220;
const MAX_RETRIES = 3;

/** Etherscan returns at most this many logs per request. */
export const PAGE_SIZE = 1000;

export interface EtherscanLog {
  address: Address;
  topics: `0x${string}`[];
  data: `0x${string}`;
  blockNumber: `0x${string}`;
}

export interface LogQuery {
  chainId: number;
  /** Contract that emitted the logs. Omit to search every contract. */
  address?: Address;
  topic0: `0x${string}`;
  /** Matched with AND against topic0. */
  topic1: `0x${string}`;
  fromBlock: number;
}

export interface Etherscan {
  /** One page of up to PAGE_SIZE logs, oldest first, from `fromBlock` to the latest block. */
  getLogs(query: LogQuery): Promise<EtherscanLog[]>;
  /** Whether the contract's source is verified. */
  isVerified(chainId: number, address: Address): Promise<boolean>;
}

export interface EtherscanOptions {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
}

interface Response {
  status: string;
  message: string;
  result: unknown;
}

export function createEtherscan({
  apiKey,
  fetch = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: EtherscanOptions): Etherscan {
  let lastCall = 0;

  async function call(params: Record<string, string>): Promise<Response> {
    const url = `${API_URL}?${new URLSearchParams({ ...params, apikey: apiKey })}`;
    for (let attempt = 0; ; attempt++) {
      const wait = lastCall + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastCall = Date.now();

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
      const body = (await res.json()) as Response;

      const error = body.status === "0" && typeof body.result === "string" ? body.result : null;
      if (error && /rate limit/i.test(error) && attempt < MAX_RETRIES) {
        await sleep(1000);
        continue;
      }
      if (error && !/no records found/i.test(body.message)) {
        throw new Error(`Etherscan: ${error}`);
      }
      return body;
    }
  }

  return {
    async getLogs({ chainId, address, topic0, topic1, fromBlock }) {
      const body = await call({
        chainid: String(chainId),
        module: "logs",
        action: "getLogs",
        fromBlock: String(fromBlock),
        toBlock: "latest",
        topic0,
        topic1,
        topic0_1_opr: "and",
        page: "1",
        offset: String(PAGE_SIZE),
        ...(address ? { address } : {}),
      });
      return Array.isArray(body.result) ? (body.result as EtherscanLog[]) : [];
    },

    async isVerified(chainId, address) {
      const body = await call({
        chainid: String(chainId),
        module: "contract",
        action: "getsourcecode",
        address,
      });
      const [entry] = Array.isArray(body.result) ? body.result : [];
      return typeof entry?.SourceCode === "string" && entry.SourceCode !== "";
    },
  };
}
