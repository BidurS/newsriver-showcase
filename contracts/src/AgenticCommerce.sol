// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title IAgenticCommerceHook — Optional hook interface for ERC-8183 Agentic Commerce
/// @dev Implementations MAY deploy a hook contract to intercept state transitions
interface IAgenticCommerceHook {
    function beforeAction(uint256 jobId, bytes4 action, address caller, bytes calldata optParams) external;
    function afterAction(uint256 jobId, bytes4 action, address caller, bytes calldata optParams) external;
}

/// @title AgenticCommerce — ERC-8183 compliant job escrow for NewsRiver Intelligence
/// @notice Implements the Agentic Commerce Protocol: escrowed budget, 4-phase lifecycle,
///         evaluator-based attestation, and optional hooks for ERC-8004 reputation composition.
/// @dev Uses USDC on Base as the payment token (global for contract).
contract AgenticCommerce is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ══════════════════════════════════════════════════════════════
    //  Types
    // ══════════════════════════════════════════════════════════════

    enum Status { Open, Funded, Submitted, Completed, Rejected, Expired }

    struct Job {
        address client;
        address provider;
        address evaluator;
        address hook;
        string  description;
        uint256 budget;
        uint256 expiredAt;
        Status  status;
        bytes32 deliverable;
    }

    // ══════════════════════════════════════════════════════════════
    //  Events (per ERC-8183 spec)
    // ══════════════════════════════════════════════════════════════

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address provider,
        address evaluator,
        uint256 expiredAt,
        string  description,
        address hook
    );

    event JobProviderSet(uint256 indexed jobId, address indexed provider);
    event JobBudgetSet(uint256 indexed jobId, uint256 amount, address indexed setter);
    event JobFunded(uint256 indexed jobId, uint256 amount);
    event JobSubmitted(uint256 indexed jobId, bytes32 deliverable);
    event JobCompleted(uint256 indexed jobId, bytes32 reason);
    event JobRejected(uint256 indexed jobId, bytes32 reason, address indexed rejector);
    event JobExpired(uint256 indexed jobId);

    // ══════════════════════════════════════════════════════════════
    //  State
    // ══════════════════════════════════════════════════════════════

    IERC20 public immutable paymentToken;
    address public treasury;
    uint16  public feeBps; // basis points, max 10000 = 100%

    uint256 public nextJobId;
    mapping(uint256 => Job) public jobs;

    // ══════════════════════════════════════════════════════════════
    //  Constructor
    // ══════════════════════════════════════════════════════════════

    /// @param _paymentToken The ERC-20 token used for all payments (USDC on Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
    /// @param _treasury     Address receiving platform fees on completion
    /// @param _feeBps       Platform fee in basis points (e.g. 250 = 2.5%)
    constructor(address _paymentToken, address _treasury, uint16 _feeBps) {
        require(_paymentToken != address(0), "Invalid token");
        require(_feeBps <= 1000, "Fee too high"); // max 10%
        paymentToken = IERC20(_paymentToken);
        treasury = _treasury;
        feeBps = _feeBps;
    }

    // ══════════════════════════════════════════════════════════════
    //  Core Functions (per ERC-8183 spec)
    // ══════════════════════════════════════════════════════════════

    /// @notice Create a new job in Open state
    /// @param provider   Provider address (may be address(0), must be set before fund)
    /// @param evaluator  Evaluator address (required, may be msg.sender for client-as-evaluator)
    /// @param expiredAt  Expiration timestamp (must be in the future)
    /// @param description Human-readable job brief
    /// @param hook       Optional hook contract address (address(0) for no hook)
    function createJob(
        address provider,
        address evaluator,
        uint256 expiredAt,
        string calldata description,
        address hook
    ) external returns (uint256 jobId) {
        require(evaluator != address(0), "Evaluator required");
        require(expiredAt > block.timestamp, "Expired in past");

        jobId = nextJobId++;
        jobs[jobId] = Job({
            client: msg.sender,
            provider: provider,
            evaluator: evaluator,
            hook: hook,
            description: description,
            budget: 0,
            expiredAt: expiredAt,
            status: Status.Open,
            deliverable: bytes32(0)
        });

        emit JobCreated(jobId, msg.sender, provider, evaluator, expiredAt, description, hook);

        _callHook(jobId, this.createJob.selector, msg.sender, "");
    }

    /// @notice Set provider on an Open job (only if provider was zero at creation)
    function setProvider(uint256 jobId, address provider, bytes calldata optParams) external {
        Job storage job = jobs[jobId];
        require(job.status == Status.Open, "Not Open");
        require(msg.sender == job.client, "Not client");
        require(job.provider == address(0), "Provider already set");
        require(provider != address(0), "Zero provider");

        _callHookBefore(jobId, this.setProvider.selector, msg.sender, optParams);

        job.provider = provider;
        emit JobProviderSet(jobId, provider);

        _callHookAfter(jobId, this.setProvider.selector, msg.sender, optParams);
    }

    /// @notice Set or update budget (client or provider, only when Open)
    function setBudget(uint256 jobId, uint256 amount, bytes calldata optParams) external {
        Job storage job = jobs[jobId];
        require(job.status == Status.Open, "Not Open");
        require(msg.sender == job.client || msg.sender == job.provider, "Not client/provider");

        _callHookBefore(jobId, this.setBudget.selector, msg.sender, optParams);

        job.budget = amount;
        emit JobBudgetSet(jobId, amount, msg.sender);

        _callHookAfter(jobId, this.setBudget.selector, msg.sender, optParams);
    }

    /// @notice Fund escrow (client only, front-run protected via expectedBudget)
    function fund(uint256 jobId, uint256 expectedBudget, bytes calldata optParams) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.status == Status.Open, "Not Open");
        require(msg.sender == job.client, "Not client");
        require(job.budget > 0, "Budget not set");
        require(job.provider != address(0), "Provider not set");
        require(job.budget == expectedBudget, "Budget mismatch");

        _callHookBefore(jobId, this.fund.selector, msg.sender, optParams);

        // Pull USDC from client into escrow
        paymentToken.safeTransferFrom(msg.sender, address(this), job.budget);
        job.status = Status.Funded;

        emit JobFunded(jobId, job.budget);

        _callHookAfter(jobId, this.fund.selector, msg.sender, optParams);
    }

    /// @notice Provider submits deliverable (hash of work)
    function submit(uint256 jobId, bytes32 deliverable, bytes calldata optParams) external {
        Job storage job = jobs[jobId];
        require(job.status == Status.Funded, "Not Funded");
        require(msg.sender == job.provider, "Not provider");

        _callHookBefore(jobId, this.submit.selector, msg.sender, optParams);

        job.deliverable = deliverable;
        job.status = Status.Submitted;

        emit JobSubmitted(jobId, deliverable);

        _callHookAfter(jobId, this.submit.selector, msg.sender, optParams);
    }

    /// @notice Evaluator completes the job → pays provider (minus fee)
    function complete(uint256 jobId, bytes32 reason, bytes calldata optParams) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.status == Status.Submitted, "Not Submitted");
        require(msg.sender == job.evaluator, "Not evaluator");

        _callHookBefore(jobId, this.complete.selector, msg.sender, optParams);

        job.status = Status.Completed;

        // Calculate fee
        uint256 fee = (job.budget * feeBps) / 10000;
        uint256 payout = job.budget - fee;

        // Pay provider
        paymentToken.safeTransfer(job.provider, payout);

        // Pay treasury fee (if any)
        if (fee > 0 && treasury != address(0)) {
            paymentToken.safeTransfer(treasury, fee);
        }

        emit JobCompleted(jobId, reason);

        _callHookAfter(jobId, this.complete.selector, msg.sender, optParams);
    }

    /// @notice Reject a job — by client (Open) or evaluator (Funded/Submitted)
    function reject(uint256 jobId, bytes32 reason, bytes calldata optParams) external nonReentrant {
        Job storage job = jobs[jobId];

        if (job.status == Status.Open) {
            require(msg.sender == job.client, "Not client");
        } else if (job.status == Status.Funded || job.status == Status.Submitted) {
            require(msg.sender == job.evaluator, "Not evaluator");
        } else {
            revert("Invalid state");
        }

        _callHookBefore(jobId, this.reject.selector, msg.sender, optParams);

        // Refund if funds were escrowed
        if (job.status == Status.Funded || job.status == Status.Submitted) {
            paymentToken.safeTransfer(job.client, job.budget);
        }

        job.status = Status.Rejected;

        emit JobRejected(jobId, reason, msg.sender);

        _callHookAfter(jobId, this.reject.selector, msg.sender, optParams);
    }

    /// @notice Claim refund after expiry (anyone can trigger)
    function claimRefund(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(
            job.status == Status.Funded || job.status == Status.Submitted,
            "Not refundable"
        );
        require(block.timestamp >= job.expiredAt, "Not expired");

        job.status = Status.Expired;
        paymentToken.safeTransfer(job.client, job.budget);

        emit JobExpired(jobId);

        _callHook(jobId, this.claimRefund.selector, msg.sender, "");
    }

    // ══════════════════════════════════════════════════════════════
    //  View Functions
    // ══════════════════════════════════════════════════════════════

    function getJob(uint256 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }

    function getJobCount() external view returns (uint256) {
        return nextJobId;
    }

    // ══════════════════════════════════════════════════════════════
    //  Internal: Hook Dispatch
    // ══════════════════════════════════════════════════════════════

    function _callHook(uint256 jobId, bytes4 action, address caller, bytes memory optParams) internal {
        address hook = jobs[jobId].hook;
        if (hook == address(0)) return;

        // Best-effort: don't revert if hook fails
        try IAgenticCommerceHook(hook).afterAction(jobId, action, caller, optParams) {} catch {}
    }

    function _callHookBefore(uint256 jobId, bytes4 action, address caller, bytes memory optParams) internal {
        address hook = jobs[jobId].hook;
        if (hook == address(0)) return;
        try IAgenticCommerceHook(hook).beforeAction(jobId, action, caller, optParams) {} catch {}
    }

    function _callHookAfter(uint256 jobId, bytes4 action, address caller, bytes memory optParams) internal {
        address hook = jobs[jobId].hook;
        if (hook == address(0)) return;
        try IAgenticCommerceHook(hook).afterAction(jobId, action, caller, optParams) {} catch {}
    }
}
