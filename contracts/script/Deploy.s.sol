// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/AgenticCommerce.sol";

/// @notice Deploys AgenticCommerce to Base mainnet
/// @dev USDC on Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
///      Treasury: NewsRiver's x402 receive address
///      Fee: 2.5% (250 bps)
contract DeployAgenticCommerce is Script {
    // Base Mainnet USDC
    address constant USDC_BASE = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    
    // NewsRiver treasury (same as x402 PAY_TO address)
    address constant TREASURY = 0xEae03EB54eB26B38057544895E834aF42fc46A69;
    
    // Platform fee: 0.25%
    uint16 constant FEE_BPS = 25;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerKey);
        
        AgenticCommerce commerce = new AgenticCommerce(USDC_BASE, TREASURY, FEE_BPS);
        
        console.log("AgenticCommerce deployed at:", address(commerce));
        console.log("Payment token (USDC):", USDC_BASE);
        console.log("Treasury:", TREASURY);
        console.log("Fee BPS:", FEE_BPS);
        
        vm.stopBroadcast();
    }
}
