import { getAddress } from "ethers";
import { useCallback, useEffect, useState } from "react";
import {
  addressUrl,
  CHAIN_ID,
  CONTRACT_ADDRESS,
  explain,
  getAccount,
  getWalletChainId,
  getWalletLink,
  NETWORK,
  reader,
  relayerReady,
  shortAddress,
  switchNetwork,
  voting,
  wallet,
} from "./chain.js";
import CreatePoll from "./CreatePoll.jsx";
import Poll from "./Poll.jsx";
import Polls from "./Polls.jsx";
import { ExternalLink, useRoute } from "./ui.jsx";

function useWallet() {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!wallet) return;
    // Restore a previous connection silently (no MetaMask popup on page load).
    getAccount().then(setAccount, () => {});
    getWalletChainId().then(setChainId, () => {});
    const onAccounts = (accounts) => setAccount(accounts[0] ? getAddress(accounts[0]) : null);
    const onChain = (id) => setChainId(Number(id));
    wallet.on?.("accountsChanged", onAccounts);
    wallet.on?.("chainChanged", onChain);
    return () => {
      wallet.removeListener?.("accountsChanged", onAccounts);
      wallet.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const run = useCallback(async (action) => {
    setError(null);
    try {
      await action();
      setChainId(await getWalletChainId());
    } catch (e) {
      setError(explain(e));
    }
  }, []);

  return {
    available: Boolean(wallet),
    account,
    onRightChain: chainId === CHAIN_ID,
    error,
    connect: () => run(async () => setAccount(await getAccount({ prompt: true }))),
    switchChain: () => run(switchNetwork),
  };
}

function useContractStatus() {
  const [state, setState] = useState({ status: "loading" });
  const check = useCallback(async () => {
    if (!voting) return setState({ status: "missing" });
    setState({ status: "loading" });
    try {
      // No code at the address: e.g. the local chain restarted without a redeploy.
      if ((await reader.getCode(CONTRACT_ADDRESS)) === "0x") return setState({ status: "missing" });
      setState({ status: "ready", admin: await voting.admin() });
    } catch {
      setState({ status: "offline" });
    }
  }, []);
  useEffect(() => {
    check();
  }, [check]);
  return { ...state, retry: check };
}

export default function App() {
  const route = useRoute();
  const walletState = useWallet();
  const contract = useContractStatus();
  const [gasless, setGasless] = useState(false);
  useEffect(() => {
    relayerReady().then(setGasless);
  }, []);

  const isAdmin = Boolean(walletState.account && walletState.account === contract.admin);
  const props = { wallet: walletState, isAdmin, admin: contract.admin, gasless, setGasless };

  let page;
  if (contract.status === "loading") page = <p className="muted">Connecting to {NETWORK.name}…</p>;
  else if (contract.status === "offline") page = <Offline retry={contract.retry} />;
  else if (contract.status === "missing") page = <NotDeployed />;
  else if (route.page === "poll") page = <Poll key={route.id} id={route.id} {...props} />;
  else if (route.page === "new") page = <CreatePoll {...props} />;
  else page = <Polls {...props} />;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a href="#/" className="brand">
            <span aria-hidden="true">🗳️</span> Absolute Vote
          </a>
          <span className="pill" title="The blockchain network this app uses">
            {NETWORK.name}
          </span>
          <nav className="topbar-actions" aria-label="Account">
            {isAdmin && route.page !== "new" && (
              <a className="button small" href="#/new">
                New poll
              </a>
            )}
            <WalletButton wallet={walletState} isAdmin={isAdmin} />
          </nav>
        </div>
      </header>
      {walletState.error && (
        <p className="banner error" role="alert">
          {walletState.error}
        </p>
      )}
      <main id="main" tabIndex={-1}>
        {page}
      </main>
      <footer className="footer">
        <p>
          Votes are stored on the {NETWORK.name} blockchain and are public: anyone can see which wallet chose which
          option, but not who owns the wallet.
        </p>
        {CONTRACT_ADDRESS && (
          <p>
            Voting contract <ExternalLink href={addressUrl(CONTRACT_ADDRESS)}>{shortAddress(CONTRACT_ADDRESS)}</ExternalLink>
            {contract.admin && <> · Admin {shortAddress(contract.admin)}</>}
          </p>
        )}
      </footer>
    </>
  );
}

function WalletButton({ wallet, isAdmin }) {
  if (!wallet.available) {
    const link = getWalletLink();
    return (
      <a className="button small" href={link.href} target="_blank" rel="noreferrer">
        {link.label}
      </a>
    );
  }
  if (!wallet.account) {
    return (
      <button type="button" className="button small" onClick={wallet.connect}>
        Connect wallet
      </button>
    );
  }
  if (!wallet.onRightChain) {
    return (
      <button type="button" className="button small warn" onClick={wallet.switchChain}>
        Switch to {NETWORK.name}
      </button>
    );
  }
  return (
    <span className="pill account" title={wallet.account}>
      <span className="dot" aria-hidden="true" />
      {isAdmin && <strong>Admin · </strong>}
      <span className="sr-only">Connected wallet </span>
      {shortAddress(wallet.account)}
    </span>
  );
}

function NotDeployed() {
  return (
    <section className="card narrow">
      <h1>Almost ready</h1>
      {CHAIN_ID === 31337 ? (
        <p>
          No voting contract is deployed on your local chain yet. With <code>npm run chain</code> running, run{" "}
          <code>npm run deploy:local</code>, then reload this page.
        </p>
      ) : (
        <p>
          The voting contract hasn't been deployed to {NETWORK.name} yet. The admin needs to run{" "}
          <code>npm run deploy:sepolia</code> and publish the updated <code>deployments.json</code> (see the README).
        </p>
      )}
    </section>
  );
}

function Offline({ retry }) {
  return (
    <section className="card narrow">
      <h1>Can't reach {NETWORK.name}</h1>
      <p>The app couldn't connect to the blockchain network. Check your internet connection and try again.</p>
      {CHAIN_ID === 31337 && (
        <p className="muted">
          Developing locally? Make sure <code>npm run chain</code> is running.
        </p>
      )}
      <button type="button" className="button" onClick={retry}>
        Try again
      </button>
    </section>
  );
}
