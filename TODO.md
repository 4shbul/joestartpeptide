# TODO: Convert Affiliate System to Redeem Code System

## Backend Changes (server.js)
- [x] Change affiliate 'code' to 'redeemCode' in affiliate data structure
- [x] Update /api/affiliate/generate-code endpoint to generate redeemCode and create discount code
- [x] Update /api/affiliate/dashboard endpoint to return redeemCode
- [x] Update /api/affiliate/track endpoint to use redeemCode for tracking
- [x] Update registration referral handling to use redeemCode

## Frontend Changes (affiliate.html)
- [x] Change "Referral Code" to "Redeem Code" in dashboard
- [x] Update code display and copy functionality
- [x] Update how-it-works steps to reflect redeem system
- [x] Update stats and descriptions for redeem benefits
- [x] Update button text and descriptions

## Testing
- [x] Test affiliate registration and redeem code generation
- [x] Test dashboard display
- [x] Test discount code usage
- [x] Verify referral tracking still works
