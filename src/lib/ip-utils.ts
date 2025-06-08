
// src/lib/ip-utils.ts
import { ValidationError } from './errors';

// Helper: Convert IP string to integer
export function ipToNumber(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

// Helper: Convert integer to IP string
export function numberToIp(num: number): string {
  return [
    (num >>> 24) & 0xff,
    (num >>> 16) & 0xff,
    (num >>> 8) & 0xff,
    num & 0xff,
  ].join('.');
}

// Helper: Compare two IP address strings numerically
export function compareIpStrings(ipA: string, ipB: string): number {
  const partsA = ipA.split('.').map(Number);
  const partsB = ipB.split('.').map(Number);

  for (let i = 0; i < 4; i++) {
    if (partsA[i] < partsB[i]) return -1;
    if (partsA[i] > partsB[i]) return 1;
  }
  return 0;
}

// Helper: Calculate subnet mask from prefix length
export function prefixToSubnetMask(prefix: number): string {
  if (prefix < 0 || prefix > 32) throw new RangeError('Invalid prefix length, must be 0-32.');
  if (prefix === 0) return '0.0.0.0';
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return numberToIp(mask);
}

// Helper: Calculate prefix length from subnet mask string
export function subnetMaskToPrefix(mask: string): number {
    const maskNum = ipToNumber(mask);
    let prefix = 0;
    let tempMask = maskNum;
    for (let i = 0; i < 32; i++) {
        if ((tempMask << i) & 0x80000000) {
            prefix++;
        } else {
            if (((tempMask << i) & 0xFFFFFFFF) !== 0) {
                 throw new ValidationError(`无效的子网掩码: ${mask} (非连续)。`, 'subnetMask', mask, '子网掩码格式不正确。');
            }
            break;
        }
    }
    return prefix;
}

// Helper: Calculate network address
export function calculateNetworkAddress(ip: string, prefix: number): string {
  const ipNum = ipToNumber(ip);
  if (prefix < 0 || prefix > 32) throw new RangeError('Invalid prefix length for network address calculation.');
  if (prefix === 0) return '0.0.0.0';
  const maskNum = (0xffffffff << (32 - prefix)) >>> 0;
  const networkNum = (ipNum & maskNum) >>> 0;
  return numberToIp(networkNum);
}

// Helper: Calculate broadcast address
export function calculateBroadcastAddress(ipOrNetworkAddress: string, prefix: number): string {
  if (prefix < 0 || prefix > 32) throw new RangeError('Invalid prefix length for broadcast address calculation.');
  const networkNum = ipToNumber(calculateNetworkAddress(ipOrNetworkAddress, prefix));
  if (prefix === 32) return ipOrNetworkAddress;
  if (prefix === 0) return '255.255.255.255';

  const hostBits = 32 - prefix;
  const broadcastNum = (networkNum | ((1 << hostBits) - 1)) >>> 0;
  return numberToIp(broadcastNum);
}

// Helper: Calculate IP Range (first usable to last usable)
export function calculateIpRange(networkAddr: string, prefix: number): string | null {
  if (prefix < 0 || prefix > 32) throw new RangeError('Invalid prefix length for IP range calculation.');
  const networkAddressNum = ipToNumber(networkAddr);

  if (prefix === 32) {
    return `${networkAddr} - ${networkAddr}`;
  }
  if (prefix === 31) { // Per RFC 3021, /31s have two usable IPs, which are the network and broadcast addresses themselves.
    const secondIpNum = (networkAddressNum + 1) >>> 0;
    return `${networkAddr} - ${numberToIp(secondIpNum)}`;
  }
  // For prefixes /30 and smaller, the network and broadcast addresses are unusable.
  if (prefix > 30 || prefix < 1) { // /0 is not practical for usable IPs.
    return null; // Or handle as a special case, e.g., for /0, all IPs are usable.
  }

  const firstUsableNum = (networkAddressNum + 1) >>> 0;

  const broadcastAddress = calculateBroadcastAddress(networkAddr, prefix);
  const broadcastNum = ipToNumber(broadcastAddress);
  const lastUsableNum = (broadcastNum - 1) >>> 0;

  if (lastUsableNum < firstUsableNum) return null; // Should not happen for prefix <= 30

  return `${numberToIp(firstUsableNum)} - ${numberToIp(lastUsableNum)}`;
}

export interface SubnetProperties {
    inputIp: string;
    prefix: number;
    networkAddress: string;
    subnetMask: string;
    broadcastAddress: string;
    firstUsableIp?: string; // First IP address in the usable range
    lastUsableIp?: string;  // Last IP address in the usable range
    ipRange?: string;       // String representation like "X.X.X.X - Y.Y.Y.Y" for usable range
}

export function getSubnetPropertiesFromCidr(cidr: string): SubnetProperties | null {
  const match = cidr.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
  if (!match) return null;

  const [, inputIp, prefixStr] = match;
  const prefix = parseInt(prefixStr, 10);

  if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;

  const ipParts = inputIp.split('.').map(Number);
  if (ipParts.some(part => isNaN(part) || part < 0 || part > 255) || ipParts.length !== 4) return null;

  const networkAddress = calculateNetworkAddress(inputIp, prefix);
  const subnetMask = prefixToSubnetMask(prefix);
  const broadcastAddress = calculateBroadcastAddress(networkAddress, prefix);
  const ipRangeString = calculateIpRange(networkAddress, prefix);

  let firstUsableIp: string | undefined;
  let lastUsableIp: string | undefined;

  if (prefix === 32) {
    firstUsableIp = networkAddress;
    lastUsableIp = networkAddress;
  } else if (prefix === 31) {
    firstUsableIp = networkAddress;
    lastUsableIp = numberToIp(ipToNumber(networkAddress) + 1);
  } else if (prefix >= 0 && prefix <= 30) {
    const networkNum = ipToNumber(networkAddress);
    const broadcastNum = ipToNumber(broadcastAddress);
    if (networkNum + 1 <= broadcastNum - 1) {
        firstUsableIp = numberToIp(networkNum + 1);
        lastUsableIp = numberToIp(broadcastNum - 1);
    }
  }


  return {
    inputIp,
    prefix,
    networkAddress,
    subnetMask,
    broadcastAddress,
    firstUsableIp,
    lastUsableIp,
    ipRange: ipRangeString ?? undefined
  };
}


export function getPrefixFromCidr(cidr: string): number {
    const parts = cidr.split('/');
    if (parts.length !== 2) throw new ValidationError('CIDR 格式无效，缺少前缀。', 'cidr', cidr, 'CIDR 格式无效，缺少斜杠和前缀长度。');
    const prefix = parseInt(parts[1], 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 32) {
        throw new ValidationError(`CIDR 前缀 "${parts[1]}" 无效。`, 'cidr', cidr, 'CIDR 前缀必须是 0 到 32 之间的数字。');
    }
    return prefix;
}

export function getUsableIpCount(prefix: number): number {
  if (prefix < 0 || prefix > 32) return 0; // Invalid prefix
  if (prefix === 32) return 1;
  if (prefix === 31) return 2; // RFC 3021
  return Math.pow(2, 32 - prefix) - 2; // Network and broadcast addresses are unusable
}

export function doSubnetsOverlap(subnet1Details: SubnetProperties, subnet2Details: SubnetProperties): boolean {
  const s1NetworkNum = ipToNumber(subnet1Details.networkAddress);
  const s1BroadcastNum = ipToNumber(subnet1Details.broadcastAddress);
  const s2NetworkNum = ipToNumber(subnet2Details.networkAddress);
  const s2BroadcastNum = ipToNumber(subnet2Details.broadcastAddress);
  return Math.max(s1NetworkNum, s2NetworkNum) <= Math.min(s1BroadcastNum, s2BroadcastNum);
}

export function isIpInCidrRange(ipAddress: string, cidrDetails: SubnetProperties): boolean {
  const ipNum = ipToNumber(ipAddress);
  const networkNum = ipToNumber(cidrDetails.networkAddress);
  const broadcastNum = ipToNumber(cidrDetails.broadcastAddress);
  return ipNum >= networkNum && ipNum <= broadcastNum;
}

// Helper function to group consecutive IP numbers into ranges or single IPs
export function groupConsecutiveIpsToRanges(ipNumbers: number[]): string[] {
  if (!ipNumbers || ipNumbers.length === 0) return [];
  
  // Ensure IPs are sorted and unique for correct range calculation
  const sortedUniqueIpNumbers = Array.from(new Set(ipNumbers)).sort((a, b) => a - b);

  const ranges: string[] = [];
  if (sortedUniqueIpNumbers.length === 0) return ranges;

  let rangeStart = sortedUniqueIpNumbers[0];
  let rangeEnd = sortedUniqueIpNumbers[0];

  for (let i = 1; i < sortedUniqueIpNumbers.length; i++) {
    if (sortedUniqueIpNumbers[i] === rangeEnd + 1) {
      rangeEnd = sortedUniqueIpNumbers[i];
    } else {
      if (rangeStart === rangeEnd) {
        ranges.push(numberToIp(rangeStart));
      } else {
        ranges.push(`${numberToIp(rangeStart)}-${numberToIp(rangeEnd)}`);
      }
      rangeStart = sortedUniqueIpNumbers[i];
      rangeEnd = sortedUniqueIpNumbers[i];
    }
  }
  
  // Push the last range
  if (rangeStart === rangeEnd) {
    ranges.push(numberToIp(rangeStart));
  } else {
    ranges.push(`${numberToIp(rangeStart)}-${numberToIp(rangeEnd)}`);
  }
  
  return ranges;
}

export function calculatePrefixLengthFromRequiredHosts(requiredHosts: number): number {
  if (requiredHosts <= 0) {
    return 32; // Smallest possible subnet for 0 or negative hosts
  }
  // We need 2^H >= requiredHosts + 2 (for network and broadcast addresses)
  // except for /31 (2 hosts) and /32 (1 host)
  if (requiredHosts === 1) return 32;
  if (requiredHosts === 2) return 31;

  const requiredTotalAddresses = requiredHosts + 2;
  let hostBits = 0;
  while (Math.pow(2, hostBits) < requiredTotalAddresses) {
    hostBits++;
    if (hostBits > 30) { // Max prefix for general subnets is /30 (4 total, 2 usable)
        // if hostBits goes to 31, it means prefix 1, which is too large.
        // if hostBits goes to 32, it means prefix 0.
        // This situation implies an extremely large number of hosts requested.
        throw new ValidationError("请求的每个子网的IP地址数量过大。", 'minIpsPerSubnet', requiredHosts, '请求的IP地址数量过多，无法划分。');
    }
  }
  return 32 - hostBits;
}

export function generateSubnetCandidates(
  supernetCidr: string,
  numberOfSubnets: number,
  childPrefixLength: number
): string[] | { error: string } {
  const supernetProps = getSubnetPropertiesFromCidr(supernetCidr);
  if (!supernetProps) {
    return { error: "无效的父网段CIDR。" };
  }

  if (childPrefixLength <= supernetProps.prefix) {
    return { error: "子网掩码长度必须大于父网段的掩码长度。" };
  }

  const maxPossibleChildren = Math.pow(2, childPrefixLength - supernetProps.prefix);
  if (numberOfSubnets > maxPossibleChildren) {
    return { error: `父网段 ${supernetCidr} 最多只能划分为 ${maxPossibleChildren} 个 /${childPrefixLength} 的子网，请求了 ${numberOfSubnets} 个。` };
  }

  const candidates: string[] = [];
  let currentNetworkNum = ipToNumber(supernetProps.networkAddress);
  const childSubnetSize = Math.pow(2, 32 - childPrefixLength);

  for (let i = 0; i < numberOfSubnets; i++) {
    const candidateNetworkAddress = numberToIp(currentNetworkNum);
    candidates.push(`${candidateNetworkAddress}/${childPrefixLength}`);
    currentNetworkNum += childSubnetSize;
    if (currentNetworkNum > ipToNumber(supernetProps.broadcastAddress)) {
        // This should ideally be caught by maxPossibleChildren check, but as a safeguard.
        return { error: `计算候选子网时超出父网段范围。在第 ${i+1} 个子网处。`};
    }
  }
  return candidates;
}
