// Everything that talks to the blockchain, the wallet, or the relayer.
import {
  BrowserProvider,
  Contract,
  FallbackProvider,
  FetchRequest,
  getAddress,
  isAddress,
  isError,
  JsonRpcProvider,
} from "ethers";
import deployments from "../../deployments.json";

const NETWORKS = {
  11155111: {
    name: "Sepolia",
    rpcs: ["https://ethereum-sepolia-rpc.publicnode.com", "https://sepolia.drpc.org"],
    explorer: "https://sepolia.etherscan.io",
    faucet: "https://cloud.google.com/application/web3/faucet/ethereum/sepolia",
  },
  31337: { name: "Localhost 8545", rpcs: ["http://127.0.0.1:8545"] },
};

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || (import.meta.env.DEV ? 31337 : 11155111));
export const NETWORK = NETWORKS[CHAIN_ID];
const deployment = deployments[CHAIN_ID];
export const CONTRACT_ADDRESS = deployment?.address;

function rpc(url) {
  const request = new FetchRequest(url);
  request.timeout = 10_000;
  return new JsonRpcProvider(request, CHAIN_ID, { staticNetwork: true });
}
// VITE_RPC_URL may list several endpoints, comma-separated.
const urls = import.meta.env.VITE_RPC_URL ? import.meta.env.VITE_RPC_URL.split(",") : NETWORK.rpcs;
// Reads never need a wallet. With several RPCs, any one that answers is enough.
export const reader = urls.length > 1 ? new FallbackProvider(urls.map(rpc), CHAIN_ID, { quorum: 1 }) : rpc(urls[0]);
export const voting = deployment ? new Contract(deployment.address, deployment.abi, reader) : null;

export const txUrl = (hash) => NETWORK.explorer && `${NETWORK.explorer}/tx/${hash}`;
export const addressUrl = (address) => NETWORK.explorer && `${NETWORK.explorer}/address/${address}`;
export const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

// ---------- Wallet ----------

export const wallet = globalThis.window?.ethereum;
const isMobile = /Android|iPhone|iPad|iPod/i.test(globalThis.navigator?.userAgent ?? "");
export const getWalletLink = () =>
  isMobile
    ? { href: `https://metamask.app.link/dapp/${location.host}${location.pathname}${location.hash}`, label: "Open in MetaMask" }
    : { href: "https://metamask.io/download/", label: "Install MetaMask" };

export async function getAccount({ prompt = false } = {}) {
  const accounts = await wallet.request({ method: prompt ? "eth_requestAccounts" : "eth_accounts" });
  return accounts[0] ? getAddress(accounts[0]) : null;
}

export const getWalletChainId = async () => Number(await wallet.request({ method: "eth_chainId" }));

export async function switchNetwork() {
  const chainId = `0x${CHAIN_ID.toString(16)}`;
  try {
    await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    const code = error?.code ?? error?.data?.originalError?.code;
    if (code !== 4902) throw error; // 4902: the wallet doesn't know this network yet
    await wallet.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: NETWORK.name,
          rpcUrls: [NETWORK.rpcs[0]],
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          ...(NETWORK.explorer && { blockExplorerUrls: [NETWORK.explorer] }),
        },
      ],
    });
  }
}

// A fresh provider per action, checked against the expected chain, so a network
// switch in MetaMask can never send a transaction to the wrong chain.
async function getSigner() {
  const provider = new BrowserProvider(wallet);
  const { chainId } = await provider.getNetwork();
  if (Number(chainId) !== CHAIN_ID) throw new Error(`Switch your wallet to ${NETWORK.name} first.`);
  return provider.getSigner();
}

export const writableVoting = async () => voting.connect(await getSigner());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Polls the app's own RPC (not the wallet's) so data refreshed afterwards already
// includes the transaction.
export async function confirmed(hash) {
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    const receipt = await reader.getTransactionReceipt(hash).catch(() => null);
    if (receipt) {
      if (receipt.status !== 1) throw new Error("The transaction failed on the blockchain, so nothing changed.");
      return receipt;
    }
    await sleep(1500);
  }
  throw new Error("The network hasn't confirmed this yet. Check your wallet's activity, then refresh the page.");
}

// ---------- Reading polls ----------

const toPoll = (id, p) => ({
  id,
  title: p.title,
  options: [...p.options],
  votes: p.votes.map(Number),
  start: Number(p.startTime) * 1000,
  end: Number(p.endTime) * 1000,
  restricted: p.restricted,
  endedEarly: p.endedEarly,
  voterCount: Number(p.voterCount),
  totalVotes: Number(p.totalVotes),
});

export async function loadPoll(id, account) {
  const [poll, votedFor, eligible] = await Promise.all([
    voting.getPoll(id),
    account ? voting.votedFor(id, account) : 0n,
    account ? voting.isEligible(id, account) : false,
  ]);
  // myVote is the chosen option index, or -1 when this wallet hasn't voted.
  return { ...toPoll(id, poll), myVote: Number(votedFor) - 1, eligible };
}

