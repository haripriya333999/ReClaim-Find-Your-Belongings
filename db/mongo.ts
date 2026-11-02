import { MongoClient, Db } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

// Shared database configuration (zero hardcoded secrets)
export const MONGO_URI = process.env.MONGO_URI?.trim() || '';
export const DB_NAME = process.env.DB_NAME?.trim() || 'reclaim_db';
export const JWT_SECRET = process.env.JWT_SECRET?.trim() || '';
export const NODE_ENV = process.env.NODE_ENV || 'development';

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTING';

export interface InitDbResult {
  isAtlas: boolean;
  dbName: string;
  status: ConnectionStatus;
  error?: string;
}

// Config validation helper for startup and health checks
export function validateDatabaseConfig(env: Record<string, string | undefined> = process.env): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const uri = env.MONGO_URI?.trim();
  const dbName = env.DB_NAME?.trim() || 'reclaim_db';
  const jwt = env.JWT_SECRET?.trim();

  if (!uri) {
    errors.push('MONGO_URI is missing in environment.');
  } else if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    errors.push('MONGO_URI must begin with mongodb:// or mongodb+srv://');
  }

  if (!dbName) {
    errors.push('DB_NAME must not be empty.');
  }

  if (!jwt || jwt.length < 32) {
    errors.push('JWT_SECRET must be configured with at least 32 characters.');
  }

  return { valid: errors.length === 0, errors };
}

// Internal connection state tracking
let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let connectionStatus: ConnectionStatus = 'DISCONNECTED';
let lastConnectionError: string | null = null;
let lastConnectedAt: Date | null = null;
let lastDisconnectedAt: Date | null = null;
let connectingPromise: Promise<InitDbResult> | null = null;

/**
 * Sanitizes error messages by scrubbing potential credentials, URIs, and raw OpenSSL dumps
 */
export function sanitizeErrorMessage(errMessage: string): string {
  if (!errMessage) return 'Unknown database error';
  let cleaned = String(errMessage)
    .replace(/mongodb(\+srv)?:\/\/[^@]+@/gi, 'mongodb+srv://<credentials-hidden>@')
    .replace(/password=[^&]+/gi, 'password=***');

  // Detect MongoDB Atlas TLS alert 80 / IP access list restriction
  if (
    cleaned.includes('SSL alert number 80') ||
    cleaned.includes('tlsv1 alert internal error') ||
    cleaned.includes('Cluster network access restricted') ||
    cleaned.includes('IP Access List authorization required')
  ) {
    return 'Cluster network access restricted (IP Access List authorization required on Atlas Network Access)';
  }

  // Strip OpenSSL hex thread identifiers and file locations
  cleaned = cleaned
    .replace(/[0-9A-Fa-f]{8,}:error:[^:]+:[^:]+:[^:]+:[^:]+/gi, 'SSL handshake alert')
    .replace(/[0-9A-Fa-f]{8,}:error:[^:]+:[^:]+:[^:]+/gi, 'SSL handshake alert')
    .replace(/\.\.\/deps\/openssl\/[^:]+:\d+:/gi, '');

  return cleaned.trim();
}

/**
 * Connects to MongoDB Atlas and initializes indexes.
 * Prevents concurrent duplicate connections and validates connectivity before reporting ready.
 */
