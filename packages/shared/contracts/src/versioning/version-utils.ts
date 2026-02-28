import { ContractVersion } from './version-types.js';

export function parseVersion(versionStr: string): ContractVersion {
  const parts = versionStr.split('.');
  if (parts.length !== 3) {
    throw new Error(`Invalid version format: "${versionStr}". Expected "major.minor.patch".`);
  }

  const [major, minor, patch] = parts.map(Number);
  if ([major, minor, patch].some(isNaN)) {
    throw new Error(`Invalid version format: "${versionStr}". All parts must be numbers.`);
  }

  return { major, minor, patch };
}

export function versionToString(version: ContractVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

export function isCompatible(clientVersion: string, serverVersion: string, minCompatibleVersion?: string): boolean {
  const client = parseVersion(clientVersion);
  const server = parseVersion(serverVersion);

  if (client.major !== server.major) {
    return false;
  }

  if (isNewer(clientVersion, serverVersion)) {
    return false;
  }

  if (minCompatibleVersion) {
    const minVersion = parseVersion(minCompatibleVersion);
    if (
      client.major < minVersion.major ||
      (client.major === minVersion.major && client.minor < minVersion.minor) ||
      (client.major === minVersion.major && client.minor === minVersion.minor && client.patch < minVersion.patch)
    ) {
      return false;
    }
  }

  return true;
}

export function isNewer(versionA: string, versionB: string): boolean {
  const a = parseVersion(versionA);
  const b = parseVersion(versionB);

  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  return a.patch > b.patch;
}
