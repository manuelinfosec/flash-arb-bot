# flash-arb-bot

An Aave V3 flash-loan arbitrage bot for Arbitrum. It borrows tokens with **zero collateral**,
swaps them across two DEXs in one atomic transaction, and keeps the profit — or, if the trade
isn't profitable, the whole transaction reverts and the loan is undone automatically. Everything
here is designed to run on a schedule via GitHub Actions, so it works with nothing but a phone
and free-tier accounts.

## ⚠️ Read this first

- **This is not a guaranteed money-maker.** Flash-loan arbitrage is a mature, heavily-competed
  space: professional bots with private nodes and MEV infrastructure catch almost every
  meaningful price gap within a block or two. This bot can absolutely find and execute real
  opportunities, but don't expect steady income from it.
- **"$0 upfront" is true for the trade capital, not for gas.** The flash loan itself never
  requires you to hold the borrowed asset — that's the whole point of a flash loan. But
  *submitting the transaction* costs a small amount of ETH in gas, the same as any Arbitrum
  transaction, whether or not the arbitrage succeeds. See "The gas question" below.
- **Nothing trades until you explicitly turn it on.** The bot defaults to `DRY_RUN=true`: it
  scans and logs opportunities but never sends a transaction. You have to deliberately set
  `DRY_RUN=false` and fund a wallet before any real money moves.
- **Use a burner wallet.** Never put your main wallet's private key into a bot or a CI secret.
  Create a wallet with no funds beyond what you're willing to risk, specifically for this bot.
- This is educational/personal-use software, not audited, and provided with no warranty (see
  [LICENSE](LICENSE)). Review the contract yourself before sending it real funds.

## How it works

1. `FlashArbExecutor.sol` asks Aave V3's Pool for a flash loan of some token — no collateral,
   just a promise to repay it (plus a 0.05% fee) by the end of the transaction.
2. It swaps the borrowed token for an intermediate token on one DEX, then swaps that back to the
   original token on a second DEX.
3. If the round trip didn't produce enough to repay the loan plus your configured minimum profit,
   the `require` guard reverts — which undoes *everything*, including the loan, atomically. You
   only lose the gas for the attempt, never the borrowed capital.
4. If it did clear the bar, the loan + fee are repaid and the surplus is sent to the contract
   owner (you).

Off-chain, a small Node.js scanner (`bot/`) periodically checks live DEX prices, estimates
profit after fees and gas, and calls `startArbitrage` only when a trade looks worthwhile — the
on-chain `require` is the real safety net; the off-chain check just avoids wasting gas on
attempts that clearly won't clear it.

## The gas question

I looked into free gas-sponsoring relayers (Gelato Relay, Biconomy, ERC-4337 paymasters, etc.)
so this could be truly $0 end-to-end. None of them work out for this: every one of them requires
*someone* to pre-fund a sponsor balance or paymaster deposit — there's no free-forever tier that
covers arbitrary mainnet contract calls indefinitely. So the honest answer is:

- Fund your burner wallet with a small amount of ETH on Arbitrum — a few dollars covers a large
  number of transaction attempts, since Arbitrum gas is cheap (typically fractions of a cent to
  a few cents per tx).
- Until you do that, leave `DRY_RUN=true`. The bot is fully useful in that mode: you get a live
  log of what it *would* have done and its estimated profit, with zero cost or risk.
- If you'd rather not risk even a few dollars, test everything on **Arbitrum Sepolia** (the
  testnet) first, funded by a free faucet — see the walkthrough below.

## Quick start — entirely from an iPhone

Everything below works from mobile Safari (or the GitHub app) plus GitHub's website. No
terminal, no laptop, no code editing required.

### 1. Get a free Arbitrum RPC URL