export async function initDatabase(customUri?: string): Promise<InitDbResult> {
  const targetUri = customUri || MONGO_URI;

  // 1. Prevent duplicate concurrent connection attempts
  if (connectingPromise) {
    return connectingPromise;
  }

  // 2. Validate configuration
  const validation = validateDatabaseConfig({
    MONGO_URI: targetUri,
    DB_NAME,
    JWT_SECRET,
  });

  if (!validation.valid) {
    connectionStatus = 'DISCONNECTED';
    lastConnectionError = validation.errors.join('; ');
    return {
      isAtlas: false,
      dbName: DB_NAME,
      status: 'DISCONNECTED',
      error: lastConnectionError,
    };
  }

  connectingPromise = (async () => {
    connectionStatus = 'CONNECTING';
    try {
      console.log(`[ReClaim Database] Connecting to authoritative MongoDB Atlas database "${DB_NAME}"...`);

      mongoClient = new MongoClient(targetUri, {
        serverSelectionTimeoutMS: 3000,
        connectTimeoutMS: 3000,
      });

      await mongoClient.connect();
      mongoDb = mongoClient.db(DB_NAME);

      // Verify connection with real ping command
      await mongoDb.command({ ping: 1 });

      connectionStatus = 'CONNECTED';
      lastConnectedAt = new Date();
      lastConnectionError = null;

      console.log(`[ReClaim Database] SUCCESS: Connected and verified with MongoDB Atlas ("${DB_NAME}").`);

      // Initialize persistent collection indexes
      await mongoDb.collection('users').createIndex({ email: 1 }, { unique: true }).catch(() => {});
      await mongoDb.collection('items').createIndex({ reportType: 1, status: 1, createdAt: -1 }).catch(() => {});
      await mongoDb.collection('matches').createIndex({ lostItemId: 1, foundItemId: 1 }, { unique: true }).catch(() => {});
      await mongoDb.collection('notifications').createIndex({ userId: 1, matchId: 1, title: 1 }, { unique: true }).catch(() => {});
      await mongoDb.collection('notifications').createIndex({ userId: 1, matchId: 1, eventType: 1 }, { sparse: true }).catch(() => {});
      await mongoDb.collection('notifications').createIndex({ userId: 1, createdAt: -1 }).catch(() => {});
      await mongoDb.collection('notification_outbox').createIndex({ status: 1, nextRetryAt: 1 }).catch(() => {});
      await mongoDb.collection('notification_outbox').createIndex({ userId: 1, matchId: 1, eventType: 1 }, { sparse: true }).catch(() => {});

      return {
        isAtlas: true,
        dbName: DB_NAME,
        status: 'CONNECTED',
      };
    } catch (err: any) {
      connectionStatus = 'DISCONNECTED';
      lastDisconnectedAt = new Date();
      lastConnectionError = sanitizeErrorMessage(err?.message || 'Atlas connection failed');

      if (mongoClient) {
        await mongoClient.close().catch(() => {});
      }
      mongoClient = null;
      mongoDb = null;

      const isMockAllowed = process.env.NODE_ENV !== 'production';
      console.log(`[ReClaim Database] Notice: MongoDB Atlas cluster is offline or network restricted (${lastConnectionError}). Active storage mode: ${isMockAllowed ? 'TEST_MEMORY_MOCK (Development/Testing)' : 'Blocked (Production)'}.`);
      return {
        isAtlas: false,
        dbName: DB_NAME,
        status: 'DISCONNECTED',
        error: lastConnectionError,
      };
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

/**
 * Executes a live ping command against MongoDB Atlas to verify responsiveness
 */
export async function pingAtlas(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  if (!mongoDb || connectionStatus !== 'CONNECTED') {
    return { ok: false, error: lastConnectionError || 'MongoDB client not connected' };
  }
  try {
    const start = Date.now();
    await mongoDb.command({ ping: 1 });
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err: any) {
    connectionStatus = 'DISCONNECTED';
    lastDisconnectedAt = new Date();
    lastConnectionError = sanitizeErrorMessage(err?.message || 'Atlas ping failed');
    return { ok: false, error: lastConnectionError };
  }
}

/**
 * Attempts controlled reconnection to MongoDB Atlas
 */
export async function reconnectAtlas(): Promise<{ success: boolean; status: ConnectionStatus; error?: string }> {
  await closeDatabase();
  const result = await initDatabase();
  return {
    success: result.isAtlas,
    status: result.status,
    error: result.error,
  };
}

/**
 * Gracefully closes the MongoDB Atlas client and resets internal state
 */
export async function closeDatabase(): Promise<void> {
  connectionStatus = 'DISCONNECTING';
  if (mongoClient) {
    try {
      await mongoClient.close();
    } catch {
      // Ignored during shutdown
    }
  }
  mongoClient = null;
  mongoDb = null;
  connectionStatus = 'DISCONNECTED';
  lastDisconnectedAt = new Date();
}

/**
 * Forces a disconnection state (used in outage testing and simulation)
 */
export function simulateDatabaseDisconnection(reason = 'Simulated connection outage'): void {
  connectionStatus = 'DISCONNECTED';
  lastConnectionError = reason;
  lastDisconnectedAt = new Date();
  mongoDb = null;
}

// Diagnostic Getters
export function getConnectionStatus(): ConnectionStatus {
  return connectionStatus;
}

export function isAtlasConnected(): boolean {
  return connectionStatus === 'CONNECTED' && mongoDb !== null;
}

export function getLastConnectionError(): string | null {
  return lastConnectionError;
}

export function getDatabaseName(): string {
  return DB_NAME;
}

export function getDb(): Db | null {
  return mongoDb;
}

export function getMongoClient(): MongoClient | null {
  return mongoClient;
}

export function getLastConnectedAt(): Date | null {
  return lastConnectedAt;
}

export function getLastDisconnectedAt(): Date | null {
  return lastDisconnectedAt;
}

/**
 * Inspects cluster topology to check if transactions are supported
 */
export async function checkTransactionSupport(): Promise<{ supported: boolean; reason: string }> {
  if (!mongoClient || !mongoDb) {
    return {
      supported: false,
      reason: 'MongoDB Atlas client is not currently connected.',
    };
  }

  try {
    const isMaster = await mongoDb.command({ isMaster: 1 }).catch(() => mongoDb!.command({ hello: 1 }));
    const hasReplicaSet = Boolean(isMaster.setName || isMaster.hosts);
    const isMongos = isMaster.msg === 'isdbgrid';

    if (hasReplicaSet || isMongos) {
      return {
        supported: true,
        reason: `Supported on ${isMongos ? 'Sharded Cluster' : `Replica Set: ${isMaster.setName || 'atlas-cluster'}`}`,
      };
    }

    return {
      supported: false,
      reason: 'Deployment is a standalone mongod instance without replica set replication.',
    };
  } catch (err: any) {
    return {
      supported: false,
      reason: `Failed to inspect cluster topology: ${sanitizeErrorMessage(err?.message || 'unknown error')}`,
    };
  }
}

/**
 * Executes an operation inside a MongoDB transaction with safe session cleanup
 */
export async function withMongoTransaction<T>(
  operation: (session: any) => Promise<T>
): Promise<T> {
  if (!mongoClient) {
    throw new Error('MongoDB client is not connected');
  }

  const session = mongoClient.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result!;
  } finally {
    await session.endSession().catch(() => {});
  }
}
