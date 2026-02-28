import { CURRENT_CONTRACT_VERSION, ContractRegistryEntry } from './version-types.js';
import { isNewer, isCompatible } from './version-utils.js';

class ContractRegistry {
  private contracts = new Map<string, ContractRegistryEntry>();

  register(entry: ContractRegistryEntry): void {
    this.contracts.set(`${entry.name}@${entry.version}`, entry);
  }

  get(name: string, version?: string): ContractRegistryEntry | undefined {
    if (version) {
      return this.contracts.get(`${name}@${version}`);
    }

    let latest: ContractRegistryEntry | undefined;
    for (const entry of this.contracts.values()) {
      if (entry.name === name) {
        if (!latest || isNewer(entry.version, latest.version)) {
          latest = entry;
        }
      }
    }
    return latest;
  }

  getAll(name?: string): ContractRegistryEntry[] {
    const entries = Array.from(this.contracts.values());
    if (name) {
      return entries.filter(e => e.name === name);
    }
    return entries;
  }

  checkCompatibility(
    contractName: string,
    clientVersion: string
  ): { compatible: boolean; latest: string; deprecated: boolean; replacedBy?: string } {
    const latest = this.get(contractName);
    if (!latest) {
      return { compatible: false, latest: 'unknown', deprecated: false };
    }

    const compatible = isCompatible(clientVersion, latest.version, latest.minCompatibleVersion);

    const clientEntry = this.get(contractName, clientVersion);
    const deprecated = clientEntry?.deprecated ?? false;
    const replacedBy = clientEntry?.replacedBy;

    return { compatible, latest: latest.version, deprecated, replacedBy };
  }
}

export const contractRegistry = new ContractRegistry();

contractRegistry.register({
  name: 'api-response',
  version: CURRENT_CONTRACT_VERSION,
  deprecated: false,
});

contractRegistry.register({
  name: 'events',
  version: CURRENT_CONTRACT_VERSION,
  deprecated: false,
});

contractRegistry.register({
  name: 'input-schemas',
  version: CURRENT_CONTRACT_VERSION,
  deprecated: false,
});

export function stampContractVersion<T extends Record<string, unknown>>(
  response: T,
  contractName: string
): T & { _contract: { version: string } } {
  const entry = contractRegistry.get(contractName);
  return {
    ...response,
    _contract: {
      version: entry?.version ?? CURRENT_CONTRACT_VERSION,
    },
  };
}
