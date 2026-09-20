const { ethers } = require("hardhat");

async function main() {
  const addressesProvider = process.env.AAVE_POOL_ADDRESSES_PROVIDER;
  if (!addressesProvider) {
    throw new Error(
      "Set AAVE_POOL_ADDRESSES_PROVIDER in your .env - look up the current Arbitrum address at " +
        "https://docs.aave.com/developers/deployed-contracts/v3-mainnet/arbitrum before deploying, " +
        "since deployed addresses can change and a wrong one will make the contract unusable."
    );
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deploying FlashArbExecutor with account:", deployer.address);

  const FlashArbExecutor = await ethers.getContractFactory("FlashArbExecutor");
  const executor = await FlashArbExecutor.deploy(addressesProvider, deployer.address);
  await executor.waitForDeployment();

  const address = await executor.getAddress();
  console.log("FlashArbExecutor deployed to:", address);
  console.log("Owner set to:", deployer.address);
  console.log("Save this address as CONTRACT_ADDRESS in your bot secrets/.env.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
