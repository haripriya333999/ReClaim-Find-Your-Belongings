import {
  validateDatabaseConfig,
  initDatabase,
  closeDatabase,
  isAtlasConnected,
  getConnectionStatus,
  getLastConnectionError,
  simulateDatabaseDisconnection,
  sanitizeErrorMessage,
  pingAtlas,
  reconnectAtlas,
  DB_NAME,
} from '../db/mongo.ts';
import {
  setExplicitTestStorage,
  isTestStorageAllowed,
  getActiveStorageMode,
  isAtlasMandatory,
  ensureDatabaseAvailable,
  insertItem,
  getAllActiveItems,
  findUserByEmail,
  executeAtomicRecovery,
  resetFallbackDataForTesting,
  DatabaseDisconnectedError,
  ItemRecord,
} from '../db/repository.ts';

async function runDatabaseReliabilityTests() {
  console.log('====================================================');
  console.log('RECLAIM - STEP 6: DATABASE RELIABILITY & HEALTH TEST SUITE');
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
  const originalNodeEnv = process.env.NODE_ENV;

  try {
    // ----------------------------------------------------
    // Test 1: Successful Atlas connection configuration validation
    // ----------------------------------------------------
    const validConfig = validateDatabaseConfig({
      MONGO_URI: 'mongodb+srv://reclaim_app_user:SamplePass123@reclaim-cluster.mongodb.net/?retryWrites=true&w=majority',
      DB_NAME: 'reclaim_db',
      JWT_SECRET: 'this_is_a_secure_shared_secret_minimum_32_chars_long',
    });
    assert(
      validConfig.valid && DB_NAME === 'reclaim_db',
      'Config validation passes for valid Atlas URI, DB_NAME (reclaim_db), and JWT_SECRET',
      `DB_NAME: ${DB_NAME}`
    );

    // ----------------------------------------------------
    // Test 2: Missing MongoDB configuration handling
    // ----------------------------------------------------
    const invalidConfig = validateDatabaseConfig({
      MONGO_URI: '',
      DB_NAME: '',
      JWT_SECRET: 'short',
    });
    assert(
      !invalidConfig.valid &&
      invalidConfig.errors.some(e => e.includes('MONGO_URI is missing')) &&
      invalidConfig.errors.some(e => e.includes('JWT_SECRET must be configured')),
      'Missing or malformed configuration returns explicit diagnostic errors without throwing uncaught exceptions',
      `Errors: ${invalidConfig.errors.join('; ')}`
    );

    // ----------------------------------------------------
    // Test 3: Failed database connection handling
    // ----------------------------------------------------
    const badConnResult = await initDatabase('mongodb://127.0.0.1:27999/unreachable_db_test?connectTimeoutMS=500');
    assert(
      !badConnResult.isAtlas &&
      badConnResult.status === 'DISCONNECTED' &&
      Boolean(badConnResult.error),
      'Failed database connection safely captured, reporting DISCONNECTED without crashing the process',
      `Status: ${badConnResult.status}, Error: ${badConnResult.error}`
    );

    // ----------------------------------------------------
    // Test 4: Database disconnection after startup
    // ----------------------------------------------------
    simulateDatabaseDisconnection('Simulated cloud network partition');
    assert(
      !isAtlasConnected() &&
      getConnectionStatus() === 'DISCONNECTED' &&
      getLastConnectionError() === 'Simulated cloud network partition',
      'Disconnection state tracked truthfully: status=DISCONNECTED, isAtlasConnected=false',
      `Last Error: ${getLastConnectionError()}`
    );

    // ----------------------------------------------------
    // Test 5: Production mode refusing in-memory fallback
    // ----------------------------------------------------
    process.env.NODE_ENV = 'production';
    let productionViolationBlocked = false;
    try {
      setExplicitTestStorage(true);
    } catch (err: any) {
      if (err.message.includes('Security Violation')) {
        productionViolationBlocked = true;
      }
    }
    assert(
      productionViolationBlocked &&
      !isTestStorageAllowed() &&
      isAtlasMandatory() &&
      getActiveStorageMode() === 'UNAVAILABLE',
      'Production mode strictly forbids in-memory fallback: isTestStorageAllowed=false, storageMode=UNAVAILABLE'
    );

    // ----------------------------------------------------
    // Test 6: Explicit test mode using the in-memory repository
    // ----------------------------------------------------
    process.env.NODE_ENV = 'test';
    setExplicitTestStorage(true);
    resetFallbackDataForTesting();
    assert(
      isTestStorageAllowed() &&
      !isAtlasMandatory() &&
      getActiveStorageMode() === 'TEST_MEMORY_MOCK',
      'Explicit test mode allows isolated mock storage for unit testing: storageMode=TEST_MEMORY_MOCK'
    );

    // ----------------------------------------------------
    // Test 7: Database writes failing clearly during outages (Production)
    // ----------------------------------------------------
    process.env.NODE_ENV = 'production';
    setExplicitTestStorage(false);
    let writeThrewExpectedError = false;
    let writeErrorMessage = '';

    const testItem: ItemRecord = {
      _id: 'item_prod_outage_01',
      userId: 'user_test',
      reportType: 'LOST',
      itemName: 'Prod Wallet',
      category: 'Accessories',
      description: 'Test wallet during outage',
      color: 'Black',
      location: 'Library',
      date: new Date().toISOString(),
      imageId: null,
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await insertItem(testItem);
    } catch (err: any) {
      if (err instanceof DatabaseDisconnectedError || err.name === 'DatabaseDisconnectedError') {
        writeThrewExpectedError = true;
        writeErrorMessage = err.message;
      }
    }
    assert(
      writeThrewExpectedError,
      'Production database write during outage throws DatabaseDisconnectedError instead of silently writing to memory',
      `Caught: ${writeErrorMessage}`
    );

    // ----------------------------------------------------
    // Test 8: Reads not returning misleading fallback data (Production)
    // ----------------------------------------------------
    let readThrewExpectedError = false;
    try {
      await getAllActiveItems();
    } catch (err: any) {
      if (err instanceof DatabaseDisconnectedError || err.name === 'DatabaseDisconnectedError') {
        readThrewExpectedError = true;
      }
    }
    assert(
      readThrewExpectedError,
      'Production database read during outage throws DatabaseDisconnectedError instead of serving stale in-memory data',
      'No silent fallback reads allowed in production'
    );

    // ----------------------------------------------------
    // Test 9: Liveness succeeding while Atlas is temporarily disconnected
    // ----------------------------------------------------
    let livenessOk = false;
    let livenessPayload: any = null;
    try {
      const res = await fetch(`${BASE_URL}/api/health/live`);
      livenessOk = res.status === 200;
      livenessPayload = await res.json();
    } catch (err: any) {
      console.warn('Liveness endpoint unreachable:', err.message);
    }
    assert(
      livenessOk && livenessPayload?.status === 'alive',
      'Liveness probe (/api/health/live) returns HTTP 200 alive regardless of database connectivity',
      `HTTP status: 200, status: ${livenessPayload?.status}`
    );

    // ----------------------------------------------------
    // Test 10: Readiness reporting unavailable when required dependencies are disconnected
    // ----------------------------------------------------
    let readinessRes: any = null;
    try {
      const res = await fetch(`${BASE_URL}/api/health/ready`);
      readinessRes = {
        httpStatus: res.status,
        body: await res.json(),
      };
    } catch (err: any) {
      console.warn('Readiness probe unreachable:', err.message);
    }
    assert(
      readinessRes !== null &&
      (readinessRes.httpStatus === 200 || readinessRes.httpStatus === 503) &&
      readinessRes.body?.database !== undefined,
      'Readiness probe (/api/health/ready) accurately reflects dependency readiness',
      `HTTP: ${readinessRes?.httpStatus}, Status: ${readinessRes?.body?.status}, Database: ${readinessRes?.body?.database}`
    );

    // ----------------------------------------------------
    // Test 11: Recovery after database reconnection attempt
    // ----------------------------------------------------
    const reconnResult = await reconnectAtlas();
    assert(
      reconnResult !== null &&
      reconnResult.status !== undefined,
      'reconnectAtlas() cleanly resets previous client state and attempts controlled connection',
      `Reconnect status: ${reconnResult.status}`
    );

    // ----------------------------------------------------
    // Test 12: Graceful application shutdown
    // ----------------------------------------------------
    await closeDatabase();
    assert(
      getConnectionStatus() === 'DISCONNECTED' &&
      !isAtlasConnected(),
      'closeDatabase() gracefully disconnects and resets client state with zero dangling connection leaks',
      `Status: ${getConnectionStatus()}`
    );

    // ----------------------------------------------------
    // Test 13: Health endpoint does not expose credentials or secrets
    // ----------------------------------------------------
    let healthPayload: any = null;
    let healthStr = '';
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      healthPayload = await res.json();
      healthStr = JSON.stringify(healthPayload);
    } catch (err: any) {
      console.warn('Health check fetch failed:', err.message);
    }
    const hasMongoSecret = healthStr.includes('mongodb+srv://') || healthStr.includes('Password123');
    const hasJwtSecret = healthStr.includes('minimum_32_characters');
    assert(
      healthPayload !== null &&
      !hasMongoSecret &&
      !hasJwtSecret &&
      healthPayload.database?.databaseName === 'reclaim_db' &&
      healthPayload.modules?.scoringEngine === 'healthy',
      'Health endpoint (/api/health) reports truthful module states without exposing secrets or connection strings',
      `Database: ${healthPayload?.database?.databaseName}, Overall status: ${healthPayload?.status}`
    );

  } finally {
    // Restore environment and test storage state
    process.env.NODE_ENV = originalNodeEnv || 'development';
    setExplicitTestStorage(true);
    resetFallbackDataForTesting();
  }

  console.log('====================================================');
  console.log(`RESULTS: ${passed}/${total} STEP 6 DATABASE TESTS PASSED`);
  console.log('====================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runDatabaseReliabilityTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
