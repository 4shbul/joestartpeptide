# TODO: Convert Affiliate System to Redeem Code System

## Backend Changes (server.js)
- [ ] Change affiliate 'code' to 'redeemCode' in affiliate data structure
- [ ] Update /api/affiliate/generate-code endpoint to generate redeemCode and create discount code
- [ ] Update /api/affiliate/dashboard endpoint to return redeemCode
- [ ] Update /api/affiliate/track endpoint to use redeemCode for tracking
- [ ] Update registration referral handling to use redeemCode

## Frontend Changes (affiliate.html)
- [ ] Change "Referral Code" to "Redeem Code" in dashboard
- [ ] Update code display and copy functionality
- [ ] Update how-it-works steps to reflect redeem system
- [ ] Update stats and descriptions for redeem benefits
- [ ] Update button text and descriptions

## Testing
- [ ] Test affiliate registration and redeem code generation
- [ ] Test dashboard display
- [ ] Test discount code usage
- [ ] Verify referral tracking still works
