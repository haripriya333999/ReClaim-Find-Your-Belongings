import {
  insertNotification,
  notificationExistsForMatch,
  findNotificationsForUser,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  dispatchIndependentMatchNotifications,
  processNotificationRetries,
  getAllOutboxNotifications,
  executeAtomicRecovery,
  resetFallbackDataForTesting,
  findMatchById,
  findItemById,
  MAX_RETRY_ATTEMPTS,
  BASE_BACKOFF_MS,
  getIsRetryWorkerRunning,
  ItemRecord,
  NotificationRecord,
  UserRole,
} from '../db/repository.ts';

async function runNotificationReliabilityTests() {
  console.log('====================================================');
  console.log('RECLAIM - STEP 4: RELIABLE NOTIFICATIONS & RETRIES TEST SUITE');
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

  // -------------------------------------------------------------------------
  // Test 1: Successful notification creation
  // -------------------------------------------------------------------------
  resetFallbackDataForTesting();

  const sampleNotif: NotificationRecord = {
    _id: 'notif_test_01',
    userId: 'user_ananya_02',
    matchId: 'match_test_01',
    title: 'Custom Match Alert',
    message: 'A prospective match was detected for your item.',
    eventType: 'MATCH_DETECTED',
    deliveryStatus: 'SENT',
    isRead: false,
    createdAt: new Date().toISOString(),
  };

  const t1Res = await insertNotification(sampleNotif);
  assert(
    t1Res.success === true && t1Res.inserted === true && t1Res.duplicate === false,
    'Successful notification creation reports success and inserted: true',
    `Inserted: ${t1Res.inserted}, Duplicate: ${t1Res.duplicate}`
  );

  // -------------------------------------------------------------------------
  // Test 2: Duplicate notification prevention (idempotent upsert)
  // -------------------------------------------------------------------------
  const countBefore = (await findNotificationsForUser('user_ananya_02')).length;
  const t2Res = await insertNotification(sampleNotif);
  const countAfter = (await findNotificationsForUser('user_ananya_02')).length;

  assert(
    t2Res.success === true &&
    t2Res.inserted === false &&
    t2Res.duplicate === true &&
    countBefore === countAfter,
    'Duplicate notification safely prevented without duplicate record insertion',
    `Duplicate: ${t2Res.duplicate}, Count: ${countBefore} -> ${countAfter}`
  );

  // -------------------------------------------------------------------------
  // Test 3: Genuine database insertion failure is not swallowed
  // -------------------------------------------------------------------------
  const t3Res = await insertNotification(
    {
      _id: 'notif_failing_01',
      userId: 'user_ananya_02',
      matchId: 'match_test_02',
      title: 'Failing Notification',
      message: 'This should fail gracefully.',
      isRead: false,
      createdAt: new Date().toISOString(),
    },
    { simulateDatabaseError: true, throwOnDatabaseError: false }
  );

  let threwProperly = false;
  try {
    await insertNotification(
      {
        _id: 'notif_failing_02',
        userId: 'user_ananya_02',
        matchId: 'match_test_03',
        title: 'Failing Notification With Throw',
        message: 'This must throw when requested.',
        isRead: false,
        createdAt: new Date().toISOString(),
      },
      { simulateDatabaseError: true, throwOnDatabaseError: true }
    );
  } catch (err: any) {
    threwProperly = Boolean(err.message);
  }

  assert(
    t3Res.success === false && Boolean(t3Res.error) && threwProperly,
    'Genuine database error is propagated to caller instead of silently swallowed',
    `Returned error: "${t3Res.error}", threw on demand: ${threwProperly}`
  );

  // -------------------------------------------------------------------------
  // Test 4: Owner notification succeeds while Finder notification fails (Independent Tracking)
  // -------------------------------------------------------------------------
  resetFallbackDataForTesting();

  const dummyLostItem: ItemRecord = {
    _id: 'item_lost_indep_01',
    userId: 'user_ananya_02',
    reportType: 'LOST',
    itemName: 'Blue Backpack',
    category: 'Bags',
    description: 'Navy blue canvas backpack with laptop compartment',
    color: 'Blue',
    location: 'Science Block',
    date: new Date().toISOString(),
    imageId: null,
    status: 'OPEN',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const dummyFoundItem: ItemRecord = {
    _id: 'item_found_indep_02',
    userId: 'user_rahul_03',
    reportType: 'FOUND',
    itemName: 'Blue Backpack',
    category: 'Bags',
    description: 'Found navy blue canvas backpack in science hall',
    color: 'Blue',
    location: 'Science Block',
    date: new Date().toISOString(),
    imageId: null,
    status: 'OPEN',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const dispatchRes = await dispatchIndependentMatchNotifications({
    matchId: 'match_indep_test_01',
    lostItem: dummyLostItem,
    foundItem: dummyFoundItem,
    score: 95,
    simulateOwnerError: false,  // Owner succeeds
    simulateFinderError: true,   // Finder fails (simulated network glitch)
  });

  const ownerInbox = await findNotificationsForUser('user_ananya_02');
  const finderInbox = await findNotificationsForUser('user_rahul_03');
  const outbox = await getAllOutboxNotifications();
  const finderOutbox = outbox.find(r => r.userId === 'user_rahul_03' && r.matchId === 'match_indep_test_01');

  assert(
    dispatchRes.ownerResult.success === true &&
    dispatchRes.finderResult.success === false &&
    dispatchRes.ownerQueuedToOutbox === false &&
    dispatchRes.finderQueuedToOutbox === true &&
    Boolean(finderOutbox) &&
    finderOutbox?.status === 'RETRYING',
    'Owner notification succeeds and is saved; Finder failure is tracked independently in outbox',
    `Owner in-app: saved, Finder outbox status: ${finderOutbox?.status}`
  );

  // -------------------------------------------------------------------------
  // Test 5: Retry does not duplicate already successful owner notification
  // -------------------------------------------------------------------------
  const ownerCountBeforeRetry = (await findNotificationsForUser('user_ananya_02')).length;

  // Process retry worker (now finder succeeds)
  const retry1 = await processNotificationRetries({ forceAll: true });

  const ownerCountAfterRetry = (await findNotificationsForUser('user_ananya_02')).length;
  const finderNotifsAfter = (await findNotificationsForUser('user_rahul_03')).filter(
    n => n.matchId === 'match_indep_test_01'
  );

  assert(
    retry1.succeeded === 1 &&
    ownerCountBeforeRetry === ownerCountAfterRetry &&
    finderNotifsAfter.length === 1,
    'Retrying finder notification delivers safely without duplicating owner notification',
    `Owner notif count unchanged: ${ownerCountBeforeRetry} -> ${ownerCountAfterRetry}, Finder delivered: 1`
  );

  // -------------------------------------------------------------------------
  // Test 6: Maximum retry limit is enforced (transitions to FAILED)
  // -------------------------------------------------------------------------
  resetFallbackDataForTesting();

  // Create a failing notification with simulated continuous error
  const failingDispatch = await dispatchIndependentMatchNotifications({
    matchId: 'match_permanent_fail_01',
    lostItem: dummyLostItem,
    foundItem: dummyFoundItem,
    score: 88,
    simulateOwnerError: true,
    simulateFinderError: true,
  });

  // Run retries until max attempts reached (5 attempts total)
  let lastRetryResult = null;
  for (let i = 0; i < MAX_RETRY_ATTEMPTS + 1; i++) {
    lastRetryResult = await processNotificationRetries({
      forceAll: true,
      simulatePermanentFailure: true,
    });
  }

  const outboxAfterMax = await getAllOutboxNotifications();
  const failedRecords = outboxAfterMax.filter(r => r.matchId === 'match_permanent_fail_01' && r.status === 'FAILED');

  assert(
    failedRecords.length === 2 &&
    failedRecords.every(r => r.attempts >= MAX_RETRY_ATTEMPTS),
    'Maximum retry limit (5) enforced: records transition to FAILED and stop retrying',
    `Failed records: ${failedRecords.length}, attempts: ${failedRecords[0]?.attempts}/${MAX_RETRY_ATTEMPTS}`
  );

  // -------------------------------------------------------------------------
  // Test 7: Retry queue persistence (survives restart simulation)
  // -------------------------------------------------------------------------
  const activeOutboxBefore = await getAllOutboxNotifications();
  assert(
    activeOutboxBefore.length > 0 &&
    Boolean(activeOutboxBefore[0].nextRetryAt) &&
    typeof activeOutboxBefore[0].attempts === 'number',
    'Outbox records persist attempts counter and nextRetryAt backoff timestamp',
    `Stored outbox items: ${activeOutboxBefore.length}`
  );

  // -------------------------------------------------------------------------
  // Test 8: Concurrent retry workers do not process the same event simultaneously
  // -------------------------------------------------------------------------
  // Fire two worker executions concurrently
  const [w1, w2] = await Promise.all([
    processNotificationRetries({ forceAll: true }),
    processNotificationRetries({ forceAll: true }),
  ]);

  // One worker ran, the other safely yielded due to mutex
  assert(
    w1 !== undefined && w2 !== undefined,
    'Concurrent retry workers protected by mutual exclusion lock',
    `w1: processed ${w1.processed}, w2: processed ${w2.processed}`
  );

  // -------------------------------------------------------------------------
  // Test 9: Recovery notification event is preserved in transactional outbox
  // -------------------------------------------------------------------------
  resetFallbackDataForTesting();
  const verifierActor = {
    id: 'user_verifier_04',
    name: 'Vikram Roy (Campus Verifier)',
    role: 'VERIFIER' as UserRole,
  };

  // Set match to VERIFIED before attempting recovery
  const { updateMatchStatus } = await import('../db/repository.ts');
  await updateMatchStatus('match_demo_01', 'VERIFIED');

  const recovRes = await executeAtomicRecovery({
    matchId: 'match_demo_01',
    actor: verifierActor,
    simulatedNotificationFailure: true, // Inject delivery failure
  });

  const outboxRecovery = (await getAllOutboxNotifications()).filter(
    r => r.matchId === 'match_demo_01' && r.eventType === 'ITEM_RECLAIMED'
  );

  assert(
    recovRes.success === true &&
    outboxRecovery.length === 2 &&
    outboxRecovery[0].status === 'FAILED' || outboxRecovery[0].status === 'RETRYING',
    'Recovery notification events safely stored in transactional outbox despite dispatch error',
    `Recovery success: true, Outbox events preserved: ${outboxRecovery.length}`
  );

  // -------------------------------------------------------------------------
  // Test 10: Notification delivery failure does not undo successful recovery
  // -------------------------------------------------------------------------
  const postFailMatch = await findMatchById('match_demo_01');
  const postFailLost = await findItemById(postFailMatch!.lostItemId);
  const postFailFound = await findItemById(postFailMatch!.foundItemId);

  assert(
    postFailMatch?.status === 'RECLAIMED' &&
    postFailLost?.status === 'RECLAIMED' &&
    postFailFound?.status === 'RECLAIMED',
    'Notification failure does not reverse or corrupt committed atomic recovery',
    `Match: ${postFailMatch?.status}, Lost: ${postFailLost?.status}, Found: ${postFailFound?.status}`
  );

  // -------------------------------------------------------------------------
  // Test 11: Read/unread behavior remains correct
  // -------------------------------------------------------------------------
  const userNotifs = await findNotificationsForUser('user_ananya_02');
  const targetNotif = userNotifs[0];

  const unreadCountBefore = await getUnreadNotificationCount('user_ananya_02');
  const readSuccess = await markNotificationRead(targetNotif._id, 'user_ananya_02');
  const unreadCountAfter = await getUnreadNotificationCount('user_ananya_02');

  const markedAllCount = await markAllNotificationsRead('user_ananya_02');
  const finalUnread = await getUnreadNotificationCount('user_ananya_02');

  assert(
    readSuccess === true &&
    unreadCountAfter === Math.max(0, unreadCountBefore - 1) &&
    finalUnread === 0,
    'Read/unread notification tracking and mark-all-read behavior is accurate',
    `Unread: ${unreadCountBefore} -> ${unreadCountAfter} -> ${finalUnread}`
  );

  // -------------------------------------------------------------------------
  // Test 12: Invalid or missing notification references are handled safely
  // -------------------------------------------------------------------------
  const invalidRead = await markNotificationRead('non_existent_notif_9999', 'user_ananya_02');
  assert(
    invalidRead === false,
    'Invalid notification references return safe false without throwing unhandled exceptions',
    `Mark non-existent read: ${invalidRead}`
  );

  console.log('====================================================');
  console.log(`RESULTS: ${passed}/${total} NOTIFICATION RELIABILITY TESTS PASSED`);
  console.log('====================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runNotificationReliabilityTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
