// Deploys Voting and records its address + ABI for this chain in deployments.json,
// the file both the web app and the relayer read.
import { readFile, writeFile } from "node:fs/promises";
import { artifacts, network } from "hardhat";

const FILE = new URL("../deployments.json", import.meta.url);

const { ethers } = await network.create();
const [deployer] = await ethers.getSigners();
const { chainId } = await ethers.provider.getNetwork();

console.log(`Deploying Voting to chain ${chainId} from ${deployer.address} ...`);
const voting = await ethers.deployContract("Voting");
await voting.waitForDeployment();
const address = await voting.getAddress();

const deployments = JSON.parse(await readFile(FILE, "utf8").catch(() => "{}"));
deployments[chainId] = { address, abi: (await artifacts.readArtifact("Voting")).abi };
await writeFile(FILE, `${JSON.stringify(deployments, null, 2)}\n`);

console.log(`\nVoting deployed at ${address}`);
console.log(`Admin wallet: ${deployer.address}`);
console.log("Saved to deployments.json. Commit it so the web app and relayer use this contract.");
