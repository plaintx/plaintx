# 6. Upgradeable spenders

Date: 2026-10-11

## Status

Accepted

## Context

A spender with standing approvals is only as trustworthy as whoever can change its code. Many
contracts are proxies: the address users approve stays the same while an admin swaps the
logic behind it. If one key controls that and it is stolen or misused, a well-known app can be
turned into a drainer for every wallet that approved it, with no time for users to react.
ADR 0005 marks spenders "known" but says nothing about this.

## Decision

- `packages/chain` (`readUpgradeability`) reads standard proxy storage slots for every contract
  spender, known or not:
  - EIP-1967 implementation, admin and beacon slots (transparent, UUPS and beacon proxies);
  - EIP-1822 `PROXIABLE` slot;
  - pre-EIP-1967 OpenZeppelin slots (`org.zeppelinos.proxy.*`, used by USDC and others).
- It then finds the **controller**: the admin slot, or `owner()` for UUPS proxies and beacons,
  following `owner()` up to two hops (e.g. proxy → ProxyAdmin → Safe). Each controller is:
  - `single-key`: no contract code (a personal wallet, including EIP-7702 delegated ones), or a
    Safe-style multisig with a threshold of 1;
  - `multisig`: `getThreshold()` above 1, with the owner count;
  - `timelock`: `getMinDelay()` or `delay()` above zero, with the delay. A zero delay is treated
    like any other admin contract;
  - `unknown`: anything else.
- The result is a new `upgradeability` fact on `SpenderInfo`; `packages/core` stays free of I/O.
- New rule `upgradeable-single-key` (caution): a proxy whose controller is a single key. This
  amends the table in ADR 0003. Multisig, timelock and unknown controllers raise no finding and
  are shown as information.
- Failed calls (revert, missing function, unexpected data) mean "not this kind of contract".
  Network errors are thrown, so a flaky RPC never turns into a wrong answer.

## Consequences

- Live checks (2026-10-11): Uniswap V2 Router, Permit2, CoW Vault Relayer: no proxy. Compound
  v3 USDC: 2-day timelock. Aave V3 Pool: upgradeable, controller unknown (its admin is fixed in
  the proxy's bytecode, not in a slot). USDC: upgradeable by a single key.
- `proxy: "none"` only means no standard pattern was found. Custom proxies (e.g. Aragon's,
  used by Lido stETH), diamonds (EIP-2535) and contracts that can self-destruct or delegate to
  changeable code are not detected.
- A timelock's own proposer is not inspected, and a short delay (minutes) still counts as a
  timelock. Revisit with a minimum delay if that is abused.
- Each contract spender costs about 4–10 extra RPC calls per scan; caching is future work.
