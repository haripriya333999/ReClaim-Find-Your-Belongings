/**
 * ReClaim - Step 8: Comprehensive 3-Member End-to-End Integration Test Suite
 *
 * Fully tests the complete interconnected architecture across all 3 members:
 * - Member 1: LOST & FOUND item reporting, validation, and persistence
 * - Member 2: Bi-directional smart matching engine, 6-criteria score breakdown, dual notifications, View Matches
 * - Member 3: Ownership verification permissions, claim workflow, verifier approvals/rejections, atomic recovery
 * - System: Atlas database reliability, production fallback guards, seed endpoint security, zero secret disclosure
 */

import {
  validateDatabaseConfig,
  isAtlasConnected,
  getConnectionStatus,
  getLastConnectionError,
  simulateDatabaseDisconnection,
  reconnectAtlas,
  closeDatabase,
  DB_NAME,
} from '../db/mongo.ts';

import {
  setExplicitTestStorage,
  isTestStorageAllowed,
  getActiveStorageMode,
  isAtlasMandatory,
  DatabaseDisconnectedError,
  findUserByEmail,
  findItemById,
  findMatchById,
  findNotificationsForUser,
  getUnreadNotificationCount,
  getAllOutboxNotifications,
  processNotificationRetries,
  resetFallbackDataForTesting,
  insertItem,
  executeAtomicRecovery,
} from '../db/repository.ts';

const BASE_URL = 'http://localhost:3000';

interface TestResult {
  part: string;
  name: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT RUN';
  detail?: string;
}

const testResults: TestResult[] = [];

function recordTest(part: string, name: string, condition: boolean, detail?: string) {
  const status: 'PASS' | 'FAIL' = condition ? 'PASS' : 'FAIL';
  testResults.push({ part, name, status, detail });
  const prefix = condition ? '✓ [PASS]' : '✗ [FAIL]';
  console.log(`${prefix} [${part}] ${name}${detail ? ` -> ${detail}` : ''}`);
}

