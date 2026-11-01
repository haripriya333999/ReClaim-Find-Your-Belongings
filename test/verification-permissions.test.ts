import { calculateMatchScore } from '../matching/engine.ts';
import { ItemRecord, MatchRecord, UserRecord } from '../db/repository.ts';

async function runVerificationSecurityTests() {
  console.log('====================================================');
  console.log('RECLAIM - STEP 2: VERIFICATION & RECOVERY SECURITY TEST SUITE');
  console.log('====================================================');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`✓ [PASS] Test ${total}: ${testName}${detail ? ` -> ${detail}` : ''}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] Test ${total}: ${testName}${detail ? ` -> ${detail}` : ''}`);
    }
  }

  const BASE_URL = 'http://localhost:3000';

  // Helper login
  async function login(email: string) {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123' }),
    }).then(r => r.json());
    return res.token;
  }

  // 1. Log in users
  const ownerToken = await login('ananya@example.com');
  const finderToken = await login('rahul@example.com');
  const verifierToken = await login('verifier@example.com');

  assert(Boolean(ownerToken), 'Owner (Ananya) can authenticate', 'role: USER');
  assert(Boolean(finderToken), 'Finder (Rahul) can authenticate', 'role: USER');
  assert(Boolean(verifierToken), 'Campus Verifier (Vikram) can authenticate', 'role: VERIFIER');

  // Retrieve a PENDING match (or create one fresh for tests)
  const matchRes = await fetch(`${BASE_URL}/api/matches`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  }).then(r => r.json());
  
  let match = (matchRes.matches || []).find((m: any) => m.status === 'PENDING');

  if (!match) {
    // Generate fresh test pair to produce a clean PENDING match
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
      0x42, 0x60, 0x82
    ]);

    const lostForm = new FormData();
    lostForm.append('reportType', 'LOST');
    lostForm.append('itemName', 'Leather Wallet');
    lostForm.append('category', 'Accessories');
    lostForm.append('description', 'Black leather wallet with silver badge and student ID');
    lostForm.append('color', 'Black');
    lostForm.append('location', 'Central Library');
    lostForm.append('date', new Date().toISOString());
    lostForm.append('image', new Blob([pngBytes], { type: 'image/png' }), 'wallet.png');

    await fetch(`${BASE_URL}/api/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: lostForm,
    });

    const foundForm = new FormData();
    foundForm.append('reportType', 'FOUND');
    foundForm.append('itemName', 'Leather Wallet');
    foundForm.append('category', 'Accessories');
    foundForm.append('description', 'Found black leather wallet near central library benches with silver badge');
    foundForm.append('color', 'Black');
    foundForm.append('location', 'Central Library');
    foundForm.append('date', new Date().toISOString());
    foundForm.append('image', new Blob([pngBytes], { type: 'image/png' }), 'wallet.png');

    await fetch(`${BASE_URL}/api/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${finderToken}` },
      body: foundForm,
    });

    const refreshedMatches = await fetch(`${BASE_URL}/api/matches`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    }).then(r => r.json());
    match = (refreshedMatches.matches || []).find((m: any) => m.status === 'PENDING');
  }

  const matchId = match?._id;
  assert(Boolean(matchId), 'Active PENDING candidate match is available', `Match ID: ${matchId}`);

  // Test 1: Unauthenticated request cannot modify match status
  const unauthRes = await fetch(`${BASE_URL}/api/matches/${matchId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'CLAIM_IN_PROGRESS' }),
  });
  assert(unauthRes.status === 401, 'Unauthenticated user rejected with HTTP 401');

  // Test 2: Invalid direct transition (PENDING -> VERIFIED directly rejected)
  const invalidJumpRes = await fetch(`${BASE_URL}/api/matches/${matchId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${verifierToken}` },
    body: JSON.stringify({ status: 'VERIFIED' }),
  });
  assert(invalidJumpRes.status === 400, 'Direct jump from PENDING -> VERIFIED without initiating claim rejected with HTTP 400');

  // Test 3: Owner initiates claim (PENDING -> CLAIM_IN_PROGRESS)
  const claimRes = await fetch(`${BASE_URL}/api/matches/${matchId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ status: 'CLAIM_IN_PROGRESS', note: 'Claimant provided college registration proof' }),
  });
  const claimJson = await claimRes.json();
  assert(claimRes.status === 200 && claimJson.match?.status === 'CLAIM_IN_PROGRESS', 'Owner can initiate claim (PENDING -> CLAIM_IN_PROGRESS)');

  // Test 4: Owner CANNOT self-verify (Owner attempting CLAIM_IN_PROGRESS -> VERIFIED rejected with 403)
  const ownerSelfVerifyRes = await fetch(`${BASE_URL}/api/matches/${matchId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ status: 'VERIFIED' }),
  });
  assert(ownerSelfVerifyRes.status === 403, 'Owner cannot self-verify claim (rejected with HTTP 403 Forbidden)');

  // Test 5: Finder CANNOT self-verify (Finder attempting CLAIM_IN_PROGRESS -> VERIFIED rejected with 403)
  const finderSelfVerifyRes = await fetch(`${BASE_URL}/api/matches/${matchId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${finderToken}` },
    body: JSON.stringify({ status: 'VERIFIED' }),
  });
  assert(finderSelfVerifyRes.status === 403, 'Finder cannot approve verification (rejected with HTTP 403 Forbidden)');

  // Test 6: Unauthorized user cannot mark item as RECLAIMED
  const prematureReclaimRes = await fetch(`${BASE_URL}/api/matches/${matchId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ status: 'RECLAIMED' }),
  });
  assert(prematureReclaimRes.status === 400 || prematureReclaimRes.status === 403, 'Cannot mark RECLAIMED before claim has been verified (rejected)');

  // Test 7: Authorized Campus Verifier approves verification (CLAIM_IN_PROGRESS -> VERIFIED)
  const verifierApproveRes = await fetch(`${BASE_URL}/api/matches/${matchId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${verifierToken}` },
    body: JSON.stringify({ status: 'VERIFIED', note: 'College ID and silver emblem inspected and verified by verifier.' }),
  });
  const verifierApproveJson = await verifierApproveRes.json();
  assert(verifierApproveRes.status === 200 && verifierApproveJson.match?.status === 'VERIFIED', 'Authorized Campus Verifier approves claim (status becomes VERIFIED)');
  assert(Boolean(verifierApproveJson.match?.verifiedBy), 'Verifier ID and timestamp recorded in match record');

  // Test 8: Audit Trail logging (records actor, action, previousStatus, newStatus, timestamp)
  const auditLog = verifierApproveJson.match?.auditLog || [];
  const approveAudit = auditLog.find((e: any) => e.action === 'VERIFICATION_APPROVED');
  assert(Boolean(approveAudit), 'Audit trail records VERIFICATION_APPROVED action', `Actor: ${approveAudit?.actorName} (${approveAudit?.actorRole})`);

  // Test 9: Complete Handover & Recovery (VERIFIED -> RECLAIMED)
  const reclaimRes = await fetch(`${BASE_URL}/api/matches/${matchId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${verifierToken}` },
    body: JSON.stringify({ status: 'RECLAIMED', note: 'Physical wallet handed over to owner.' }),
  });
  const reclaimJson = await reclaimRes.json();
  assert(reclaimRes.status === 200 && reclaimJson.match?.status === 'RECLAIMED', 'Handover confirmed and match status set to RECLAIMED');

  // Test 10: Consistency: Both Lost Item and Found Item updated to RECLAIMED
  const lostItemCheck = await fetch(`${BASE_URL}/api/items/${reclaimJson.match.lostItemId}`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  }).then(r => r.json());
  const foundItemCheck = await fetch(`${BASE_URL}/api/items/${reclaimJson.match.foundItemId}`, {
    headers: { Authorization: `Bearer ${finderToken}` },
  }).then(r => r.json());
  assert(lostItemCheck.item?.status === 'RECLAIMED', 'Associated LOST item status updated to RECLAIMED');
  assert(foundItemCheck.item?.status === 'RECLAIMED', 'Associated FOUND item status updated to RECLAIMED');

  // Test 11: Idempotency: Repeated RECLAIMED update does not corrupt state
  const repeatReclaimRes = await fetch(`${BASE_URL}/api/matches/${matchId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${verifierToken}` },
    body: JSON.stringify({ status: 'RECLAIMED' }),
  });
  const repeatJson = await repeatReclaimRes.json();
  assert(repeatReclaimRes.status === 200 && repeatJson.match?.status === 'RECLAIMED', 'Repeated recovery request safely returns RECLAIMED status without error');

  console.log('====================================================');
  console.log(`RESULTS: ${passed}/${total} SECURITY & VERIFICATION TESTS PASSED`);
  console.log('====================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runVerificationSecurityTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
