#!/usr/bin/env node
/**
 * TypeScript Startup Orchestrator
 *
 * Type-safe service startup using @aiponge/platform-core
 * Replaces hardcoded bash scripts with dynamic configuration
 */

import { SERVICES, type ServiceConfig } from '../packages/platform-core/src/config/services-definition.js';
import { spawn, ChildProcess } from 'child_process';
import http from 'http';

interface StartupProfile {
  name: string;
  description: string;
  services: string[];
}

interface ServiceProcess {
  config: ServiceConfig;
  process: ChildProcess;
  pid: number;
}

class StartupOrchestrator {
  private runningServices: Map<string, ServiceProcess> = new Map();
  // Health checks accounting for turbo overhead (cache checking, config parsing)
  private readonly maxHealthCheckAttempts = process.env.NODE_ENV === 'production' ? 30 : 20;
  private readonly healthCheckInterval = process.env.NODE_ENV === 'production' ? 2000 : 1000; // 1s dev, 2s prod

  /**
   * Start Redis server if not already running
   */
  private async startRedis(): Promise<void> {
    console.log('🔧 Starting Redis server...');

    return new Promise((resolve, reject) => {
      // Check if Redis is already running
      const checkRedis = spawn('redis-cli', ['ping'], {
        stdio: 'pipe',
      });

      checkRedis.on('close', code => {
        if (code === 0) {
          console.log('✅ Redis is already running');
          resolve();
        } else {
          // Redis not running, start it
          const redisProcess = spawn('redis-server', ['--daemonize', 'yes', '--port', '6379', '--dir', '/tmp'], {
            stdio: 'inherit',
          });

          redisProcess.on('close', code => {
            if (code === 0) {
              console.log('✅ Redis server started successfully');
              // Wait a moment for Redis to be ready
              setTimeout(resolve, 1000);
            } else {
              reject(new Error('Failed to start Redis server'));
            }
          });

          redisProcess.on('error', err => {
            reject(err);
          });
        }
      });

      checkRedis.on('error', () => {
        // redis-cli not found, try to start anyway
        const redisProcess = spawn('redis-server', ['--daemonize', 'yes', '--port', '6379', '--dir', '/tmp'], {
          stdio: 'inherit',
        });

        redisProcess.on('close', code => {
          if (code === 0) {
            console.log('✅ Redis server started successfully');
            setTimeout(resolve, 1000);
          } else {
            console.warn('⚠️  Redis failed to start, continuing without it');
            resolve(); // Don't fail if Redis can't start
          }
        });
      });
    });
  }

