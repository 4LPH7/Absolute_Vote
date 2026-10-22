# Absolute Vote: secure & transparent blockchain voting

A web app for running polls and elections on the Ethereum blockchain. An admin creates polls, voters connect MetaMask and vote once, and the results (with a donut chart and analysis) appear when voting closes. Every vote is recorded on-chain, so anyone can verify the count.

**Voting is free for voters:** they only sign their vote in MetaMask, and a small Flask relayer pays the network fee. The smart contract checks each signature, so the relayer can't fake or change votes. If the relayer is ever down, voters can still vote by paying the fee themselves.

## Features

**Admin**
- Create polls with 2–20 options, open from 1 minute up to 365 days
- Choose who can vote per poll: **anyone with a wallet**, or **only wallets on an allowlist** (paste hundreds of addresses at once; typos are caught)
- Add voters to an allowlist later, or end a poll early
- Admin login is simply connecting the wallet that deployed the contract: no passwords to leak

**Voters**
- Browse polls and results without a wallet; connect MetaMask to vote
- One vote per wallet per poll, enforced by the smart contract
- Free, signature-based voting, with an automatic fall-back to paying the fee
- Confirmation with a link to the transaction, and "You voted for …" on every device

**Results**
- Shown to everyone when the poll closes (the admin can watch them live)
- Donut chart with percentages plus a ranked table (the chart's colors are checked for colour-blind readers, in light and dark mode)
- Winner or tie, winning margin, turnout for allowlist polls, start/end times, and a link to verify every vote on Etherscan

**Reliability and usability**
- Clear, plain-English messages for every error (cancelled in wallet, wrong network, not enough test ETH, poll closed…)
- One-click network switching, a MetaMask install link (or "Open in MetaMask" on phones)
- Reads go through two public RPC endpoints, so one being down doesn't break the app
- Works on phones, follows the system's light/dark mode, keyboard and screen-reader friendly

## How it works

```
Browser (React + ethers)
 ├─ reads polls & results ───────────────► public RPC ──┐
 ├─ admin actions / self-paid votes ─► MetaMask ────────┼─► Voting contract (Sepolia)
 └─ signed vote (free) ─► Flask relayer /api/relay ─────┘   checks signature, 1 vote per wallet
```

| Path | What it is |
|---|---|
| `contracts/Voting.sol` | The smart contract: polls, allowlists, one vote per wallet, signed votes (EIP-712) |
| `test/Voting.js` | Contract tests (`npm test`) |
| `scripts/deploy.js` | Deploys the contract and records its address + ABI in `deployments.json` |
| `deployments.json` | Which contract to use on each network; read by both the web app and the relayer |
| `api/index.py` | Flask relayer: `GET /api/health`, `POST /api/relay` |
| `frontend/` | The React web app (Vite) |
| `vercel.json` | Hosting config: static site + Python function on Vercel |

## Run it on your computer

You need **Node.js 22+**, **Python 3.10+** and the **MetaMask** browser extension.

```bash
npm install
pip install -r requirements.txt     # ideally inside a virtualenv

npm run chain          # terminal 1: a local blockchain with 20 funded test accounts
npm run deploy:local   # terminal 2: deploy the voting contract to it
npm run dev            # terminal 2: open http://localhost:5173
python api/index.py    # terminal 3 (optional): the gas-free relayer on port 5000
```

Then in MetaMask:
1. Click **Switch to Localhost 8545** in the app (or add the network yourself: RPC `http://127.0.0.1:8545`, chain ID `31337`, symbol `ETH`).
2. Import **Account #0**'s private key from the `npm run chain` output: that wallet deployed the contract, so it's the admin.
3. Import a few other accounts to vote with. To try gas-free voting, create a brand-new empty account in MetaMask and vote with it while the relayer is running.

> The test accounts' keys are public. Never send real funds to them.

Run the contract tests with `npm test`.

## Put it online (Sepolia test network + Vercel)

Sepolia is Ethereum's free test network: it behaves like the real thing, but its ETH has no value and is free from faucets.

1. **Revoke the old Infura key.** An earlier version of this repo committed an Infura key in `backend/config.py`. It's still in the git history, so delete it in your Infura dashboard.
2. **Fund an admin wallet.** Use a MetaMask account just for this, and get free Sepolia ETH from a faucet such as [Google Cloud](https://cloud.google.com/application/web3/faucet/ethereum/sepolia) or [Alchemy](https://www.alchemy.com/faucets/ethereum-sepolia).
3. **Deploy the contract** from that wallet:
   ```bash
   npx hardhat keystore set SEPOLIA_PRIVATE_KEY   # paste the admin wallet's private key (stored encrypted)
   npm run deploy:sepolia
   ```
   This updates `deployments.json`. Commit and push it.
4. **Create a relayer wallet.** Make a second MetaMask account, send it about 0.05 Sepolia ETH (enough for hundreds of votes) and copy its private key.
5. **Deploy on Vercel.** Import the GitHub repo as a new project (the build settings come from `vercel.json`) and add these environment variables:
   - `RELAYER_PRIVATE_KEY`: the relayer wallet's private key
   - `RPC_URL`: `https://ethereum-sepolia-rpc.publicnode.com` (or your own Alchemy/Infura Sepolia URL)
6. **Check it:** `https://<your-app>.vercel.app/api/health` should show `"ok": true` and `"canPay": true`. Open the site, connect the admin wallet, create a poll and share its link.

Optional: publish the contract's source code on Etherscan so anyone can read it. Get a free Etherscan API key, run `npx hardhat keystore set ETHERSCAN_API_KEY`, then `npx hardhat verify --network sepolia <contract address>`.

Prefer static hosting only (for example GitHub Pages)? `npm run build` and publish `frontend/dist`. Everything works except gas-free voting, so voters pay the small fee themselves.

### Settings

| Variable | Where | What it does |
|---|---|---|
| `SEPOLIA_PRIVATE_KEY` | your computer (Hardhat keystore or env) | Admin wallet used by `npm run deploy:sepolia` |
| `SEPOLIA_RPC_URL` | your computer (optional) | RPC used to deploy (defaults to a public Sepolia RPC) |
| `RELAYER_PRIVATE_KEY` | Vercel | Wallet that pays the fee for free votes (optional locally) |
| `RPC_URL` | Vercel | RPC the relayer uses (defaults to `http://127.0.0.1:8545`) |
| `VITE_RPC_URL` | Vercel (optional) | RPC endpoints the website reads from, comma-separated (defaults to two public Sepolia RPCs) |
| `VITE_CHAIN_ID` | optional | `31337` (local) or `11155111` (Sepolia). Defaults: `npm run dev` → local, `npm run build` → Sepolia |

`VITE_*` values are read when the site is built; locally put them in `.env.local` at the repo root.

## Using the app

**Admins:** connect the admin wallet → **New poll** → fill in the question, options, duration and who can vote → **Review and create** → confirm in MetaMask. Share the poll's link with voters. On a live poll you can add voters to the allowlist or end it early.

**Voters:** open the link → **Connect wallet** → pick an option → **Cast vote** → confirm → sign in MetaMask. If a poll is allowlist-only and you're not on it, use **Copy my address** and send it to the admin.

## Security and privacy

- **Votes are public and pseudonymous.** Anyone can see which wallet chose which option, but not who owns the wallet. This is not a secret ballot.
- **Open polls allow one vote per wallet, not per person.** Someone with several wallets can vote several times, so use an allowlist for anything that matters.
- **The relayer can't forge or alter votes:** the contract only accepts a vote signed by the voter's own wallet, and each signature works once, on this contract only. If its key leaked, the worst case is someone spending its test ETH, so keep only a small balance on it. Scripted spam on an open poll could also use up that balance, so watch `/api/health` and top it up.
- **Contracts can't be edited after deployment.** Changing `Voting.sol` means deploying a new contract (old polls stay on the old one).

## Troubleshooting

| Problem | Fix |
|---|---|
| "Almost ready" page | The contract isn't deployed on that network yet. Run `npm run deploy:local` (local) or see *Put it online*. |
| "Can't reach …" page | Is `npm run chain` running? Online: check your connection, or set `VITE_RPC_URL` to your own RPC. |
| MetaMask shows stuck transactions or "nonce too high" after restarting `npm run chain` | MetaMask → Settings → Advanced → **Clear activity tab data**. |
| "Your wallet needs a little Sepolia ETH" | Get free test ETH from a faucet (links above), or use the free voting path. |
| Free voting not offered | Open `/api/health`: the relayer needs `RELAYER_PRIVATE_KEY`, a working `RPC_URL` and some Sepolia ETH. |

## Tech stack

- **Smart contract:** Solidity 0.8.34, OpenZeppelin (EIP-712 signatures), Hardhat 3
- **Backend:** Flask + web3.py relayer (Vercel Python function)
- **Frontend:** React 19, Vite, ethers 6, Chart.js
- **Wallet:** MetaMask (or any browser wallet)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

- **Ethereum**: For enabling secure and transparent voting through blockchain technology.
- **MetaMask**: For wallet management and transaction signing.
- **Flask**: For building the backend API.
- **Chart.js**: For the donut chart visualization.
- **OpenZeppelin**: For the audited signature-verification contracts.

---
## Author

- GitHub: [@4LPH7](https://github.com/4LPH7)

Feel free to contribute or suggest improvements!

---
### Show your support

Give a ⭐ if you like this website!

<a href="https://buymeacoffee.com/arulartadg" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-violet.png" alt="Buy Me A Coffee" height= "60px" width= "217px" ></a>
