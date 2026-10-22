"""Gas-free voting relayer for Absolute Vote.

Voters sign their vote in MetaMask (free). This server submits it with
`Voting.voteBySig` and pays the gas. The contract checks the voter's signature,
so the relayer can't forge or change a vote.

Runs locally with `python api/index.py` (port 5000) and on Vercel as a Python
function (vercel.json routes /api/* here).

Environment:
  RPC_URL              JSON-RPC endpoint (default http://127.0.0.1:8545)
  RELAYER_PRIVATE_KEY  wallet that pays the gas (optional on the local chain)
"""

import json
import logging
import os
import re
from pathlib import Path

from flask import Flask, jsonify, request
from web3 import Web3
from web3.exceptions import ContractLogicError

# Hardhat test account #19. Its key is public, so it is only used on the local chain.
LOCAL_DEV_KEY = "0xdf57089febbacf7ba0bc227dafbffa9fc08a93fdc68e1e42411a14efcf23656e"
LOCAL_CHAIN_ID = 31337
VOTE_GAS = 200_000  # generous upper bound for one voteBySig call
SIGNATURE = re.compile(r"^0x(?:[0-9a-fA-F]{2}){65,1024}$")
RETRYABLE = ("nonce", "underpriced", "already known")

w3 = Web3(Web3.HTTPProvider(os.environ.get("RPC_URL", "http://127.0.0.1:8545"), request_kwargs={"timeout": 20}))
DEPLOYMENTS = json.loads((Path(__file__).resolve().parent.parent / "deployments.json").read_text())

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024
log = logging.getLogger("relayer")
_state = {}


class SetupError(Exception):
    """Configuration problem whose message is safe to show to users."""


def setup():
    """Connects on first use (and retries on later requests) so a down RPC never breaks startup."""
    if not _state:
        chain_id = w3.eth.chain_id
        deployment = DEPLOYMENTS.get(str(chain_id))
        if not deployment:
            raise SetupError(f"No contract for chain {chain_id} in deployments.json.")
        key = os.environ.get("RELAYER_PRIVATE_KEY") or (LOCAL_DEV_KEY if chain_id == LOCAL_CHAIN_ID else None)
        if not key:
            raise SetupError("Gas-free voting is not configured (RELAYER_PRIVATE_KEY is missing).")
        _state.update(
            chain_id=chain_id,
            contract=w3.eth.contract(address=deployment["address"], abi=deployment["abi"]),
            account=w3.eth.account.from_key(key),
        )
    return _state


def unavailable(error):
    # Never echo low-level errors: they can contain the RPC URL and its API key.
    if not isinstance(error, SetupError):
        log.warning("relayer unavailable: %r", error)
    message = str(error) if isinstance(error, SetupError) else "The relayer can't reach the blockchain right now."
    return jsonify(ok=False, error=message), 503


def uint(value, limit):
    return value if type(value) is int and 0 <= value < limit else None


@app.get("/api/health")
def health():
    try:
        s = setup()
        balance = w3.eth.get_balance(s["account"].address)
        can_pay = balance >= w3.eth.gas_price * VOTE_GAS
    except Exception as error:
        return unavailable(error)
    return jsonify(
        ok=True,
        chainId=s["chain_id"],
        contract=s["contract"].address,
        relayer=s["account"].address,
        canPay=can_pay,
    )


@app.post("/api/relay")
def relay():
    body = request.get_json(silent=True)
    body = body if isinstance(body, dict) else {}
    poll_id, option = uint(body.get("pollId"), 2**64), uint(body.get("option"), 256)
    voter, signature = body.get("voter"), body.get("signature")
    if (
        poll_id is None
        or option is None
        or not isinstance(voter, str)
        or not Web3.is_address(voter)
        or not isinstance(signature, str)
        or not SIGNATURE.match(signature)
    ):
        return jsonify(error="Invalid vote request."), 400

    try:
        s = setup()
        account = s["account"]
        call = s["contract"].functions.voteBySig(
            poll_id, option, Web3.to_checksum_address(voter), bytes.fromhex(signature[2:])
        )
        # ponytail: retries nonce clashes between concurrent requests; add a nonce queue if traffic grows.
        for _ in range(3):
            # Estimating gas simulates the vote first, so invalid votes are rejected without spending anything.
            tx = call.build_transaction(
                {"from": account.address, "nonce": w3.eth.get_transaction_count(account.address, "pending")}
            )
            try:
                tx_hash = w3.eth.send_raw_transaction(account.sign_transaction(tx).raw_transaction)
                return jsonify(txHash=tx_hash.to_0x_hex()), 202
            except Exception as error:
                if not any(word in str(error).lower() for word in RETRYABLE):
                    raise
        return jsonify(error="The relayer is busy. Please try again."), 503
    except ContractLogicError as error:
        # The contract would reject this vote (already voted, not eligible, closed...).
        # Send back the revert data so the app can explain why.
        data = error.data if isinstance(error.data, str) else None
        return jsonify(error="rejected", data=data, reason=None if data else error.message), 400
    except Exception as error:
        if any(words in str(error).lower() for words in ("insufficient funds", "enough funds")):
            log.warning("relayer wallet is out of funds")
            return jsonify(ok=False, error="The relayer is out of funds."), 503
        return unavailable(error)


if __name__ == "__main__":
    app.run(port=int(os.environ.get("PORT", "5000")))
