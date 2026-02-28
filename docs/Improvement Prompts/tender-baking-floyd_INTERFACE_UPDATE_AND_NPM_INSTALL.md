# Two Remaining Fixes: Update Interface + Install Dependencies

## What Was Done Correctly (no changes needed)

- DebugStatusController.ts: `as any` casts removed, clean calls to `client.isRedisEnabled()` and `client.getMetrics()`, `sendErrorResponse` used for error response — ALL CORRECT
- kafka-event-bus-client.ts: `isRedisEnabled()` and `getMetrics()` stubs added — CORRECT
- package.json: `@aiponge/http-client` removed (nothing imports it) — CORRECT
- debug-status.test.ts: unchanged, still correct
- app.ts: unchanged, still correct

## What Is Still Wrong

### Problem 1: The interface was not updated

The `IStandardizedEventBusClient` interface in `event-bus-client.ts` still does NOT include
`isRedisEnabled()` or `getMetrics()`. The Kafka stubs were added but the interface itself
was not changed. This means TypeScript will error because `getSharedEventBusClient()` returns
`IStandardizedEventBusClient` which does not declare these methods.

### Problem 2: npm install was not run

The `node_modules/` directory does not exist. No dependencies are installed.

## Fix 1: Update the interface

**File:** `packages/platform-core/src/orchestration/event-bus-client.ts`

Find the interface at approximately line 40:

```typescript
export interface IStandardizedEventBusClient {
  publish(event: StandardEvent): Promise<void>;
  subscribe(eventType: string, callback: EventSubscriptionCallback): Promise<void>;
  unsubscribe(eventType: string, callback?: EventSubscriptionCallback): Promise<void>;
  disconnect(): Promise<void>;
  shutdown(): Promise<void>;
  getConnectionStatus(): boolean;
}
```

Replace it with:

```typescript
export interface IStandardizedEventBusClient {
  publish(event: StandardEvent): Promise<void>;
  subscribe(eventType: string, callback: EventSubscriptionCallback): Promise<void>;
  unsubscribe(eventType: string, callback?: EventSubscriptionCallback): Promise<void>;
  disconnect(): Promise<void>;
  shutdown(): Promise<void>;
  getConnectionStatus(): boolean;
  isRedisEnabled(): boolean;
  getMetrics(): EventBusMetrics | null;
}
```

The `EventBusMetrics` type is already available in this file (it is imported/defined earlier).
If `EventBusMetrics` is not imported, check the metrics imports at the top of the file and add it.

## Fix 2: Install dependencies

```bash
cd /Users/mameziane/Downloads/aiponge && npm install
```

## Verify

```bash
cd /Users/mameziane/Downloads/aiponge
test -f node_modules/.package-lock.json && echo "INSTALL OK" || echo "INSTALL FAILED"
npx vitest run packages/services/api-gateway/src/__tests__/debug-status.test.ts
node packages/services/api-gateway/esbuild.config.mjs
```

## Rules

- Only modify ONE file: `packages/platform-core/src/orchestration/event-bus-client.ts`
- Only change: add two lines to the `IStandardizedEventBusClient` interface
- Do NOT modify any other file
- Run `npm install` after the edit
- Run verification after install
