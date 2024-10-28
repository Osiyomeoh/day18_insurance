// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DecentralizedInsurance
 * @dev A smart contract for handling decentralized insurance policies and claims
 */
contract DecentralizedInsurance is Ownable {
    // State variables for reentrancy and pause functionality
    bool private locked;
    bool public paused;

    // Insurance policy struct
    struct Policy {
        uint256 coverageAmount;
        uint256 premium;
        uint256 startTime;
        uint256 endTime;
        bool isActive;
        uint256 claimCount;
    }

    // Claim struct
    struct Claim {
        uint256 amount;
        string description;
        uint256 timestamp;
        ClaimStatus status;
        string evidence;
    }

    // Claim status enum
    enum ClaimStatus { Pending, Approved, Rejected }

    // Mapping of address to their policy
    mapping(address => Policy) public policies;
    // Mapping of address to their claims
    mapping(address => Claim[]) public claims;

    // Events
    event PolicyPurchased(address indexed policyholder, uint256 coverageAmount, uint256 premium);
    event ClaimSubmitted(address indexed policyholder, uint256 claimId, uint256 amount);
    event ClaimProcessed(address indexed policyholder, uint256 claimId, ClaimStatus status);
    event PayoutIssued(address indexed policyholder, uint256 amount);
    event Paused(address account);
    event Unpaused(address account);

    // Constants
    uint256 public constant MAX_COVERAGE = 100 ether;
    uint256 public constant MIN_PREMIUM = 0.01 ether;
    uint256 public constant POLICY_DURATION = 365 days;
    uint256 public constant MAX_CLAIMS_PER_POLICY = 3;

    // Custom modifiers to replace OpenZeppelin functionality
    modifier nonReentrant() {
        require(!locked, "Reentrant call");
        locked = true;
        _;
        locked = false;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    modifier whenPaused() {
        require(paused, "Contract not paused");
        _;
    }

    constructor() Ownable(msg.sender){
        locked = false;
        paused = false;
    }

    /**
     * @dev Purchase an insurance policy
     * @param _coverageAmount The amount of coverage desired
     */
    function purchasePolicy(uint256 _coverageAmount) external payable whenNotPaused nonReentrant {
        require(_coverageAmount <= MAX_COVERAGE, "Coverage amount too high");
        require(!policies[msg.sender].isActive, "Active policy exists");
        
        // Calculate premium (simplified version - 1% of coverage amount)
        uint256 premium = (_coverageAmount * 1) / 100;
        require(premium >= MIN_PREMIUM, "Premium too low");
        require(msg.value >= premium, "Insufficient premium paid");

        // Create new policy
        policies[msg.sender] = Policy({
            coverageAmount: _coverageAmount,
            premium: premium,
            startTime: block.timestamp,
            endTime: block.timestamp + POLICY_DURATION,
            isActive: true,
            claimCount: 0
        });

        emit PolicyPurchased(msg.sender, _coverageAmount, premium);
    }

    /**
     * @dev Submit an insurance claim
     * @param _amount The amount being claimed
     * @param _description Description of the claim
     * @param _evidence IPFS hash or other evidence reference
     */
    function submitClaim(
        uint256 _amount,
        string memory _description,
        string memory _evidence
    ) external whenNotPaused nonReentrant {
        Policy storage policy = policies[msg.sender];
        require(policy.isActive, "No active policy");
        require(block.timestamp <= policy.endTime, "Policy expired");
        require(_amount <= policy.coverageAmount, "Claim exceeds coverage");
        require(policy.claimCount < MAX_CLAIMS_PER_POLICY, "Max claims reached");

        Claim memory newClaim = Claim({
            amount: _amount,
            description: _description,
            timestamp: block.timestamp,
            status: ClaimStatus.Pending,
            evidence: _evidence
        });

        claims[msg.sender].push(newClaim);
        policy.claimCount++;

        emit ClaimSubmitted(msg.sender, claims[msg.sender].length - 1, _amount);
    }

    /**
     * @dev Process an insurance claim (admin only)
     * @param _policyholder Address of the policyholder
     * @param _claimId ID of the claim to process
     * @param _status New status of the claim
     */
    function processClaim(
        address _policyholder,
        uint256 _claimId,
        ClaimStatus _status
    ) external onlyOwner whenNotPaused nonReentrant {
        require(_claimId < claims[_policyholder].length, "Invalid claim ID");
        Claim storage claim = claims[_policyholder][_claimId];
        require(claim.status == ClaimStatus.Pending, "Claim already processed");

        claim.status = _status;
        emit ClaimProcessed(_policyholder, _claimId, _status);

        if (_status == ClaimStatus.Approved) {
            // Process payout
            (bool success, ) = payable(_policyholder).call{value: claim.amount}("");
            require(success, "Payout failed");
            emit PayoutIssued(_policyholder, claim.amount);
        }
    }

    /**
     * @dev Check if an address has an active policy
     * @param _policyholder Address to check
     * @return bool indicating if policy is active
     */
    function hasActivePolicy(address _policyholder) external view returns (bool) {
        return policies[_policyholder].isActive &&
               block.timestamp <= policies[_policyholder].endTime;
    }

    /**
     * @dev Get the number of claims for a policyholder
     * @param _policyholder Address to check
     * @return uint256 number of claims
     */
    function getClaimCount(address _policyholder) external view returns (uint256) {
        return claims[_policyholder].length;
    }

    /**
     * @dev Pause the contract
     */
    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyOwner whenPaused {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /**
     * @dev Withdraw contract balance (admin only)
     */
    function withdraw() external onlyOwner nonReentrant {
        payable(owner()).transfer(address(this).balance);
    }

    // Fallback function
    receive() external payable {}
}