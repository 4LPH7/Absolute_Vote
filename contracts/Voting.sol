// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Voting {
    struct Voter {
        bool isRegistered;
        bool hasVoted;
        uint vote;
    }

    address public admin;
    mapping(address => Voter) public voters;
    string[] public options;
    uint[] public votes;
    bool public votingActive;
    uint public votingEndTime;

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action.");
        _;
    }

    modifier onlyDuringVoting() {
        require(votingActive, "Voting is not active.");
        require(block.timestamp <= votingEndTime, "Voting session has ended.");
        _;
    }

    constructor(string[] memory _options) {
        admin = msg.sender;
        options = _options;
        votes = new uint[](_options.length);
    }

    function registerVoter(address _voter) public onlyAdmin {
        require(!voters[_voter].isRegistered, "Voter is already registered.");
        voters[_voter] = Voter(true, false, 0);
    }

    function startVoting(uint durationInMinutes) public onlyAdmin {
        votingActive = true;
        votingEndTime = block.timestamp + (durationInMinutes * 1 minutes);
    }

    function endVoting() public onlyAdmin {
        votingActive = false;
    }

    function castVote(uint _option) public onlyDuringVoting {
        Voter storage sender = voters[msg.sender];
        require(sender.isRegistered, "Not a registered voter.");
        require(!sender.hasVoted, "Already voted.");
        require(_option < options.length, "Invalid option.");

        sender.hasVoted = true;
        sender.vote = _option;
        votes[_option]++;
    }

    function getResults() public view returns (uint[] memory) {
        return votes;
    }
}