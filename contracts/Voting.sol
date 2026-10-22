// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @title Absolute Vote
/// @notice Admin-run polls with one vote per wallet. A voter either sends the vote
///         themselves (`vote`) or signs it (EIP-712) so a relayer can submit it and
///         pay the gas (`voteBySig`). Either way the vote counts for the voter's wallet.
contract Voting is EIP712 {
    struct Poll {
        string title;
        string[] options;
        uint256[] votes;
        uint64 startTime;
        uint64 endTime;
        bool restricted; // true: only allowlisted wallets may vote
        bool endedEarly; // closed by the admin before endTime
        uint32 voterCount; // allowlist size
        uint32 totalVotes;
    }

    uint256 public constant MAX_OPTIONS = 20;
    uint64 public constant MIN_DURATION = 1 minutes;
    uint64 public constant MAX_DURATION = 365 days;
    bytes32 private constant VOTE_TYPEHASH = keccak256("Vote(uint256 pollId,uint256 option,address voter)");

    address public immutable admin;
    Poll[] private polls;

    /// @notice pollId => wallet => may vote (allowlist polls only)
    mapping(uint256 => mapping(address => bool)) public isEligible;
    /// @notice pollId => wallet => chosen option + 1 (0 = has not voted)
    mapping(uint256 => mapping(address => uint256)) public votedFor;

    event PollCreated(uint256 indexed pollId, string title, uint64 endTime, bool restricted);
    event VotersAdded(uint256 indexed pollId, uint256 added);
    event Voted(uint256 indexed pollId, address indexed voter, uint256 option);
    event PollEnded(uint256 indexed pollId);

    error NotAdmin();
    error InvalidPoll();
    error InvalidSetup();
    error PollClosed();
    error NotRestricted();
    error NotEligible();
    error AlreadyVoted();
    error InvalidOption();
    error BadSignature();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor() EIP712("Absolute Vote", "1") {
        admin = msg.sender;
    }

    /// @notice Opens a poll immediately for `duration` seconds. Allowlist polls
    ///         (`restricted`) can take their first voters here and more via `addVoters`.
    function createPoll(
        string calldata title,
        string[] calldata options,
        uint64 duration,
        bool restricted,
        address[] calldata voters
    ) external onlyAdmin returns (uint256 pollId) {
        if (bytes(title).length == 0 || options.length < 2 || options.length > MAX_OPTIONS) revert InvalidSetup();
        if (duration < MIN_DURATION || duration > MAX_DURATION) revert InvalidSetup();
        if (!restricted && voters.length != 0) revert NotRestricted();

        pollId = polls.length;
        Poll storage p = polls.push();
        p.title = title;
        for (uint256 i; i < options.length; ++i) {
            if (bytes(options[i]).length == 0) revert InvalidSetup();
            p.options.push(options[i]);
        }
        p.votes = new uint256[](options.length);
        p.startTime = uint64(block.timestamp);
        p.endTime = uint64(block.timestamp) + duration;
        p.restricted = restricted;
        emit PollCreated(pollId, title, p.endTime, restricted);

        if (voters.length != 0) _addVoters(pollId, p, voters);
    }

    // ponytail: an on-chain allowlist costs ~25k gas per voter; switch to a Merkle root
    // if electorates reach the thousands.
    function addVoters(uint256 pollId, address[] calldata voters) external onlyAdmin {
        Poll storage p = _poll(pollId);
        if (!p.restricted) revert NotRestricted();
        if (block.timestamp >= p.endTime) revert PollClosed();
        _addVoters(pollId, p, voters);
    }

    /// @notice Closes a poll before its scheduled end.
    function endPoll(uint256 pollId) external onlyAdmin {
        Poll storage p = _poll(pollId);
        if (block.timestamp >= p.endTime) revert PollClosed();
        p.endTime = uint64(block.timestamp);
        p.endedEarly = true;
        emit PollEnded(pollId);
    }

    function vote(uint256 pollId, uint256 option) external {
        _vote(pollId, option, msg.sender);
    }

    /// @notice Submits a vote signed by `voter`. Anyone may call this (normally the
    ///         relayer); the signature proves the voter chose this option. A signature
    ///         can't be replayed because each wallet votes once per poll, and the
    ///         EIP-712 domain ties it to this chain and contract.
    function voteBySig(uint256 pollId, uint256 option, address voter, bytes calldata signature) external {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(VOTE_TYPEHASH, pollId, option, voter)));
        if (!SignatureChecker.isValidSignatureNowCalldata(voter, digest, signature)) revert BadSignature();
        _vote(pollId, option, voter);
    }

    function pollCount() external view returns (uint256) {
        return polls.length;
    }

    function getPoll(uint256 pollId) external view returns (Poll memory) {
        return _poll(pollId);
    }

    function _poll(uint256 pollId) private view returns (Poll storage) {
        if (pollId >= polls.length) revert InvalidPoll();
        return polls[pollId];
    }

    function _addVoters(uint256 pollId, Poll storage p, address[] calldata voters) private {
        uint32 added;
        for (uint256 i; i < voters.length; ++i) {
            address v = voters[i];
            if (v != address(0) && !isEligible[pollId][v]) {
                isEligible[pollId][v] = true;
                ++added;
            }
        }
        p.voterCount += added;
        emit VotersAdded(pollId, added);
    }

    function _vote(uint256 pollId, uint256 option, address voter) private {
        Poll storage p = _poll(pollId);
        if (block.timestamp >= p.endTime) revert PollClosed();
        if (p.restricted && !isEligible[pollId][voter]) revert NotEligible();
        if (votedFor[pollId][voter] != 0) revert AlreadyVoted();
        if (option >= p.options.length) revert InvalidOption();

        votedFor[pollId][voter] = option + 1;
        ++p.votes[option];
        ++p.totalVotes;
        emit Voted(pollId, voter, option);
    }
}
