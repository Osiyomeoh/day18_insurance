import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre from "hardhat";

describe("DecentralizedInsurance", function () {
  // We define a fixture to reuse the same setup in every test.
  async function deployInsuranceFixture() {
    const [owner, policyholder, anotherAccount] = await hre.ethers.getSigners();

    const Insurance = await hre.ethers.getContractFactory("DecentralizedInsurance");
    const insurance = await Insurance.deploy();

    const coverageAmount = hre.ethers.parseEther("10"); // 10 ETH coverage
    const premium = coverageAmount * BigInt(1) / BigInt(100); // 1% premium

    return { 
      insurance, 
      owner, 
      policyholder, 
      anotherAccount, 
      coverageAmount, 
      premium 
    };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { insurance, owner } = await loadFixture(deployInsuranceFixture);
      expect(await insurance.owner()).to.equal(owner.address);
    });

    it("Should not be paused initially", async function () {
      const { insurance } = await loadFixture(deployInsuranceFixture);
      expect(await insurance.paused()).to.be.false;
    });
  });

  describe("Policy Purchase", function () {
    it("Should allow purchasing a policy with correct premium", async function () {
      const { insurance, policyholder, coverageAmount, premium } = await loadFixture(
        deployInsuranceFixture
      );

      await expect(
        insurance.connect(policyholder).purchasePolicy(coverageAmount, { value: premium })
      )
        .to.emit(insurance, "PolicyPurchased")
        .withArgs(policyholder.address, coverageAmount, premium);
    });

    it("Should fail if premium is insufficient", async function () {
      const { insurance, policyholder, coverageAmount } = await loadFixture(
        deployInsuranceFixture
      );

      const insufficientPremium = hre.ethers.parseEther("0.001"); // Too small premium
      await expect(
        insurance.connect(policyholder).purchasePolicy(coverageAmount, { value: insufficientPremium })
      ).to.be.revertedWith("Insufficient premium paid");
    });

    it("Should fail if coverage amount exceeds maximum", async function () {
      const { insurance, policyholder } = await loadFixture(deployInsuranceFixture);

      const tooBigCoverage = hre.ethers.parseEther("101"); // Exceeds MAX_COVERAGE
      const premium = tooBigCoverage * BigInt(1) / BigInt(100);

      await expect(
        insurance.connect(policyholder).purchasePolicy(tooBigCoverage, { value: premium })
      ).to.be.revertedWith("Coverage amount too high");
    });

    it("Should fail if policy already exists", async function () {
      const { insurance, policyholder, coverageAmount, premium } = await loadFixture(
        deployInsuranceFixture
      );

      // Purchase first policy
      await insurance.connect(policyholder).purchasePolicy(coverageAmount, { value: premium });

      // Attempt to purchase second policy
      await expect(
        insurance.connect(policyholder).purchasePolicy(coverageAmount, { value: premium })
      ).to.be.revertedWith("Active policy exists");
    });
  });

  describe("Claims", function () {
    it("Should allow submitting a valid claim", async function () {
      const { insurance, policyholder, coverageAmount, premium } = await loadFixture(
        deployInsuranceFixture
      );

      // Purchase policy
      await insurance.connect(policyholder).purchasePolicy(coverageAmount, { value: premium });

      const claimAmount = hre.ethers.parseEther("5");
      await expect(
        insurance.connect(policyholder).submitClaim(
          claimAmount,
          "Test claim",
          "ipfs://evidence"
        )
      )
        .to.emit(insurance, "ClaimSubmitted")
        .withArgs(policyholder.address, 0, claimAmount);
    });

    it("Should fail if claim amount exceeds coverage", async function () {
      const { insurance, policyholder, coverageAmount, premium } = await loadFixture(
        deployInsuranceFixture
      );

      // Purchase policy
      await insurance.connect(policyholder).purchasePolicy(coverageAmount, { value: premium });

      const tooBigClaim = coverageAmount + BigInt(1);
      await expect(
        insurance.connect(policyholder).submitClaim(
          tooBigClaim,
          "Test claim",
          "ipfs://evidence"
        )
      ).to.be.revertedWith("Claim exceeds coverage");
    });

    it("Should fail if policy is expired", async function () {
      const { insurance, policyholder, coverageAmount, premium } = await loadFixture(
        deployInsuranceFixture
      );

      // Purchase policy
      await insurance.connect(policyholder).purchasePolicy(coverageAmount, { value: premium });

      // Increase time by more than policy duration
      const POLICY_DURATION = 365 * 24 * 60 * 60;
      await time.increase(POLICY_DURATION + 1);

      const claimAmount = hre.ethers.parseEther("5");
      await expect(
        insurance.connect(policyholder).submitClaim(
          claimAmount,
          "Test claim",
          "ipfs://evidence"
        )
      ).to.be.revertedWith("Policy expired");
    });
  });

  // describe("Claim Processing", function () {
  //   it("Should allow owner to approve claim and process payout", async function () {
  //     const { insurance, owner, policyholder, coverageAmount, premium } = await loadFixture(
  //       deployInsuranceFixture
  //     );

  //     // Purchase policy
  //     await insurance.connect(policyholder).purchasePolicy(coverageAmount, { value: premium });

  //     // Submit claim
  //     const claimAmount = hre.ethers.parseEther("5");
  //     await insurance.connect(policyholder).submitClaim(
  //       claimAmount,
  //       "Test claim",
  //       "ipfs://evidence"
  //     );

  //     // Process claim
  //     await expect(insurance.connect(owner).processClaim(
  //       policyholder.address,
  //       0,
  //       0 // ClaimStatus.Approved
  //     ))
  //       .to.emit(insurance, "ClaimProcessed")
  //       .withArgs(policyholder.address, 0, 0)
  //       .to.emit(insurance, "PayoutIssued")
  //       .withArgs(policyholder.address, claimAmount);

  //     // Verify balance changes
  //     await expect(
  //       insurance.connect(owner).processClaim(policyholder.address, 0, 0)
  //     ).to.changeEtherBalances(
  //       [insurance, policyholder],
  //       [-claimAmount, claimAmount]
  //     );
  //   });

 
  // });

  describe("Pausing", function () {
    it("Should allow owner to pause and unpause", async function () {
      const { insurance, owner } = await loadFixture(deployInsuranceFixture);

      await expect(insurance.connect(owner).pause())
        .to.emit(insurance, "Paused")
        .withArgs(owner.address);

      expect(await insurance.paused()).to.be.true;

      await expect(insurance.connect(owner).unpause())
        .to.emit(insurance, "Unpaused")
        .withArgs(owner.address);

      expect(await insurance.paused()).to.be.false;
    });

    it("Should not allow operations while paused", async function () {
      const { insurance, owner, policyholder, coverageAmount, premium } = await loadFixture(
        deployInsuranceFixture
      );

      // Pause contract
      await insurance.connect(owner).pause();

      // Try to purchase policy
      await expect(
        insurance.connect(policyholder).purchasePolicy(coverageAmount, { value: premium })
      ).to.be.revertedWith("Contract is paused");
    });
  });

  describe("Withdrawal", function () {
    it("Should allow owner to withdraw contract balance", async function () {
      const { insurance, owner, policyholder, coverageAmount, premium } = await loadFixture(
        deployInsuranceFixture
      );

      // Purchase policy to add funds to contract
      await insurance.connect(policyholder).purchasePolicy(coverageAmount, { value: premium });

      // Withdraw funds
      await expect(
        insurance.connect(owner).withdraw()
      ).to.changeEtherBalances(
        [insurance, owner],
        [-premium, premium]
      );
    });

    
  });
});