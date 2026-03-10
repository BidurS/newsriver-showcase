// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AgenticCommerce.sol";

/// @notice Mock ERC-20 for testing
contract MockUSDC is Test {
    string public name = "Mock USDC";
    string public symbol = "USDC";
    uint8 public decimals = 6;
    
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "Not allowed");
        require(balanceOf[from] >= amount, "Insufficient");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function totalSupply() external pure returns (uint256) { return type(uint256).max; }
}

/// @notice Full lifecycle test for AgenticCommerce
contract AgenticCommerceTest is Test {
    AgenticCommerce public commerce;
    MockUSDC public usdc;

    address client   = address(0x1);
    address provider = address(0x2);
    address treasury = address(0x3);

    uint256 constant BUDGET = 100e6; // 100 USDC

    function setUp() public {
        usdc = new MockUSDC();
        // Client as evaluator (simplest case)
        commerce = new AgenticCommerce(address(usdc), treasury, 250); // 2.5% fee

        // Fund client
        usdc.mint(client, 1000e6);
    }

    function test_fullLifecycle() public {
        // 1. Create job (client is evaluator)
        vm.prank(client);
        uint256 jobId = commerce.createJob(
            provider,
            client, // evaluator = client
            block.timestamp + 1 days,
            "Generate 24h BTC macro intelligence report",
            address(0) // no hook
        );
        assertEq(jobId, 0);

        // 2. Set budget
        vm.prank(client);
        commerce.setBudget(jobId, BUDGET, "");

        // 3. Approve & fund
        vm.prank(client);
        usdc.approve(address(commerce), BUDGET);
        
        vm.prank(client);
        commerce.fund(jobId, BUDGET, "");

        // Verify escrow
        assertEq(usdc.balanceOf(address(commerce)), BUDGET);

        // 4. Provider submits deliverable
        bytes32 deliverable = keccak256("ipfs://QmReport...");
        vm.prank(provider);
        commerce.submit(jobId, deliverable, "");

        // 5. Evaluator (client) completes
        bytes32 reason = keccak256("satisfactory");
        vm.prank(client);
        commerce.complete(jobId, reason, "");

        // Verify payment: provider gets 97.5 USDC, treasury gets 2.5 USDC
        uint256 fee = (BUDGET * 250) / 10000; // 2.5 USDC
        assertEq(usdc.balanceOf(provider), BUDGET - fee);
        assertEq(usdc.balanceOf(treasury), fee);
        assertEq(usdc.balanceOf(address(commerce)), 0);

        // Verify final state
        AgenticCommerce.Job memory job = commerce.getJob(jobId);
        assertTrue(job.status == AgenticCommerce.Status.Completed);
        assertEq(job.deliverable, deliverable);
    }

    function test_rejectRefund() public {
        // Create and fund
        vm.prank(client);
        uint256 jobId = commerce.createJob(provider, client, block.timestamp + 1 days, "Test job", address(0));
        
        vm.prank(client);
        commerce.setBudget(jobId, BUDGET, "");
        
        vm.prank(client);
        usdc.approve(address(commerce), BUDGET);
        
        vm.prank(client);
        commerce.fund(jobId, BUDGET, "");

        uint256 clientBefore = usdc.balanceOf(client);

        // Evaluator (client) rejects → refund
        vm.prank(client);
        commerce.reject(jobId, bytes32(0), "");

        assertEq(usdc.balanceOf(client), clientBefore + BUDGET);
        
        AgenticCommerce.Job memory job = commerce.getJob(jobId);
        assertTrue(job.status == AgenticCommerce.Status.Rejected);
    }

    function test_expiry() public {
        vm.prank(client);
        uint256 jobId = commerce.createJob(provider, client, block.timestamp + 1 hours, "Expiry test", address(0));
        
        vm.prank(client);
        commerce.setBudget(jobId, BUDGET, "");
        
        vm.prank(client);
        usdc.approve(address(commerce), BUDGET);
        
        vm.prank(client);
        commerce.fund(jobId, BUDGET, "");

        // Warp past expiry
        vm.warp(block.timestamp + 2 hours);

        uint256 clientBefore = usdc.balanceOf(client);
        commerce.claimRefund(jobId);

        assertEq(usdc.balanceOf(client), clientBefore + BUDGET);
        
        AgenticCommerce.Job memory job = commerce.getJob(jobId);
        assertTrue(job.status == AgenticCommerce.Status.Expired);
    }

    function test_budgetMismatchReverts() public {
        vm.prank(client);
        uint256 jobId = commerce.createJob(provider, client, block.timestamp + 1 days, "Test", address(0));
        
        vm.prank(client);
        commerce.setBudget(jobId, BUDGET, "");
        
        vm.prank(client);
        usdc.approve(address(commerce), 999e6);

        // Try to fund with wrong expectedBudget
        vm.prank(client);
        vm.expectRevert("Budget mismatch");
        commerce.fund(jobId, 999e6, "");
    }

    function test_onlyProviderCanSubmit() public {
        vm.prank(client);
        uint256 jobId = commerce.createJob(provider, client, block.timestamp + 1 days, "Test", address(0));
        
        vm.prank(client);
        commerce.setBudget(jobId, BUDGET, "");
        
        vm.prank(client);
        usdc.approve(address(commerce), BUDGET);
        
        vm.prank(client);
        commerce.fund(jobId, BUDGET, "");

        // Client tries to submit — should revert
        vm.prank(client);
        vm.expectRevert("Not provider");
        commerce.submit(jobId, bytes32(0), "");
    }
}
