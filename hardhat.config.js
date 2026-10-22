import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: {
    version: "0.8.34",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    // `localhost` (http://localhost:8545, started with `npm run chain`) is built in.
    sepolia: {
      type: "http",
      chainType: "l1",
      url: process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
      // Set with `npx hardhat keystore set SEPOLIA_PRIVATE_KEY` (or the env var of the same name).
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  },
  // Optional: `npx hardhat verify --network sepolia <address>` publishes the source on Etherscan.
  verify: { etherscan: { apiKey: configVariable("ETHERSCAN_API_KEY") } },
});