Sign up (free tier) at [Alchemy](https://www.alchemy.com/) or [Infura](https://www.infura.io/),
create an app for "Arbitrum One" (mainnet) and, if you want to test on testnet first, "Arbitrum
Sepolia" too. Copy the HTTPS RPC URL for each.

### 2. Create a burner wallet

Install [MetaMask](https://metamask.io/) (or any wallet app), create a **new** wallet you'll use
only for this bot, and export its private key (MetaMask: Account details → Show private key).
Keep this private key out of chat, screenshots, and anywhere public — GitHub Secrets (next
step) is the only place it should go.

### 3. Set your GitHub repository secrets

In this repo on GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
Add these (see [`.env.example`](.env.example) for the exact shape of the JSON ones):

| Secret | Required for | Notes |
| --- | --- | --- |
| `ARBITRUM_RPC_URL` | scanning | from step 1 |
| `ARBITRUM_SEPOLIA_RPC_URL` | testnet deploy | from step 1, only if testing first |
| `DRY_RUN` | always | `true` until you're ready to go live |
| `PRIVATE_KEY` | deploying / going live | your burner wallet's key, from step 2 |
| `AAVE_POOL_ADDRESSES_PROVIDER` | deploying | see step 4 |
| `CONTRACT_ADDRESS` | going live | filled in after you deploy (step 5) |
| `ETH_USD_ROUTE_JSON` | USD profit filtering | see step 4 |
| `PAIRS_CONFIG_JSON` | scanning | see step 4 |

### 4. Look up current addresses

Contract addresses on Arbitrum can change between protocol versions, so this repo deliberately
does **not** hardcode them — a wrong guess could silently point the bot at the wrong contract.
Look these up yourself, from the projects' own docs, in mobile Safari:

- **Aave V3 PoolAddressesProvider (Arbitrum)**:
  <https://docs.aave.com/developers/deployed-contracts/v3-mainnet/arbitrum>
- **Uniswap V3 SwapRouter02 & QuoterV2 (Arbitrum)**:
  <https://docs.uniswap.org/contracts/v3/reference/deployments/arbitrum-deployments>
- **SushiSwap V2 Router (Arbitrum)** or **Camelot V2 Router** (either works as your V2-style
  leg): check each project's docs/GitHub for their current Arbitrum deployment address.
- **WETH / USDC on Arbitrum**: also listed on the Uniswap/Aave docs pages above.

Use these to fill in `AAVE_POOL_ADDRESSES_PROVIDER`, and the `PAIRS_CONFIG_JSON` /
`ETH_USD_ROUTE_JSON` secrets (templates and field explanations are in
[`.env.example`](.env.example)).

### 5. Deploy the contract

Go to this repo's **Actions** tab → **Deploy FlashArbExecutor** → **Run workflow**. Pick
`arbitrumSepolia` first (free testnet — get test ETH from
[an Arbitrum Sepolia faucet](https://www.alchemy.com/faucets/arbitrum-sepolia) for your burner
wallet before running it), confirm it works, then re-run with `arbitrum` for the real deployment
(this needs a small amount of real ETH in your burner wallet for gas).

Open the workflow run's log and copy the printed contract address into your `CONTRACT_ADDRESS`
secret.

### 6. Watch it scan

The **Flash arb scan** workflow runs automatically every ~10 minutes (and you can trigger it by
hand from the Actions tab). With `DRY_RUN=true`, check its logs — you'll see every trade size it
checked and any opportunities found, with zero cost or risk.

### 7. Go live (optional, real money)

Once you're comfortable with what you're seeing in simulation mode: fund your burner wallet with
a small amount of real ETH on Arbitrum, set the `DRY_RUN` secret to `false`, and the next
scheduled run will start submitting real transactions when it finds something profitable.

## Configuring pairs & DEXs

`PAIRS_CONFIG_JSON` is a JSON array — each entry is one borrow/swap/swap-back route to scan,
across chosen trade sizes. Full field reference and a worked example are in
[`.env.example`](.env.example). A couple of things worth knowing:

- The bot can only convert profit into a USD figure (for `MIN_PROFIT_USD` filtering) when the
  borrowed token is WETH (`isWeth: true`) or a USD stablecoin (`isStable: true`). For anything
  else, it skips USD filtering and relies on the raw on-chain profit check instead.
- `ETH_USD_ROUTE_JSON` prices gas in USD by quoting 1 WETH against a stablecoin on a real DEX
  pool — no external price API or key needed.
- A "V3" leg needs both `router` (the SwapRouter used to execute the swap) and `quoter` (the
  separate QuoterV2 contract used only to check prices) — Uniswap V3's SwapRouter doesn't expose
  a quoting function itself.

## Try it risk-free on a local mock network

If you (or a friend) have a computer handy, you can exercise the entire pipeline — contract,
scanner, and live execution — against fake tokens and fake liquidity, with zero real network
calls and zero real funds:

```bash
npm install
npx hardhat node                                        # terminal 1: local test chain
npx hardhat run scripts/seedLocalMocks.js --network localhost   # terminal 2: deploy + seed mocks
# copy the printed .env values, then:
DRY_RUN=false npm run scan                               # exercises the full on-chain execution path
```

This is also what the test suite (`npm test`) exercises at the unit level — see
`test/FlashArbExecutor.test.js`.

## Configuration reference

See [`.env.example`](.env.example) for every environment variable / secret this project reads,
with inline explanations — RPC URL, `DRY_RUN`, gas and slippage tuning, `MIN_PROFIT_USD`, and the
`PAIRS_CONFIG_JSON` / `ETH_USD_ROUTE_JSON` shapes.

## Security notes

- `startArbitrage`, `sweepToken`, and `sweepNative` on `FlashArbExecutor` are all
  `onlyOwner` — only the deployer's wallet (your burner wallet) can trigger trades or withdraw
  funds.
- The contract holds no funds between trades in normal operation (profit is forwarded to the
  owner at the end of each successful trade); `sweepToken`/`sweepNative` exist only to recover
  dust left behind by an edge case.
- This contract has **not** been professionally audited. Treat it as a personal/educational
  project, start on testnet, and only risk amounts you're prepared to lose.

## License

[MIT](LICENSE)
