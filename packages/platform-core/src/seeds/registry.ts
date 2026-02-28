import type { SeedModule } from './types.js';

const seedModules: Map<string, SeedModule> = new Map();

export function registerSeed(module: SeedModule): void {
  if (seedModules.has(module.name)) {
    throw new Error(`Seed module "${module.name}" is already registered`);
  }
  seedModules.set(module.name, module);
}

export function getSeedModules(): SeedModule[] {
  return Array.from(seedModules.values());
}

export function getSeedModule(name: string): SeedModule | undefined {
  return seedModules.get(name);
}

export function getOrderedSeeds(): SeedModule[] {
  const modules = getSeedModules();
  const resolved: SeedModule[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(mod: SeedModule): void {
    if (visited.has(mod.name)) return;
    if (visiting.has(mod.name)) {
      throw new Error(`Circular dependency detected: ${mod.name}`);
    }

    visiting.add(mod.name);

    for (const depName of mod.dependencies) {
      const dep = seedModules.get(depName);
      if (!dep) {
        throw new Error(`Seed "${mod.name}" depends on "${depName}" which is not registered`);
      }
      visit(dep);
    }

    visiting.delete(mod.name);
    visited.add(mod.name);
    resolved.push(mod);
  }

  const sorted = [...modules].sort((a, b) => a.priority - b.priority);
  for (const mod of sorted) {
    visit(mod);
  }

  return resolved;
}

export function clearRegistry(): void {
  seedModules.clear();
}
