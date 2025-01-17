settings = {
    "BLOCKCHAIN_PROVIDER": "https://mainnet.infura.io/v3/dd49da730c784fb0888f696dd08adc7d",
    "ADMIN_ADDRESS": "0x403D9f5FC447aaCD1bD0045e05947D813d31f2F3",
    "CONTRACT_ADDRESS": "0x403d9f5fc447aacd1bd0045e05947d813d31f2f3",
    "ABI": [
		{
			"inputs": [
				{
					"internalType": "string[]",
					"name": "_options",
					"type": "string[]"
				}
			],
			"stateMutability": "nonpayable",
			"type": "constructor"
		},
		{
			"inputs": [],
			"name": "admin",
			"outputs": [
				{
					"internalType": "address",
					"name": "",
					"type": "address"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "uint256",
					"name": "_option",
					"type": "uint256"
				}
			],
			"name": "castVote",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "endVoting",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "getResults",
			"outputs": [
				{
					"internalType": "uint256[]",
					"name": "",
					"type": "uint256[]"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "uint256",
					"name": "",
					"type": "uint256"
				}
			],
			"name": "options",
			"outputs": [
				{
					"internalType": "string",
					"name": "",
					"type": "string"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "address",
					"name": "_voter",
					"type": "address"
				}
			],
			"name": "registerVoter",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "uint256",
					"name": "durationInMinutes",
					"type": "uint256"
				}
			],
			"name": "startVoting",
			"outputs": [],
			"stateMutability": "nonpayable",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "address",
					"name": "",
					"type": "address"
				}
			],
			"name": "voters",
			"outputs": [
				{
					"internalType": "bool",
					"name": "isRegistered",
					"type": "bool"
				},
				{
					"internalType": "bool",
					"name": "hasVoted",
					"type": "bool"
				},
				{
					"internalType": "uint256",
					"name": "vote",
					"type": "uint256"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [
				{
					"internalType": "uint256",
					"name": "",
					"type": "uint256"
				}
			],
			"name": "votes",
			"outputs": [
				{
					"internalType": "uint256",
					"name": "",
					"type": "uint256"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "votingActive",
			"outputs": [
				{
					"internalType": "bool",
					"name": "",
					"type": "bool"
				}
			],
			"stateMutability": "view",
			"type": "function"
		},
		{
			"inputs": [],
			"name": "votingEndTime",
			"outputs": [
				{
					"internalType": "uint256",
					"name": "",
					"type": "uint256"
				}
			],
			"stateMutability": "view",
			"type": "function"
		}
	],
    "ADMIN_USERNAME": "admin",
    "ADMIN_PASSWORD": "password"
}