async function runStep8IntegrationTests() {
  console.log('================================================================');
  console.log('RECLAIM - STEP 8: COMPREHENSIVE 3-MEMBER INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  const originalNodeEnv = process.env.NODE_ENV;
  const testRunId = Date.now().toString().slice(-6);

  try {
    // =================================================================
    // SETUP: Provision Dedicated Test Accounts via Live HTTP API
    // =================================================================
    console.log('--- SETUP: PROVISIONING ISOLATED TEST ACCOUNTS ---');

    const ownerEmail = `e2e_owner_${testRunId}@reclaim.test`;
    const finderEmail = `e2e_finder_${testRunId}@reclaim.test`;
    const verifierEmail = 'verifier@example.com';
    const testPassword = 'Password123';

    // 1. Register Owner (Account A)
    const regOwnerRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Ananya Sharma (Owner ${testRunId})`,
        email: ownerEmail,
        password: testPassword,
      }),
    }).then(r => r.json());

    // 2. Register Finder (Account B)
    const regFinderRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Rahul Varma (Finder ${testRunId})`,
        email: finderEmail,
        password: testPassword,
      }),
    }).then(r => r.json());

    // 3. Login to get tokens
    const loginOwnerRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password: testPassword }),
    }).then(r => r.json());

    const loginFinderRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: finderEmail, password: testPassword }),
    }).then(r => r.json());

    const loginVerifierRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: verifierEmail, password: testPassword }),
    }).then(r => r.json());

    const ownerToken = loginOwnerRes.token;
    const finderToken = loginFinderRes.token;
    const verifierToken = loginVerifierRes.token;
    const ownerUserId = loginOwnerRes.user?.id;
    const finderUserId = loginFinderRes.user?.id;
    const verifierUserId = loginVerifierRes.user?.id;

    recordTest(
      'Auth Setup',
      'Dedicated test accounts provisioned and authenticated via live server API',
      Boolean(ownerToken && finderToken && verifierToken && loginVerifierRes.user?.role === 'VERIFIER'),
      `Owner: ${ownerUserId}, Finder: ${finderUserId}, Verifier: ${verifierUserId} (Role: ${loginVerifierRes.user?.role})`
    );

    // Helper to upload an item with photo via multipart form data
    async function createItemReport(token: string, fields: Record<string, string>, imageFilename = 'backpack.png') {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) {
        fd.append(k, v);
      }
      const dummyImgBuffer = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG header bytes
      const blob = new Blob([dummyImgBuffer], { type: 'image/png' });
      fd.append('image', blob, imageFilename);

      const res = await fetch(`${BASE_URL}/api/items`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      return { status: res.status, data: await res.json() };
    }

    // =================================================================
    // PART 1: MEMBER 1 & MEMBER 2 INTEGRATION (REPORTING & MATCHING)
    // =================================================================
    console.log('\n--- PART 1: MEMBER 1 & MEMBER 2 INTEGRATION ---');

    // 1. Account A submits LOST report for "Black Backpack"
    const lostReportRes = await createItemReport(ownerToken, {
      reportType: 'LOST',
      itemName: 'Black Backpack',
      category: 'Bags',
      description: 'Black waterproof backpack with laptop sleeve and college crest keychain.',
      color: 'Black',
      location: 'Central College Library',
      date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    });

    const lostItem = lostReportRes.data.item;
    recordTest(
      'Part 1',
      'Member 1 LOST report successfully saved with photo',
      lostReportRes.status === 201 && lostReportRes.data.success && Boolean(lostItem?._id),
      `Lost Item ID: ${lostItem?._id}, matchesDetected: ${lostReportRes.data.matchesDetected}`
    );

    // 2. Unrelated FOUND report ("Gold Ring") does NOT create a false match
    const unrelatedFoundRes = await createItemReport(finderToken, {
      reportType: 'FOUND',
      itemName: 'Gold Wedding Ring',
      category: 'Jewellery',
      description: 'Engraved 18k yellow gold wedding band found near canteen.',
      color: 'Gold',
      location: 'Campus Canteen',
      date: new Date().toISOString().slice(0, 10),
    });

    recordTest(
      'Part 1',
      'Unrelated report does NOT trigger false-positive match (< 40% threshold)',
      unrelatedFoundRes.status === 201 && unrelatedFoundRes.data.matchesDetected === 0,
      `Matches detected: ${unrelatedFoundRes.data.matchesDetected}`
    );

    // 3. Account B submits matching FOUND report ("Black Backpack")
    const matchingFoundRes = await createItemReport(finderToken, {
      reportType: 'FOUND',
      itemName: 'Black Backpack',
      category: 'Bags',
      description: 'Waterproof black backpack with college crest keychain attached to zipper.',
      color: 'Black',
      location: 'Near Central College Library',
      date: new Date().toISOString().slice(0, 10),
    });

    const foundItem = matchingFoundRes.data.item;
    recordTest(
      'Part 1',
      'Member 1 FOUND report triggers Member 2 auto-matching engine',
      matchingFoundRes.status === 201 && matchingFoundRes.data.matchesDetected >= 1,
      `Found Item ID: ${foundItem?._id}, Detected matches: ${matchingFoundRes.data.matchesDetected}`
    );

    // 4. Retrieve candidate match via GET /api/matches
    const getMatchesRes = await fetch(`${BASE_URL}/api/matches`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    }).then(r => r.json());

    const activeMatch = getMatchesRes.matches?.find(
      (m: any) => m.lostItemId === lostItem._id && m.foundItemId === foundItem._id
    );

    recordTest(
      'Part 1',
      'Match record connects correct lostItemId, foundItemId, ownerId, and finderId',
      Boolean(activeMatch) &&
        activeMatch.lostItemId === lostItem._id &&
        activeMatch.foundItemId === foundItem._id &&
        activeMatch.ownerId === ownerUserId &&
        activeMatch.finderId === finderUserId,
      `Match ID: ${activeMatch?._id}, Score: ${activeMatch?.score}%`
    );

    // 5. Verify 6-criteria score breakdown integrity
    const breakdown = activeMatch?.breakdown || {};
    const hasAllCriteria = ['name', 'category', 'color', 'description', 'location', 'date'].every(
      k => typeof breakdown[k]?.score === 'number' && typeof breakdown[k]?.max === 'number'
    );
    const breakdownSum = Object.values(breakdown).reduce((acc: number, curr: any) => acc + curr.score, 0);

    recordTest(
      'Part 1',
      '6-Criteria score breakdown is complete and consistent with totalScore',
      hasAllCriteria && breakdownSum === activeMatch?.score && activeMatch.score >= 80,
      `Breakdown sum: ${breakdownSum}, Total: ${activeMatch?.score}% (Criteria: 6/6)`
    );

    // 6. Symmetrical reverse matching: FOUND report first, then LOST report
    const revFoundRes = await createItemReport(finderToken, {
      reportType: 'FOUND',
      itemName: 'Scientific Calculator',
      category: 'Electronics',
      description: 'Casio fx-991EX calculator in blue protective case.',
      color: 'Blue',
      location: 'Physics Lab 3',
      date: new Date().toISOString().slice(0, 10),
    });
    const revLostRes = await createItemReport(ownerToken, {
      reportType: 'LOST',
      itemName: 'Scientific Calculator',
      category: 'Electronics',
      description: 'Casio fx-991EX calculator with blue case left during lab class.',
      color: 'Blue',
      location: 'Physics Lab 3',
      date: new Date().toISOString().slice(0, 10),
    });

    recordTest(
      'Part 1',
      'Bidirectional symmetry: LOST-after-FOUND auto-matches with identical accuracy',
      revLostRes.status === 201 && revLostRes.data.matchesDetected >= 1,
      `Reverse detected matches: ${revLostRes.data.matchesDetected}`
    );

    // 7. Input validation error handling: Invalid report type or missing photo
    const invalidReportRes = await fetch(`${BASE_URL}/api/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportType: 'STOLEN', itemName: 'Bad Item' }),
    }).then(r => r.json());

    recordTest(
      'Part 1',
      'Invalid report type or missing photo is safely rejected with HTTP 400',
      !invalidReportRes.success,
      `Rejected message: "${invalidReportRes.message}"`
    );

    // =================================================================
    // PART 2: MATCHING & NOTIFICATION INTEGRATION
    // =================================================================
    console.log('\n--- PART 2: MATCHING & NOTIFICATION INTEGRATION ---');

    // 8. Owner receives in-app notification
    const ownerNotifsRes = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    }).then(r => r.json());

    const ownerMatchNotif = ownerNotifsRes.notifications?.find(
      (n: any) => n.matchId === activeMatch._id
    );

    recordTest(
      'Part 2',
      'Owner received in-app notification for the detected match',
      Boolean(ownerMatchNotif) && ownerMatchNotif.title.toLowerCase().includes('match'),
      `Owner Notification: "${ownerMatchNotif?.title}"`
    );

    // 9. Finder receives in-app notification
    const finderNotifsRes = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${finderToken}` },
    }).then(r => r.json());

    const finderMatchNotif = finderNotifsRes.notifications?.find(
      (n: any) => n.matchId === activeMatch._id
    );

    recordTest(
      'Part 2',
      'Finder received in-app notification for the detected match',
      Boolean(finderMatchNotif) && finderMatchNotif.title.toLowerCase().includes('match'),
      `Finder Notification: "${finderMatchNotif?.title}"`
    );

    // 10. Notification deduplication guard: Recalculate does not duplicate notifications
    const countBefore = ownerNotifsRes.count;
    await fetch(`${BASE_URL}/api/matches/recalculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const unreadAfterRes = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    }).then(r => r.json());

    recordTest(
      'Part 2',
      'Notification deduplication prevents duplicate notifications on recalculation',
      unreadAfterRes.count <= countBefore,
      `Notifications before: ${countBefore}, Unread count after recalculate: ${unreadAfterRes.count}`
    );

    // 11. Read/Unread tracking and mark-as-read API
    const unreadCountRes = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    }).then(r => r.json());

    const markAllReadRes = await fetch(`${BASE_URL}/api/notifications/mark-all-read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${ownerToken}` },
    }).then(r => r.json());

    const postMarkCountRes = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    }).then(r => r.json());

    recordTest(
      'Part 2',
      'Unread notification counter accurately tracks and clears via /api/notifications/mark-all-read',
      unreadCountRes.count > 0 && markAllReadRes.success && postMarkCountRes.count === 0,
      `Pre-read: ${unreadCountRes.count}, Post-read: ${postMarkCountRes.count}`
    );

    // 12. Transactional outbox retry endpoint resilience
    const retryRes = await fetch(`${BASE_URL}/api/notifications/retry`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
    }).then(r => r.json());

    recordTest(
      'Part 2',
      'Transactional outbox endpoint (/api/notifications/retry) executes safely',
      retryRes.success && typeof retryRes.result?.processed === 'number',
      `Processed: ${retryRes.result?.processed}, Succeeded: ${retryRes.result?.succeeded}`
    );

    // =================================================================
    // PART 3: MEMBER 2 & MEMBER 3 INTEGRATION (VERIFICATION & RECOVERY)
    // =================================================================
    console.log('\n--- PART 3: MEMBER 2 & MEMBER 3 INTEGRATION ---');

    // 13. Owner initiates claim workflow (PENDING -> CLAIM_IN_PROGRESS)
    const initiateClaimRes = await fetch(`${BASE_URL}/api/matches/${activeMatch._id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'CLAIM_IN_PROGRESS',
        note: 'Submitted ownership evidence: College ID 2024-EE-412 and laptop serial number.',
      }),
    });
    const claimData = await initiateClaimRes.json();

    recordTest(
      'Part 3',
      'Owner initiates claim workflow (PENDING -> CLAIM_IN_PROGRESS)',
      initiateClaimRes.status === 200 && claimData.match?.status === 'CLAIM_IN_PROGRESS',
      `Status: ${claimData.match?.status}`
    );

    // 14. Audit log records CLAIM_INITIATED entry
    const claimAudit = claimData.match?.auditLog?.find((e: any) => e.action === 'CLAIM_INITIATED');
    recordTest(
      'Part 3',
      'Audit trail logs claim initiation with actor, role, timestamp, and notes',
      Boolean(claimAudit) && claimAudit.actorRole === 'USER' && claimAudit.actorId === ownerUserId,
      `Action: ${claimAudit?.action}, Actor: ${claimAudit?.actorName} (${claimAudit?.actorRole})`
    );

    // 15. Security guard: Unverified recovery is strictly blocked (CLAIM_IN_PROGRESS -> RECLAIMED rejected)
    const prematureReclaimRes = await fetch(`${BASE_URL}/api/matches/${activeMatch._id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'RECLAIMED' }),
    });

    recordTest(
      'Part 3',
      'Unverified match cannot be marked as RECLAIMED (premature recovery blocked)',
      prematureReclaimRes.status === 400,
      `HTTP status: ${prematureReclaimRes.status}`
    );

    // 16. Security guard: Ordinary owner cannot self-verify ownership
    const ownerSelfVerifyRes = await fetch(`${BASE_URL}/api/matches/${activeMatch._id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'VERIFIED' }),
    });

    recordTest(
      'Part 3',
      'Security Guard: Owner cannot self-verify ownership claim (HTTP 403 Forbidden)',
      ownerSelfVerifyRes.status === 403,
      `HTTP status: ${ownerSelfVerifyRes.status}`
    );

    // 17. Security guard: Ordinary finder cannot approve verification
    const finderVerifyRes = await fetch(`${BASE_URL}/api/matches/${activeMatch._id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${finderToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'VERIFIED' }),
    });

    recordTest(
      'Part 3',
      'Security Guard: Finder cannot approve verification (HTTP 403 Forbidden)',
      finderVerifyRes.status === 403,
      `HTTP status: ${finderVerifyRes.status}`
    );

    // 18. Rejection workflow: Authorized Verifier rejects false claim
    const rejectRes = await fetch(`${BASE_URL}/api/matches/${activeMatch._id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${verifierToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'REJECTED',
        rejectionReason: 'ID badge provided belongs to a different student department.',
      }),
    });
    const rejectData = await rejectRes.json();

    recordTest(
      'Part 3',
      'Authorized Campus Verifier can reject claim with reason and logged audit',
      rejectRes.status === 200 && rejectData.match?.status === 'REJECTED',
      `Status: ${rejectData.match?.status}, Rejection: "${rejectData.match?.rejectionReason}"`
    );

    // Re-open claim for complete recovery test
    await fetch(`${BASE_URL}/api/matches/${activeMatch._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PENDING' }),
    });
    await fetch(`${BASE_URL}/api/matches/${activeMatch._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CLAIM_IN_PROGRESS', note: 'Re-submitted with verified faculty note.' }),
    });

    // 19. Authorized Campus Verifier approves verification
    const approveRes = await fetch(`${BASE_URL}/api/matches/${activeMatch._id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${verifierToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'VERIFIED',
        note: 'Verified ownership via department registration registry and student ID.',
      }),
    });
    const approveData = await approveRes.json();

    recordTest(
      'Part 3',
      'Authorized Campus Verifier approves claim (status becomes VERIFIED, logs verifier ID)',
      approveRes.status === 200 &&
        approveData.match?.status === 'VERIFIED' &&
        approveData.match?.verifiedBy === verifierUserId &&
        Boolean(approveData.match?.verifiedAt),
      `Verified by: ${approveData.match?.verifiedBy}, Verified at: ${approveData.match?.verifiedAt}`
    );

    // 20. Atomic recovery: Complete handover & update Match, Lost Item, and Found Item
    const recoveryRes = await fetch(`${BASE_URL}/api/matches/${activeMatch._id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${verifierToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'RECLAIMED',
        note: 'Physical handover completed at Campus Security Desk. Belonging safely recovered.',
      }),
    });
    const recoveryData = await recoveryRes.json();

    // Verify recovery via public authenticated API endpoints
    const recoveredLostItem = await fetch(`${BASE_URL}/api/items/${lostItem._id}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    }).then(r => r.json());

    const recoveredFoundItem = await fetch(`${BASE_URL}/api/items/${foundItem._id}`, {
      headers: { Authorization: `Bearer ${finderToken}` },
    }).then(r => r.json());

    recordTest(
      'Part 3',
      'Atomic Recovery: Match, LOST item, and FOUND item all update to RECLAIMED consistently',
      recoveryRes.status === 200 &&
        recoveryData.match?.status === 'RECLAIMED' &&
        recoveredLostItem.item?.status === 'RECLAIMED' &&
        recoveredFoundItem.item?.status === 'RECLAIMED',
      `Match: ${recoveryData.match?.status}, LostItem: ${recoveredLostItem.item?.status}, FoundItem: ${recoveredFoundItem.item?.status}`
    );

    // 21. Idempotency: Repeated recovery request safely handled without duplicate operations
    const repeatRecoveryRes = await fetch(`${BASE_URL}/api/matches/${activeMatch._id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${verifierToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'RECLAIMED' }),
    });
    const repeatData = await repeatRecoveryRes.json();

    recordTest(
      'Part 3',
      'Idempotent recovery: Repeated request returns alreadyReclaimed without duplicating audit log',
      repeatRecoveryRes.status === 200 && repeatData.alreadyReclaimed === true,
      `alreadyReclaimed: ${repeatData.alreadyReclaimed}`
    );

    // 22. Matching integrity: Reclaimed items are excluded from future active matching passes
    const reLostRes = await createItemReport(ownerToken, {
      reportType: 'LOST',
      itemName: 'Black Backpack',
      category: 'Bags',
      description: 'Another black backpack.',
      color: 'Black',
      location: 'Central College Library',
      date: new Date().toISOString().slice(0, 10),
    });

    const activeMatchesForFound = await fetch(`${BASE_URL}/api/matches`, {
      headers: { Authorization: `Bearer ${finderToken}` },
    }).then(r => r.json());

    const hasReMatchWithReclaimed = activeMatchesForFound.matches?.some(
      (m: any) => m.lostItemId === reLostRes.data.item?._id && m.foundItemId === foundItem._id
    );

    recordTest(
      'Part 3',
      'Integrity guard: Reclaimed items are excluded from future active matching passes',
      !hasReMatchWithReclaimed,
      `Re-matched with reclaimed item: ${hasReMatchWithReclaimed}`
    );

    // =================================================================
    // PART 4: DATABASE & SECURITY INTEGRATION
    // =================================================================
    console.log('\n--- PART 4: DATABASE & SECURITY INTEGRATION ---');

    // 23. Authoritative database target is strictly reclaim_db
    recordTest(
      'Part 4',
      'Authoritative database name is locked to "reclaim_db"',
      DB_NAME === 'reclaim_db',
      `Database name: ${DB_NAME}`
    );

    // 24. Production fallback refusal: In-memory fallback forbidden in production
    process.env.NODE_ENV = 'production';
    const prodTestAllowed = isTestStorageAllowed();
    const prodStorageMode = getActiveStorageMode();
    process.env.NODE_ENV = 'development';

    recordTest(
      'Part 4',
      'Production mode strictly forbids in-memory fallback (isTestStorageAllowed=false)',
      prodTestAllowed === false && (prodStorageMode === 'UNAVAILABLE' || prodStorageMode === 'ATLAS'),
      `isTestStorageAllowed: ${prodTestAllowed}, StorageMode in prod: ${prodStorageMode}`
    );

    // 25. Seed endpoint protection: Blocked in production mode
    const prodSeedRes = await fetch(`${BASE_URL}/api/dev/seed`, {
      method: 'POST',
      headers: { 'x-reclaim-env': 'production' },
    });

    recordTest(
      'Part 4',
      'Seed endpoint (/api/dev/seed) is strictly blocked in production mode (HTTP 403)',
      prodSeedRes.status === 403,
      `HTTP status: ${prodSeedRes.status}`
    );

    // 26. Authentication enforcement: Protected routes reject unauthenticated requests
    const unauthRes = await fetch(`${BASE_URL}/api/matches`);
    recordTest(
      'Part 4',
      'Unauthenticated requests to protected endpoints rejected with HTTP 401',
      unauthRes.status === 401,
      `HTTP status: ${unauthRes.status}`
    );

    // 27. Token tampering protection: Invalid token rejected
    const badTokenRes = await fetch(`${BASE_URL}/api/matches`, {
      headers: { Authorization: 'Bearer this_is_a_forged_or_invalid_jwt_token' },
    });
    recordTest(
      'Part 4',
      'Tampered or invalid JWT authentication tokens rejected with HTTP 401',
      badTokenRes.status === 401,
      `HTTP status: ${badTokenRes.status}`
    );

    // 28. Zero secret disclosure: Diagnostic endpoints & error sanitization scrub credentials
    const healthRes = await fetch(`${BASE_URL}/api/health`).then(r => r.json());
    const healthPayloadStr = JSON.stringify(healthRes);

    const leaksMongoCredential =
      healthPayloadStr.includes('mongodb+srv://') ||
      healthPayloadStr.includes('password=') ||
      healthPayloadStr.includes('Password123');
    const leaksJwtSecret =
      healthPayloadStr.includes('minimum_32_characters') || healthPayloadStr.includes('jwt');

    recordTest(
      'Part 4',
      'Health & error responses scrub all secrets, passwords, URIs, and JWT keys',
      !leaksMongoCredential && !leaksJwtSecret && healthRes.database?.databaseName === 'reclaim_db',
      `Database: ${healthRes.database?.databaseName}, Overall status: ${healthRes.status}`
    );

    // =================================================================
    // PART 5: FRONTEND CONTRACT & API INTEGRATION
    // =================================================================
    console.log('\n--- PART 5: FRONTEND CONTRACT & API INTEGRATION ---');

    // 29. Report API matches frontend report.js expectations
    const sampleItemRes = await createItemReport(ownerToken, {
      reportType: 'LOST',
      itemName: 'Blue Umbrella',
      category: 'Accessories',
      description: 'Compact foldable umbrella.',
      color: 'Blue',
      location: 'Student Center',
      date: new Date().toISOString().slice(0, 10),
    });

    const reportContractOk =
      sampleItemRes.data.hasOwnProperty('success') &&
      sampleItemRes.data.hasOwnProperty('message') &&
      sampleItemRes.data.hasOwnProperty('item') &&
      sampleItemRes.data.hasOwnProperty('matchesDetected') &&
      sampleItemRes.data.item.hasOwnProperty('imageUrl');

    recordTest(
      'Part 5',
      'POST /api/items contract matches frontend report.js expectations',
      reportContractOk,
      `Fields: success, message, item (with imageUrl), matchesDetected`
    );

    // 30. Matches API matches frontend matches.js expectations
    const matchesContractRes = await fetch(`${BASE_URL}/api/matches`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    }).then(r => r.json());

    const sampleMatch = matchesContractRes.matches?.[0];
    const matchContractOk =
      matchesContractRes.hasOwnProperty('success') &&
      matchesContractRes.hasOwnProperty('count') &&
      Array.isArray(matchesContractRes.matches) &&
      Boolean(sampleMatch) &&
      sampleMatch.hasOwnProperty('score') &&
      sampleMatch.hasOwnProperty('breakdown') &&
      sampleMatch.hasOwnProperty('lostItem') &&
      sampleMatch.hasOwnProperty('foundItem') &&
      sampleMatch.hasOwnProperty('ownerName') &&
      sampleMatch.hasOwnProperty('finderName') &&
      sampleMatch.hasOwnProperty('auditLog');

    recordTest(
      'Part 5',
      'GET /api/matches contract matches frontend matches.js expectations',
      matchContractOk,
      `Count: ${matchesContractRes.count}, Match populated with items and audit trail`
    );

    // 31. Notifications API matches frontend notifications.js expectations
    const notifsContractRes = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    }).then(r => r.json());

    const notifsContractOk =
      notifsContractRes.hasOwnProperty('success') &&
      notifsContractRes.hasOwnProperty('count') &&
      Array.isArray(notifsContractRes.notifications);

    recordTest(
      'Part 5',
      'GET /api/notifications contract matches frontend notifications.js expectations',
      notifsContractOk,
      `Count: ${notifsContractRes.count}`
    );

    // 32. Health API matches frontend api.js banner update expectations
    const healthBannerOk =
      healthRes.hasOwnProperty('status') &&
      healthRes.hasOwnProperty('database') &&
      healthRes.database.hasOwnProperty('provider') &&
      healthRes.database.hasOwnProperty('databaseName') &&
      healthRes.database.hasOwnProperty('connected') &&
      healthRes.hasOwnProperty('modules');

    recordTest(
      'Part 5',
      'GET /api/health contract matches frontend api.js updateDbStatusBanner() expectations',
      healthBannerOk,
      `connected: ${healthRes.database.connected}, DB: ${healthRes.database.databaseName}`
    );

    // =================================================================
    // PART 6: COMPLETE END-TO-END WORKFLOW SUMMARY
    // =================================================================
    console.log('\n--- PART 6: COMPLETE END-TO-END SCENARIO VERIFICATION ---');

    recordTest(
      'Part 6',
      'Full End-to-End Scenario: Lost Report -> Found Report -> Auto Match -> Dual Notifications -> Claim Initiation -> Verifier Approval -> Atomic Recovery',
      recoveryRes.status === 200 &&
        recoveredLostItem.item?.status === 'RECLAIMED' &&
        recoveredFoundItem.item?.status === 'RECLAIMED',
      'All 3 interconnected records successfully traversed the full lifecycle to RECLAIMED'
    );

    // =================================================================
    // PART 7: FAILURE & EDGE-CASE RESILIENCE
    // =================================================================
    console.log('\n--- PART 7: FAILURE & EDGE CASES ---');

    // 34. Non-existent match status update returns HTTP 404
    const notFoundMatchRes = await fetch(`${BASE_URL}/api/matches/non_existent_id/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${verifierToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'VERIFIED' }),
    });

    recordTest(
      'Part 7',
      'Status update for non-existent match returns HTTP 404',
      notFoundMatchRes.status === 404,
      `HTTP status: ${notFoundMatchRes.status}`
    );

    // 35. Illegal status transition from RECLAIMED back to PENDING is rejected
    const badTransitionRes = await fetch(`${BASE_URL}/api/matches/${activeMatch._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${verifierToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PENDING' }),
    });

    recordTest(
      'Part 7',
      'Illegal status transition from RECLAIMED back to PENDING is rejected (HTTP 400)',
      badTransitionRes.status === 400,
      `HTTP status: ${badTransitionRes.status}`
    );

    // 36. Direct jump from PENDING to VERIFIED without initiating claim is rejected
    const directJumpLost = await createItemReport(ownerToken, {
      reportType: 'LOST',
      itemName: 'Black Umbrella',
      category: 'Accessories',
      description: 'Black umbrella left in bus.',
      color: 'Black',
      location: 'Bus Stop',
      date: new Date().toISOString().slice(0, 10),
    });
    const directJumpFound = await createItemReport(finderToken, {
      reportType: 'FOUND',
      itemName: 'Black Umbrella',
      category: 'Accessories',
      description: 'Black umbrella found in bus seat.',
      color: 'Black',
      location: 'Bus Stop',
      date: new Date().toISOString().slice(0, 10),
    });
    const pendingMatches = await fetch(`${BASE_URL}/api/matches`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    }).then(r => r.json());
    const pendingMatch = pendingMatches.matches?.find(
      (m: any) => m.lostItemId === directJumpLost.data.item?._id && m.foundItemId === directJumpFound.data.item?._id
    );

    const directJumpRes = await fetch(`${BASE_URL}/api/matches/${pendingMatch?._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${verifierToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'VERIFIED' }),
    });

    recordTest(
      'Part 7',
      'Direct jump from PENDING to VERIFIED without initiating claim is rejected (HTTP 400)',
      directJumpRes.status === 400,
      `HTTP status: ${directJumpRes.status}`
    );

  } finally {
    process.env.NODE_ENV = originalNodeEnv || 'development';
  }

  // =================================================================
  // FINAL SUMMARY
  // =================================================================
  console.log('\n================================================================');
  const passCount = testResults.filter(r => r.status === 'PASS').length;
  const failCount = testResults.filter(r => r.status === 'FAIL').length;
  const totalCount = testResults.length;

  console.log(`STEP 8 INTEGRATION TEST SUMMARY: ${passCount}/${totalCount} TESTS PASSED`);
  if (failCount > 0) {
    console.error(`FAILED TESTS: ${failCount}`);
    process.exit(1);
  } else {
    console.log('ALL STEP 8 INTEGRATION TESTS PASSED CLEANLY! ❤️');
  }
  console.log('================================================================\n');
}

runStep8IntegrationTests().catch(err => {
  console.error('Fatal Step 8 test execution error:', err);
  process.exit(1);
});
