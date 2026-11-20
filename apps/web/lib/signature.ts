import "server-only";
import { chains, checkSignature, createClient, createEtherscan } from "@plaintx/chain";
import { decodeSignature, parseTypedData } from "@plaintx/core";
import { BusyError } from "@plaintx/limits";
import { BaseError } from "viem";
import { cacheOptions } from "./cache";
import { etherscanThrottle } from "./limits";
import { type SignatureResult, toSignatureResult } from "./signature-view";
import { CHAIN_OPTIONS } from "./types";

/**
 * Checks pasted EIP-712 typed data with the server's API keys (ADR 0016). Throws
 * TypedDataError for input we cannot read; its message is meant for the user. Provider keys
 * and URLs never leave the server: other errors are reduced to a redacted message.
 */
export async function runSignatureCheck(input: string): Promise<SignatureResult> {
  const request = decodeSignature(parseTypedData(input));
  const now = Math.floor(Date.now() / 1000);
  const option = CHAIN_OPTIONS.find((c) => c.chainId === request.chainId && c.scannable);
  const rpcUrl = option ? process.env[chains[option.name].rpcEnv] : undefined;
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (option && (!rpcUrl || !apiKey)) {
    throw new Error(`Server is missing ${chains[option.name].rpcEnv} or ETHERSCAN_API_KEY`);
  }

  try {
    const report = await checkSignature({
      request,
      // A chain we don't scan is still decoded and explained, but its addresses go unchecked.
      client: option && rpcUrl ? createClient(option.name, rpcUrl) : null,
      etherscan: createEtherscan({
        apiKey: apiKey ?? "",
        throttle: etherscanThrottle(apiKey ?? ""),
      }),
      now,
      ...cacheOptions(),
    });
    return toSignatureResult(report, now);
  } catch (error) {
    if (error instanceof BusyError) throw error;
    const message = error instanceof BaseError ? error.shortMessage : String(error);
    let redacted = message.replace(/https?:\/\/\S+/g, "<URL>");
    for (const secret of [rpcUrl, apiKey]) {
      if (secret) redacted = redacted.replaceAll(secret, "<redacted>");
    }
    throw new Error(redacted);
  }
}
