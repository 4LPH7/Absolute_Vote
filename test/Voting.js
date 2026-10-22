import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();
const { loadFixture, time } = networkHelpers;

const HOUR = 3600;

async function deployFixture() {
  const [admin, alice, bob, relayer] = await ethers.getSigners();
  const voting = await ethers.deployContract("Voting");
  return { voting, admin, alice, bob, relayer };
}

// Same EIP-712 message the web app asks MetaMask to sign.
async function signVote(signer, voting, pollId, option, voter = signer.address) {
  const { chainId } = await ethers.provider.getNetwork();
  return signer.signTypedData(
    { name: "Absolute Vote", version: "1", chainId, verifyingContract: await voting.getAddress() },
    {
      Vote: [
        { name: "pollId", type: "uint256" },
        { name: "option", type: "uint256" },
        { name: "voter", type: "address" },
      ],
    },
    { pollId, option, voter },
  );
}

describe("Voting", function () {
  describe("creating polls", function () {
    it("restricts poll management to the admin", async function () {
      const { voting, alice } = await loadFixture(deployFixture);
      await expect(voting.connect(alice).createPoll("T", ["A", "B"], HOUR, false, [])).to.be.revertedWithCustomError(
        voting,
        "NotAdmin",
      );
      await voting.createPoll("T", ["A", "B"], HOUR, true, []);
      await expect(voting.connect(alice).addVoters(0, [alice.address])).to.be.revertedWithCustomError(voting, "NotAdmin");
      await expect(voting.connect(alice).endPoll(0)).to.be.revertedWithCustomError(voting, "NotAdmin");
    });

    it("rejects invalid setups", async function () {
      const { voting, alice } = await loadFixture(deployFixture);
      const tooMany = Array.from({ length: 21 }, (_, i) => `Option ${i}`);
      for (const [title, options, duration] of [
        ["", ["A", "B"], HOUR],
        ["T", ["A"], HOUR],
        ["T", tooMany, HOUR],
        ["T", ["A", ""], HOUR],
        ["T", ["A", "B"], 59],
        ["T", ["A", "B"], 365 * 24 * HOUR + 1],
      ]) {
        await expect(voting.createPoll(title, options, duration, false, [])).to.be.revertedWithCustomError(
          voting,
          "InvalidSetup",
        );
      }
      await expect(voting.createPoll("T", ["A", "B"], HOUR, false, [alice.address])).to.be.revertedWithCustomError(
        voting,
        "NotRestricted",
      );
    });

    it("stores the poll and emits PollCreated", async function () {
      const { voting } = await loadFixture(deployFixture);
      await expect(voting.createPoll("Lunch?", ["Pizza", "Sushi", "Tacos"], HOUR, false, [])).to.emit(
        voting,
        "PollCreated",
      );
      const poll = await voting.getPoll(0);
      expect(poll.title).to.equal("Lunch?");
      expect([...poll.options]).to.deep.equal(["Pizza", "Sushi", "Tacos"]);
      expect([...poll.votes]).to.deep.equal([0n, 0n, 0n]);
      expect(poll.endTime - poll.startTime).to.equal(BigInt(HOUR));
      expect(await voting.pollCount()).to.equal(1n);
      await expect(voting.getPoll(1)).to.be.revertedWithCustomError(voting, "InvalidPoll");
    });
  });

  describe("open polls", function () {
    it("lets any wallet vote exactly once", async function () {
      const { voting, alice, bob } = await loadFixture(deployFixture);
      await voting.createPoll("T", ["A", "B"], HOUR, false, []);

      await expect(voting.connect(alice).vote(0, 1)).to.emit(voting, "Voted").withArgs(0, alice.address, 1);
      await voting.connect(bob).vote(0, 1);
      await expect(voting.connect(alice).vote(0, 0)).to.be.revertedWithCustomError(voting, "AlreadyVoted");

      const poll = await voting.getPoll(0);
      expect([...poll.votes]).to.deep.equal([0n, 2n]);
      expect(poll.totalVotes).to.equal(2n);
      expect(await voting.votedFor(0, alice.address)).to.equal(2n); // option index + 1
    });

    it("rejects unknown options and polls", async function () {
      const { voting, alice } = await loadFixture(deployFixture);
      await voting.createPoll("T", ["A", "B"], HOUR, false, []);
      await expect(voting.connect(alice).vote(0, 2)).to.be.revertedWithCustomError(voting, "InvalidOption");
      await expect(voting.connect(alice).vote(1, 0)).to.be.revertedWithCustomError(voting, "InvalidPoll");
    });
  });

  describe("allowlist polls", function () {
    it("only lets allowlisted wallets vote", async function () {
      const { voting, alice, bob } = await loadFixture(deployFixture);
      await voting.createPoll("T", ["A", "B"], HOUR, true, [alice.address, alice.address]);
      expect((await voting.getPoll(0)).voterCount).to.equal(1n);

      await expect(voting.connect(bob).vote(0, 0)).to.be.revertedWithCustomError(voting, "NotEligible");
      await voting.connect(alice).vote(0, 0);

      await expect(voting.addVoters(0, [bob.address, alice.address, ethers.ZeroAddress]))
        .to.emit(voting, "VotersAdded")
        .withArgs(0, 1);
      await voting.connect(bob).vote(0, 1);
      expect((await voting.getPoll(0)).voterCount).to.equal(2n);
    });

    it("only adds voters to allowlist polls that are still open", async function () {
      const { voting, alice } = await loadFixture(deployFixture);
      await voting.createPoll("Open", ["A", "B"], HOUR, false, []);
      await voting.createPoll("Listed", ["A", "B"], HOUR, true, []);
      await expect(voting.addVoters(0, [alice.address])).to.be.revertedWithCustomError(voting, "NotRestricted");
      await time.increase(HOUR);
      await expect(voting.addVoters(1, [alice.address])).to.be.revertedWithCustomError(voting, "PollClosed");
    });
  });

  describe("closing", function () {
    it("stops voting when the time runs out", async function () {
      const { voting, alice } = await loadFixture(deployFixture);
      await voting.createPoll("T", ["A", "B"], HOUR, false, []);
      await time.increase(HOUR);
      await expect(voting.connect(alice).vote(0, 0)).to.be.revertedWithCustomError(voting, "PollClosed");
      await expect(voting.endPoll(0)).to.be.revertedWithCustomError(voting, "PollClosed");
    });

    it("lets the admin end a poll early", async function () {
      const { voting, alice } = await loadFixture(deployFixture);
      await voting.createPoll("T", ["A", "B"], HOUR, false, []);
      await expect(voting.endPoll(0)).to.emit(voting, "PollEnded").withArgs(0);
      const poll = await voting.getPoll(0);
      expect(poll.endTime).to.equal(BigInt(await time.latest()));
      expect(poll.endedEarly).to.equal(true);
      await expect(voting.connect(alice).vote(0, 0)).to.be.revertedWithCustomError(voting, "PollClosed");
    });
  });

  describe("gas-free voting (voteBySig)", function () {
    it("counts the vote for the signer, not the relayer, and only once", async function () {
      const { voting, alice, relayer } = await loadFixture(deployFixture);
      await voting.createPoll("T", ["A", "B"], HOUR, false, []);
      const signature = await signVote(alice, voting, 0, 1);

      await expect(voting.connect(relayer).voteBySig(0, 1, alice.address, signature))
        .to.emit(voting, "Voted")
        .withArgs(0, alice.address, 1);
      expect(await voting.votedFor(0, alice.address)).to.equal(2n);
      expect(await voting.votedFor(0, relayer.address)).to.equal(0n);
      await expect(voting.connect(relayer).voteBySig(0, 1, alice.address, signature)).to.be.revertedWithCustomError(
        voting,
        "AlreadyVoted",
      );
    });

    it("rejects tampered or foreign signatures", async function () {
      const { voting, alice, bob, relayer } = await loadFixture(deployFixture);
      await voting.createPoll("T", ["A", "B"], HOUR, false, []);
      const signature = await signVote(alice, voting, 0, 1);
      const asRelayer = voting.connect(relayer);

      await expect(asRelayer.voteBySig(0, 0, alice.address, signature)).to.be.revertedWithCustomError(
        voting,
        "BadSignature",
      );
      await expect(asRelayer.voteBySig(0, 1, bob.address, signature)).to.be.revertedWithCustomError(
        voting,
        "BadSignature",
      );

      const other = await ethers.deployContract("Voting");
      const foreign = await signVote(alice, other, 0, 1);
      await expect(asRelayer.voteBySig(0, 1, alice.address, foreign)).to.be.revertedWithCustomError(
        voting,
        "BadSignature",
      );
    });

    it("still enforces the allowlist", async function () {
      const { voting, bob, relayer } = await loadFixture(deployFixture);
      await voting.createPoll("T", ["A", "B"], HOUR, true, []);
      const signature = await signVote(bob, voting, 0, 0);
      await expect(voting.connect(relayer).voteBySig(0, 0, bob.address, signature)).to.be.revertedWithCustomError(
        voting,
        "NotEligible",
      );
    });
  });
});
