require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { ARBITRUM_RPC_URL, ARBITRUM_SEPOLIA_RPC_URL, PRIVATE_KEY } = process.env;

const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    arbitrum: {
      url: ARBITRUM_RPC_URL || "",
      accounts,
      chainId: 42161,
    },
    arbitrumSepolia: {
      url: ARBITRUM_SEPOLIA_RPC_URL || "",
      accounts,
      chainId: 421614,
    },
  },
};