  /**
   * Check if a service is healthy via HTTP health endpoint
   */
  private async checkHealth(config: ServiceConfig): Promise<boolean> {
    return new Promise(resolve => {
      const port = config.port.development || config.port.internal;
      const options = {
        hostname: 'localhost',
        port: port,
        path: '/health',
        method: 'GET',
        timeout: 1000,
      };

      const req = http.request(options, res => {
        resolve(res.statusCode === 200);
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  }

  /**
   * Wait for service to become healthy
   */
  private async waitForHealthy(config: ServiceConfig): Promise<boolean> {
    const port = config.port.development || config.port.internal;
    console.log(`📋 Checking ${config.name} health on port ${port}...`);

    // Initial delay accounting for turbo cache/config overhead (dev: 2s, prod: 1s)
    const initialDelay = process.env.NODE_ENV === 'production' ? 1000 : 2000;
    await new Promise(resolve => setTimeout(resolve, initialDelay));

    for (let attempt = 1; attempt <= this.maxHealthCheckAttempts; attempt++) {
      const isHealthy = await this.checkHealth(config);

      if (isHealthy) {
        console.log(`✅ ${config.name} is healthy!`);
        return true;
      }

      console.log(`⏳ Attempt ${attempt}/${this.maxHealthCheckAttempts}: ${config.name} not ready yet...`);
      await new Promise(resolve => setTimeout(resolve, this.healthCheckInterval));
    }

    console.error(`❌ ${config.name} failed to start within timeout`);
    return false;
  }

  /**
   * Start a single service
   */
  private async startService(config: ServiceConfig): Promise<boolean> {
    console.log(`🔧 Starting ${config.name}...`);

    const filterName = config.name === 'api-gateway' ? '@aiponge/api-gateway' : `@aiponge/${config.name}`;

    const child = spawn('npx', ['turbo', 'dev', `--filter=${filterName}`], {
      cwd: process.cwd(),
      stdio: 'inherit',
      detached: false,
    });

    if (!child.pid) {
      console.error(`❌ Failed to start ${config.name}`);
      return false;
    }

    this.runningServices.set(config.name, {
      config,
      process: child,
      pid: child.pid,
    });

    // Wait for process to compile and initialize (longer for first service)
    const initDelay = this.runningServices.size === 1 ? 8000 : 5000; // 8s for first service, 5s for others
    await new Promise(resolve => setTimeout(resolve, initDelay));

    // For backend services with health endpoints, wait for health check
    if (config.type === 'backend-service' || config.type === 'infrastructure') {
      return await this.waitForHealthy(config);
    }

    return true;
  }

  /**
   * Get service config by name
   */
  private getServiceConfig(name: string): ServiceConfig | undefined {
    return SERVICES.find(s => s.name === name);
  }

  /**
   * Start multiple services in parallel
   * Fails fast if any service config is missing
   */
  private async startServicesParallel(serviceNames: string[]): Promise<boolean[]> {
    const configs: ServiceConfig[] = [];

    // Validate all configs exist first (fail-fast)
    for (const name of serviceNames) {
      const config = this.getServiceConfig(name);
      if (!config) {
        console.error(`❌ Service not found in config: ${name}`);
        throw new Error(`Missing service configuration: ${name}`);
      }
      configs.push(config);
    }

    // Start all services in parallel
    const results = await Promise.all(configs.map(config => this.startService(config)));

    return results;
  }

  /**
   * Start services in sequence (original method)
   */
  async startProfile(profile: StartupProfile): Promise<void> {
    console.log(`🚀 Starting ${profile.name}...`);
    console.log(`📝 ${profile.description}\n`);

    // Start Redis before any services
    await this.startRedis();
    console.log(''); // Empty line for readability

    for (const serviceName of profile.services) {
      const config = this.getServiceConfig(serviceName);

      if (!config) {
        console.error(`❌ Service not found in config: ${serviceName}`);
        process.exit(1);
      }

      const success = await this.startService(config);

      if (!success && (config.type === 'backend-service' || config.type === 'infrastructure')) {
        console.error(`❌ Critical service ${serviceName} failed to start. Exiting.`);
        this.cleanup();
        process.exit(1);
      }

      console.log(''); // Empty line for readability
    }

    console.log('✅ Startup complete!\n');
    this.printStatus();
  }

  /**
   * Start member-minimal with optimized split workflow
   * Backend services start first, Metro builds in parallel for better perceived performance
   */
  async startMemberMinimalParallel(): Promise<void> {
    console.log('🚀 Starting Member (Minimal) - Split Dev Workflow (Optimized)...');
    console.log('📝 Backend services ready in ~15s, Metro builds in parallel ⚡\n');

    // TIER 1: Foundation (Sequential)
    console.log('🔧 Tier 1: Starting foundation services...');
    await this.startRedis();

    const systemConfig = this.getServiceConfig('system-service');
    if (!systemConfig) {
      console.error('❌ system-service not found in config');
      process.exit(1);
    }
    const systemSuccess = await this.startService(systemConfig);
    if (!systemSuccess) {
      console.error('❌ Critical service system-service failed to start. Exiting.');
      this.cleanup();
      process.exit(1);
    }
    console.log('✅ Foundation ready\n');

    // TIER 2: Gateway + Critical Services (Parallel)
    console.log('🔧 Tier 2: Starting gateway + critical services in parallel...');
    const tier2Results = await this.startServicesParallel(['api-gateway', 'music-service', 'user-service']);

    if (tier2Results.some(result => !result)) {
      console.error('❌ Critical Tier 2 services failed to start. Exiting.');
      this.cleanup();
      process.exit(1);
    }
    console.log('✅ Critical services ready\n');

    // TIER 3: Supporting Backend Services (Parallel, Wait for these)
    console.log('🔧 Tier 3: Starting supporting backend services in parallel...');
    const tier3BackendServices = ['storage-service', 'ai-config-service', 'ai-content-service', 'ai-analytics-service'];

    const tier3Results = await this.startServicesParallel(tier3BackendServices);

    if (tier3Results.some(result => !result)) {
      console.warn('⚠️  Warning: Some supporting services failed to start, but continuing...');
    }
    console.log('✅ Backend services ready!\n');

    // AIPONGE APP: Start async (non-blocking) so Metro builds in parallel
    const aipongeStartTime = Date.now();
    console.log('🎨 Starting Aiponge App (Metro bundler)...');
    console.log(`   Started at: ${new Date(aipongeStartTime).toLocaleTimeString()}`);
    console.log('   Metro will build in the background while backend is ready ⚡\n');

    const aipongeConfig = this.getServiceConfig('aiponge');
    if (aipongeConfig) {
      // Start aiponge app without waiting (fire and forget)
      this.startAipongeAppAsync(aipongeConfig, aipongeStartTime);
    } else {
      console.warn('⚠️  Aiponge app config not found, skipping...');
    }

    console.log('═'.repeat(60));
    console.log('✅ BACKEND READY! (API Gateway, all services running)');
    console.log('═'.repeat(60));
    console.log('');
    console.log('📊 Backend Services:');
    this.printBackendStatus();
    console.log('');
    console.log('🎨 Frontend Status:');
    console.log('   Aiponge App: Building... (Metro bundler compiling in background)');
    console.log('   Expected: 5-8s with cache, 15s cold start');
    console.log('   URL: http://localhost:3020 (opens when ready)');
    console.log('');
    console.log('💡 Backend is ready to serve API requests!');
    console.log('   Metro is building in parallel for better DX ⚡');
    console.log('');
  }

  /**
   * Start Aiponge app asynchronously (non-blocking)
   */
  private startAipongeAppAsync(config: ServiceConfig, startTime: number): void {
    const filterName = `@aiponge/${config.name}`;

    console.log(`🎨 Spawning: npx turbo dev --filter=${filterName}`);

    const child = spawn('npx', ['turbo', 'dev', `--filter=${filterName}`], {
      cwd: process.cwd(),
      stdio: 'inherit',
      detached: false,
      shell: true,
    });

    if (child.pid) {
      this.runningServices.set(config.name, {
        config,
        process: child,
        pid: child.pid,
      });

      console.log(`⚡ Aiponge App process started (PID: ${child.pid})`);

      // Add listener for Metro completion (best effort timing)
      child.on('spawn', () => {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`⚡ Aiponge App spawned in ${duration}s (Metro compiling in background)`);
      });

      child.on('error', err => {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(`❌ Aiponge App failed to start after ${duration}s:`, err.message);
      });

      child.on('exit', (code, signal) => {
        console.error(`❌ Aiponge App exited unexpectedly (code: ${code}, signal: ${signal})`);
      });
    } else {
      console.error(`❌ Failed to spawn Aiponge app process`);
    }

    // Don't wait for health checks or initialization delays
    // Metro will compile in background while backend serves requests
  }

  /**
   * Print backend service status only (exclude frontend apps)
   */
  private printBackendStatus(): void {
    for (const [name, { config, pid }] of this.runningServices) {
      // Skip frontend apps
      if (config.type === 'frontend-app') continue;

      const port = config.port.development || config.port.internal;
      const url = `http://localhost:${port}`;
      console.log(`   ✅ ${config.name}: ${url} (PID: ${pid})`);
    }
  }

  /**
   * Print status of running services
   */
  private printStatus(): void {
    console.log('📊 Service Status:');

    for (const [name, { config, pid }] of this.runningServices) {
      const port = config.port.development || config.port.internal;
      const url = `http://localhost:${port}`;
      console.log(`- ${config.name}: ${url} (PID: ${pid})`);
    }

    console.log('\n💡 Services running in development mode');
  }

  /**
   * Cleanup on exit
   */
  private cleanup(): void {
    console.log('\n🛑 Stopping services...');

    for (const [name, { process }] of this.runningServices) {
      console.log(`- Stopping ${name}`);
      process.kill();
    }
  }

  /**
   * Setup signal handlers
   */
  setupSignalHandlers(): void {
    process.on('SIGINT', () => {
      this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.cleanup();
      process.exit(0);
    });
  }
}

// Startup profiles
const PROFILES: Record<string, StartupProfile> = {
  'member-minimal': {
    name: 'Member (Minimal)',
    description: 'Member app with minimal required services (~20-25s parallel startup)',
    services: [
      'system-service', // Required for API Gateway service discovery
      'api-gateway',
      'user-service',
      'storage-service',
      'music-service',
      'ai-content-service',
      'ai-analytics-service',
    ],
  },
  'backend-only': {
    name: 'Backend Services Only',
    description: 'Backend services without any UI (for use with standalone Expo app)',
    services: [
      'system-service',
      'api-gateway',
      'user-service',
      'storage-service',
      'music-service',
      'ai-config-service',
      'ai-content-service',
      'ai-analytics-service',
    ],
  },
  'full-stack': {
    name: 'Full Stack',
    description: 'All backend services with member app (~60s startup)',
    services: [
      'system-service',
      'storage-service',
      'user-service',
      'ai-config-service',
      'ai-content-service',
      'ai-analytics-service',
      'music-service',
      'api-gateway',
    ],
  },
};

// Main execution
async function main() {
  const profileName = process.argv[2] || 'member-minimal';
  const orchestrator = new StartupOrchestrator();
  orchestrator.setupSignalHandlers();

  // Use parallel startup for member-minimal, sequential for others
  if (profileName === 'member-minimal') {
    await orchestrator.startMemberMinimalParallel();
  } else {
    const profile = PROFILES[profileName];

    if (!profile) {
      console.error(`❌ Unknown profile: ${profileName}`);
      console.log('\nAvailable profiles:');
      Object.keys(PROFILES).forEach(key => {
        console.log(`  - ${key}: ${PROFILES[key].description}`);
      });
      process.exit(1);
    }

    await orchestrator.startProfile(profile);
  }

  // Keep process running
  await new Promise(() => {});
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