// ponytail: loads the newest 50 polls; add paging if a deployment ever holds more.
export async function loadPolls(account) {
  const count = Number(await voting.pollCount());
  const ids = Array.from({ length: Math.min(count, 50) }, (_, i) => count - 1 - i);
  return Promise.all(ids.map((id) => loadPoll(id, account)));
}

// ---------- Voting ----------

const VOTE_TYPES = {
  Vote: [
    { name: "pollId", type: "uint256" },
    { name: "option", type: "uint256" },
    { name: "voter", type: "address" },
  ],
};

/** The free voting service failed in a way where paying the fee yourself can still work. */
export class RelayUnavailable extends Error {}

export async function relayerReady() {
  try {
    const health = await (await fetch("api/health", { cache: "no-store" })).json();
    return Boolean(
      health.ok &&
        health.canPay &&
        health.chainId === CHAIN_ID &&
        health.contract?.toLowerCase() === CONTRACT_ADDRESS?.toLowerCase(),
    );
  } catch {
    return false;
  }
}

/** Gas-free vote: the voter signs, the relayer submits. Returns the transaction hash. */
export async function voteFree(pollId, option) {
  const signer = await getSigner();
  const voter = await signer.getAddress();
  const domain = { name: "Absolute Vote", version: "1", chainId: CHAIN_ID, verifyingContract: CONTRACT_ADDRESS };
  const signature = await signer.signTypedData(domain, VOTE_TYPES, { pollId, option, voter });

  let response;
  try {
    response = await fetch("api/relay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pollId, option, voter, signature }),
    });
  } catch {
    throw new RelayUnavailable("Couldn't reach the free voting service.");
  }
  const body = await response.json().catch(() => ({}));
  if (response.ok && body.txHash) return body.txHash;
  if (body.error === "rejected") {
    // The contract itself would refuse this vote, so paying the fee wouldn't help.
    const error = new Error(body.reason || "The vote was rejected.");
    error.revert = body.data ? voting.interface.parseError(body.data) : null;
    throw error;
  }
  throw new RelayUnavailable(body.error || "The free voting service is unavailable right now.");
}

/** Normal vote: the voter's wallet sends the transaction and pays the fee. */
export async function voteWithFee(pollId, option) {
  const tx = await (await writableVoting()).vote(pollId, option);
  return tx.hash;
}

// ---------- Admin helpers ----------

/** Arguments of the first `name` event in a transaction receipt. */
export function findEvent(receipt, name) {
  for (const log of receipt.logs) {
    const event = voting.interface.parseLog(log);
    if (event?.name === name) return event.args;
  }
}

/** Splits pasted text into unique checksummed addresses and the entries that aren't valid. */
export function parseAddresses(text) {
  const entries = text.split(/[\s,;]+/).filter(Boolean);
  const valid = new Set();
  const invalid = [];
  for (const entry of entries) {
    // isAddress also rejects mixed-case addresses with a bad checksum, which catches typos.
    if (isAddress(entry)) valid.add(getAddress(entry));
    else invalid.push(entry);
  }
  return { addresses: [...valid], invalid, duplicates: entries.length - invalid.length - valid.size };
}

// One transaction per 200 addresses stays well under Ethereum's per-transaction gas cap.
export const VOTER_BATCH = 200;
export const batches = (list) =>
  Array.from({ length: Math.ceil(list.length / VOTER_BATCH) }, (_, i) =>
    list.slice(i * VOTER_BATCH, (i + 1) * VOTER_BATCH),
  );

// ---------- Errors in plain English ----------

const CONTRACT_ERRORS = {
  NotAdmin: "Only the admin wallet can do that.",
  InvalidPoll: "That poll doesn't exist.",
  InvalidSetup: "Check the poll details: a title, 2–20 options and a duration between 1 minute and 365 days.",
  PollClosed: "Voting on this poll has closed.",
  NotRestricted: "This poll is open to everyone, so it doesn't use an allowlist.",
  NotEligible: "Your wallet isn't on this poll's allowlist. Send your address to the poll admin to be added.",
  AlreadyVoted: "This wallet has already voted in this poll.",
  InvalidOption: "That option doesn't exist.",
  BadSignature: "The vote signature didn't match your wallet. Please try again.",
};

export function explain(error) {
  const reverted = CONTRACT_ERRORS[error?.revert?.name];
  if (reverted) return reverted;
  if (isError(error, "ACTION_REJECTED") || error?.code === 4001) return "You cancelled the request in your wallet.";
  if (error?.code === -32002 || error?.error?.code === -32002) {
    return "Your wallet already has a request waiting. Open MetaMask to finish it.";
  }
  if (isError(error, "INSUFFICIENT_FUNDS") || /insufficient funds|enough funds/i.test(error?.message ?? "")) {
    return `Your wallet needs a little ${NETWORK.name} ETH to pay the network fee.`;
  }
  if (["NETWORK_ERROR", "TIMEOUT", "SERVER_ERROR"].some((code) => isError(error, code))) {
    return "Can't reach the network right now. Check your connection and try again.";
  }
  return error?.shortMessage || error?.message || "Something went wrong. Please try again.";
}
