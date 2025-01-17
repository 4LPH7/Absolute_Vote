from web3 import Web3


def load_contract(web3, settings):
    # Convert the contract address to checksum format
    contract_address = Web3.to_checksum_address(settings["CONTRACT_ADDRESS"])

    # Load the contract
    contract = web3.eth.contract(
        address=contract_address,
        abi=settings["ABI"]
    )
    return contract