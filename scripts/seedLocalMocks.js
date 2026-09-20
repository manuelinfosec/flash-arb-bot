const { ethers } = require("hardhat");

/// Deploys fake tokens, a fake Aave pool, and two fake DEX routers with a built-in 2% price gap,
/// then deploys FlashArbExecutor against them. Prints ready-to-paste .env values so the whole
/// bot (scan -> decide -> submit) can be exercised against a local Hardhat node with zero real
/// funds and zero real network calls. See README "Try it risk-free on a local mock network".
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying local mocks with account:", deployer.address);

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const weth = await MockERC20.deploy("Mock Wrapped Ether", "WETH");
  const usdc = await MockERC20.deploy("Mock USD Coin", "USDC");
  await weth.waitForDeployment();
  await usdc.waitForDeployment();

  const MockPool = await ethers.getContractFactory("MockPool");
  const pool = await MockPool.deploy();
  await pool.waitForDeployment();
  // Fund the mock Aave pool with enough WETH liquidity to cover flash loans.
  await weth.mint(await pool.getAddress(), ethers.parseEther("1000"));

  const MockPoolAddressesProvider = await ethers.getContractFactory("MockPoolAddressesProvider");
  const addressesProvider = await MockPoolAddressesProvider.deploy(await pool.getAddress());
  await addressesProvider.waitForDeployment();

  const FlashArbExecutor = await ethers.getContractFactory("FlashArbExecutor");
  const executor = await FlashArbExecutor.deploy(await addressesProvider.getAddress(), deployer.address);
  await executor.waitForDeployment();

  // legOut router: V2-style, WETH -> USDC at $2000/WETH.
  const MockRouter = await ethers.getContractFactory("MockRouter");
  const routerA = await MockRouter.deploy();
  await routerA.waitForDeployment();
  await routerA.setRate(await weth.getAddress(), await usdc.getAddress(), ethers.parseEther("2000"));

  // legBack router: V3-style, USDC -> WETH at a 2% better rate (1 / 1960), so the round trip is
  // profitable after Aave's 0.05% fee. A MockQuoterV3 reads the same rate for off-chain quoting.
  const routerB = await MockRouter.deploy();
  await routerB.waitForDeployment();
  const usdcToWethRate = (ethers.parseEther("1") * ethers.parseEther("1")) / ethers.parseEther("1960");
  await routerB.setRate(await usdc.getAddress(), await weth.getAddress(), usdcToWethRate);

  const MockQuoterV3 = await ethers.getContractFactory("MockQuoterV3");
  const quoterB = await MockQuoterV3.deploy(await routerB.getAddress());
  await quoterB.waitForDeployment();

  const wethAddr = await weth.getAddress();
  const usdcAddr = await usdc.getAddress();

  const pairsConfig = [
    {
      label: "Mock WETH/USDC (local)",
      borrowedToken: { address: wethAddr, decimals: 18, symbol: "WETH", isWeth: true },
      // MockERC20 doesn't override decimals(), so this mock "USDC" is 18 decimals, unlike real USDC.
      intermediateToken: { address: usdcAddr, decimals: 18, symbol: "USDC" },
      legOut: { kind: "V2", router: await routerA.getAddress(), tokenOut: usdcAddr },
      legBack: {
        kind: "V3",
        router: await routerB.getAddress(),
        quoter: await quoterB.getAddress(),
        tokenOut: wethAddr,
        v3Fee: 500,
      },
      tradeSizes: ["1", "5", "20"],
    },
  ];

  const ethUsdRoute = { kind: "V2", router: await routerA.getAddress(), weth: wethAddr, usdc: usdcAddr, usdcDecimals: 18 };

  console.log("\nLocal mocks deployed. Paste the following into your .env (or export them) to run the bot:\n");
  console.log(`ARBITRUM_RPC_URL=http://127.0.0.1:8545`);
  console.log(`CONTRACT_ADDRESS=${await executor.getAddress()}`);
  console.log(`PRIVATE_KEY=${process.env.LOCAL_HARDHAT_PRIVATE_KEY || "<paste a private key printed by `npx hardhat node`>"}`);
  console.log(`AAVE_FLASH_LOAN_PREMIUM_BPS=5`);
  console.log(`ETH_USD_ROUTE_JSON='${JSON.stringify(ethUsdRoute)}'`);
  console.log(`PAIRS_CONFIG_JSON='${JSON.stringify(pairsConfig)}'`);
  console.log("\nNote: the mock USDC token above is 18 decimals (MockERC20 doesn't mimic real USDC's 6), so the");
  console.log("decimals fields above are set to 18 to match - the built-in ~2% price gap comfortably covers the 0.05% fee.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
