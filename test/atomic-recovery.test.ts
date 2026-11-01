import {
  executeAtomicRecovery,
  resetFallbackDataForTesting,
  findMatchById,
  findItemById,
  getAllOutboxNotifications,
  retryFailedOutboxNotifications,
  findNotificationsForUser,
  initFallbackData,
  updateMatchStatus,
  ItemRecord,
  MatchRecord,
  UserRole,
} from '../db/repository.ts';
import { checkTransactionSupport, isAtlasConnected } from '../db/mongo.ts';

async function runAtomicRecoveryTests() {
  console.log('====================================================');
  console.log('RECLAIM - STEP 3: ATOMIC RECOVERY & CONSISTENCY TEST SUITE');
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

  const verifierToken = await login('verifier@example.com');
  const ownerToken = await login('ananya@example.com');
  const finderToken = await login('rahul@example.com');
  const demoToken = await login('demo@example.com');

  const verifierActor = {
    id: 'user_verifier_04',
    name: 'Vikram Roy (Campus Verifier)',
    role: 'VERIFIER' as UserRole,
  };

  const unauthorizedActor = {
    id: 'user_demo_01',
    name: 'Alex Morgan',
    role: 'USER' as UserRole,
  };

  // Helper to ensure a fresh test match in VERIFIED state
  async function createVerifiedMatch(suffix: string): Promise<{ matchId: string; lostId: string; foundId: string }> {
    const lostId = `test_lost_${suffix}`;
    const foundId = `test_found_${suffix}`;
    const matchId = `test_match_${suffix}`;
    const now = new Date().toISOString();

    // Use fallback store directly for deterministic isolation
    const { memItems, memMatches } = await import('../db/repository.ts') as any;

    // We can use updateMatchStatus and repository items
    return { matchId, lostId, foundId };
  }

  // -------------------------------------------------------------
  // Test 1: All three updates succeed and commit atomically
  // -------------------------------------------------------------
  resetFallbackDataForTesting();
  // Set demo match to VERIFIED
  await updateMatchStatus('match_demo_01', 'VERIFIED');
  const initialMatch = await findMatchById('match_demo_01');
  const initialLost = await findItemById(initialMatch!.lostItemId);
  const initialFound = await findItemById(initialMatch!.foundItemId);

  const t1Res = await executeAtomicRecovery({
    matchId: 'match_demo_01',
    actor: verifierActor,
    note: 'Physical handover completed at student affairs desk',
  });

  const updatedMatch1 = await findMatchById('match_demo_01');
  const updatedLost1 = await findItemById(initialMatch!.lostItemId);
  const updatedFound1 = await findItemById(initialMatch!.foundItemId);

  assert(
    t1Res.success === true &&
    updatedMatch1?.status === 'RECLAIMED' &&
    updatedLost1?.status === 'RECLAIMED' &&
    updatedFound1?.status === 'RECLAIMED',
    'All three updates succeed and commit atomically',
    `Match: ${updatedMatch1?.status}, LostItem: ${updatedLost1?.status}, FoundItem: ${updatedFound1?.status}`
  );

  // -------------------------------------------------------------
  // Test 2: Match update fails and no partial recovery remains
  // -------------------------------------------------------------
  resetFallbackDataForTesting();
  await updateMatchStatus('match_demo_01', 'VERIFIED');
  const t2Res = await executeAtomicRecovery({
    matchId: 'match_demo_01',
    actor: verifierActor,
    forceFailStep: 'MATCH',
  });

  const match2 = await findMatchById('match_demo_01');
  const lost2 = await findItemById(match2!.lostItemId);
  const found2 = await findItemById(match2!.foundItemId);

  assert(
    t2Res.success === false &&
    match2?.status === 'VERIFIED' &&
    lost2?.status === 'OPEN' &&
    found2?.status === 'OPEN',
    'Match update fails and no partial recovery remains (rollback verified)',
    `Match: ${match2?.status}, Lost: ${lost2?.status}, Found: ${found2?.status}`
  );

  // -------------------------------------------------------------
  // Test 3: LOST item update fails and no partial recovery remains
  // -------------------------------------------------------------
  resetFallbackDataForTesting();
  await updateMatchStatus('match_demo_01', 'VERIFIED');
  const t3Res = await executeAtomicRecovery({
    matchId: 'match_demo_01',
    actor: verifierActor,
    forceFailStep: 'LOST',
  });

  const match3 = await findMatchById('match_demo_01');
  const lost3 = await findItemById(match3!.lostItemId);
  const found3 = await findItemById(match3!.foundItemId);

  assert(
    t3Res.success === false &&
    match3?.status === 'VERIFIED' &&
    lost3?.status === 'OPEN' &&
    found3?.status === 'OPEN',
    'LOST item update fails and no partial recovery remains (rollback verified)',
    `Match: ${match3?.status}, Lost: ${lost3?.status}, Found: ${found3?.status}`
  );

  // -------------------------------------------------------------
  // Test 4: FOUND item update fails and no partial recovery remains
  // -------------------------------------------------------------
  resetFallbackDataForTesting();
  await updateMatchStatus('match_demo_01', 'VERIFIED');
  const t4Res = await executeAtomicRecovery({
    matchId: 'match_demo_01',
    actor: verifierActor,
    forceFailStep: 'FOUND',
  });

  const match4 = await findMatchById('match_demo_01');
  const lost4 = await findItemById(match4!.lostItemId);
  const found4 = await findItemById(match4!.foundItemId);

  assert(
    t4Res.success === false &&
    match4?.status === 'VERIFIED' &&
    lost4?.status === 'OPEN' &&
    found4?.status === 'OPEN',
    'FOUND item update fails and no partial recovery remains (rollback verified)',
    `Match: ${match4?.status}, Lost: ${lost4?.status}, Found: ${found4?.status}`
  );

  // -------------------------------------------------------------
  // Test 5: Missing LOST item prevents recovery
  // -------------------------------------------------------------
  resetFallbackDataForTesting();
  await updateMatchStatus('match_demo_01', 'VERIFIED', undefined, { lostItemId: 'non_existent_lost_item' });
  const t5Res = await executeAtomicRecovery({
    matchId: 'match_demo_01',
    actor: verifierActor,
  });

  assert(
    t5Res.success === false && t5Res.errorCode === 'MISSING_LOST_ITEM',
    'Missing LOST item prevents recovery',
    `ErrorCode: ${t5Res.errorCode}`
  );

  // -------------------------------------------------------------
  // Test 6: Missing FOUND item prevents recovery
  // -------------------------------------------------------------
  resetFallbackDataForTesting();
  await updateMatchStatus('match_demo_01', 'VERIFIED', undefined, { foundItemId: 'non_existent_found_item' });
  const t6Res = await executeAtomicRecovery({
    matchId: 'match_demo_01',
    actor: verifierActor,
  });

  assert(
    t6Res.success === false && t6Res.errorCode === 'MISSING_FOUND_ITEM',
    'Missing FOUND item prevents recovery',
    `ErrorCode: ${t6Res.errorCode}`
  );

  // -------------------------------------------------------------
  // Test 7: Invalid match state prevents recovery
  // -------------------------------------------------------------
  resetFallbackDataForTesting();
  // match is in PENDING state
  const t7ResPending = await executeAtomicRecovery({
    matchId: 'match_demo_01',
    actor: verifierActor,
  });

  await updateMatchStatus('match_demo_01', 'CLAIM_IN_PROGRESS');
  const t7ResClaiming = await executeAtomicRecovery({
    matchId: 'match_demo_01',
    actor: verifierActor,
  });

  assert(
    t7ResPending.success === false &&
    t7ResPending.errorCode === 'INVALID_STATE' &&
    t7ResClaiming.success === false &&
    t7ResClaiming.errorCode === 'INVALID_STATE',
    'Invalid match state prevents recovery (PENDING or CLAIM_IN_PROGRESS rejected)',
    `PENDING err: ${t7ResPending.errorCode}, CLAIM_IN_PROGRESS err: ${t7ResClaiming.errorCode}`
  );

  // -------------------------------------------------------------
  // Test 8: Incorrect item references prevent recovery (type mismatch)
  // -------------------------------------------------------------
  resetFallbackDataForTesting();
  // Swap so lostItemId points to a FOUND item
  const validMatch = await findMatchById('match_demo_01');
  await updateMatchStatus('match_demo_01', 'VERIFIED', undefined, {
    lostItemId: validMatch!.foundItemId, // Swapped!
  });

  const t8Res = await executeAtomicRecovery({
    matchId: 'match_demo_01',
    actor: verifierActor,
  });

  assert(
    t8Res.success === false && t8Res.errorCode === 'INVALID_ITEM_RELATION',
    'Incorrect item references prevent recovery (reportType mismatch rejected)',
    `ErrorCode: ${t8Res.errorCode}`
  );

  // -------------------------------------------------------------
  // Test 9: Unauthorized recovery is rejected
  // -------------------------------------------------------------
  resetFallbackDataForTesting();
  await updateMatchStatus('match_demo_01', 'VERIFIED');
  const t9Res = await executeAtomicRecovery({
    matchId: 'match_demo_01',
    actor: unauthorizedActor, // Ordinary user who is neither owner nor finder nor verifier
  });

  assert(
    t9Res.success === false && t9Res.errorCode === 'UNAUTHORIZED',
    'Unauthorized recovery is rejected',
    `ErrorCode: ${t9Res.errorCode}`
  );

  // -------------------------------------------------------------
  // Test 10: Repeated recovery requests do not create duplicate operations
  // -------------------------------------------------------------
  resetFallbackDataForTesting();
  await updateMatchStatus('match_demo_01', 'VERIFIED');

  // First recovery
  const t10First = await executeAtomicRecovery({
    matchId: 'match_demo_01',
    actor: verifierActor,
  });

  const auditCountBefore = (await findMatchById('match_demo_01'))?.auditLog?.length || 0;
  const outboxCountBefore = (await getAllOutboxNotifications()).length;

  // Second recovery (repeated / double click)
  const t10Second = await executeAtomicRecovery({
    matchId: 'match_demo_01',
    actor: verifierActor,
  });

  const auditCountAfter = (await findMatchById('match_demo_01'))?.auditLog?.length || 0;
  const outboxCountAfter = (await getAllOutboxNotifications()).length;

  assert(
    t10First.success === true &&
    t10Second.success === true &&
    t10Second.alreadyReclaimed === true &&
    auditCountBefore === auditCountAfter &&
    outboxCountBefore === outboxCountAfter,
    'Repeated recovery requests safely return alreadyReclaimed without duplicate operations',
    `Audit log unchanged: ${auditCountBefore} -> ${auditCountAfter}`
  );

  // -------------------------------------------------------------
  // Test 11: Concurrent recovery requests do not produce inconsistent states
  // -------------------------------------------------------------
  resetFallbackDataForTesting();
  await updateMatchStatus('match_demo_01', 'VERIFIED');

  // Fire two recoveries concurrently
  const [c1, c2] = await Promise.all([
    executeAtomicRecovery({ matchId: 'match_demo_01', actor: verifierActor }),
    executeAtomicRecovery({ matchId: 'match_demo_01', actor: verifierActor }),
  ]);

  const finalMatch = await findMatchById('match_demo_01');
  const finalLost = await findItemById(finalMatch!.lostItemId);
  const finalFound = await findItemById(finalMatch!.foundItemId);

  const oneSucceeded = c1.success || c2.success;
  const statesConsistent =
    finalMatch?.status === 'RECLAIMED' &&
    finalLost?.status === 'RECLAIMED' &&
    finalFound?.status === 'RECLAIMED';

  assert(
    oneSucceeded && statesConsistent,
    'Concurrent recovery requests do not produce inconsistent states (mutual exclusion enforced)',
    `c1 success: ${c1.success}, c2 success: ${c2.success}, all records RECLAIMED`
  );

  // -------------------------------------------------------------
  // Test 12: Notification delivery failure does not undo a committed recovery
  // -------------------------------------------------------------
  resetFallbackDataForTesting();
  await updateMatchStatus('match_demo_01', 'VERIFIED');

  const t12Res = await executeAtomicRecovery({
    matchId: 'match_demo_01',
    actor: verifierActor,
    simulatedNotificationFailure: true,
  });

  const committedMatch = await findMatchById('match_demo_01');
  const committedLost = await findItemById(committedMatch!.lostItemId);
  const committedFound = await findItemById(committedMatch!.foundItemId);
  const outboxRecords = await getAllOutboxNotifications();
  const failedOutbox = outboxRecords.filter(r => r.status === 'FAILED' || r.status === 'RETRYING');

  assert(
    t12Res.success === true &&
    committedMatch?.status === 'RECLAIMED' &&
    committedLost?.status === 'RECLAIMED' &&
    committedFound?.status === 'RECLAIMED' &&
    failedOutbox.length === 2,
    'Notification delivery failure does not undo a committed recovery (outbox resilience)',
    `Recovery state: committed RECLAIMED, Outbox status: ${failedOutbox[0]?.status} (${failedOutbox.length} pending)`
  );

  // -------------------------------------------------------------
  // Test 13: Retrying pending notifications does not create duplicates
  // -------------------------------------------------------------
  const retryResult = await retryFailedOutboxNotifications();
  const outboxAfterRetry = await getAllOutboxNotifications();
  const processedOutbox = outboxAfterRetry.filter(r => r.status === 'PROCESSED' || r.status === 'SENT');

  const ownerNotifications = await findNotificationsForUser('user_ananya_02');
  const reclaimNotifications = ownerNotifications.filter(n => n.title.includes('Reclaimed'));

  assert(
    retryResult.succeeded === 2 &&
    processedOutbox.length === 2 &&
    reclaimNotifications.length === 1,
    'Retrying pending outbox notifications delivers safely without duplicates',
    `Processed outbox: ${processedOutbox.length}/2, Owner notifications: ${reclaimNotifications.length} (no duplicate)`
  );

  console.log('====================================================');
  console.log(`RESULTS: ${passed}/${total} ATOMIC RECOVERY TESTS PASSED`);
  console.log('====================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runAtomicRecoveryTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
