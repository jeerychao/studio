
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
                 throw new ValidationError('无效的子网掩码: ' + mask + ' (非连续)。', 'subnetMask', mask, '子网掩码格式不正确。');
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
  if (prefix === 31) { 
    const secondIpNum = (networkAddressNum + 1) >>> 0;
    return `${networkAddr} - ${numberToIp(secondIpNum)}`;
  }
  
  if (prefix > 30 || prefix < 1) { 
    return null; 
  }

  const firstUsableNum = (networkAddressNum + 1) >>> 0;
  const broadcastAddress = calculateBroadcastAddress(networkAddr, prefix);
  const broadcastNum = ipToNumber(broadcastAddress);
  const lastUsableNum = (broadcastNum - 1) >>> 0;

  if (lastUsableNum < firstUsableNum) return null; 

  return `${numberToIp(firstUsableNum)} - ${numberToIp(lastUsableNum)}`;
}

export interface SubnetProperties {
    inputIp: string; 
    prefix: number;
    networkAddress: string;
    subnetMask: string;
    broadcastAddress: string;
    firstUsableIp?: string; 
    lastUsableIp?: string;  
    ipRange?: string; 
}

export function getSubnetPropertiesFromCidr(cidr: string): SubnetProperties | null {
  const match = cidr.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
  if (!match) return null;

  const [, inputIp, prefixStr] = match;
  const prefix = parseInt(prefixStr, 10);

  if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;

  const ipParts = inputIp.split('.').map(Number);
  if (ipParts.some(part => isNaN(part) || part < 0 || part > 255) || ipParts.length !== 4) return null;

  const calculatedNetworkAddress = calculateNetworkAddress(inputIp, prefix);
  
  // Ensure the input IP for SubnetProperties is the *actual* network address.
  // This is important if a user provides, e.g., 192.168.1.10/24, the `inputIp` should still reflect 192.168.1.0 for calculations.
  // However, for display or user context, the original input might be useful, so we keep it as inputIp.
  // The `networkAddress` field *will* be the canonical one.
  
  const subnetMask = prefixToSubnetMask(prefix);
  const broadcastAddress = calculateBroadcastAddress(calculatedNetworkAddress, prefix); // Use calculated network address
  const ipRangeString = calculateIpRange(calculatedNetworkAddress, prefix); // Use calculated network address

  let firstUsableIp: string | undefined;
  let lastUsableIp: string | undefined;

  if (ipRangeString) {
    const parts = ipRangeString.split(' - ');
    firstUsableIp = parts[0];
    lastUsableIp = parts.length > 1 ? parts[1] : parts[0];
  }

  return {
    inputIp, // The IP part of the original CIDR string provided by the user
    prefix,
    networkAddress: calculatedNetworkAddress, // The true network address
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
        throw new ValidationError('CIDR 前缀 "' + parts[1] + '" 无效。', 'cidr', cidr, 'CIDR 前缀必须是 0 到 32 之间的数字。');
    }
    return prefix;
}

export function getUsableIpCount(prefix: number): number {
  if (prefix < 0 || prefix > 32) return 0; 
  if (prefix === 32) return 1; 
  if (prefix === 31) return 2; 
  if (prefix > 30 || prefix < 1) return 0; // For /0, it's too large; for >/30 other than /31, /32, no standard usable.
  return Math.pow(2, 32 - prefix) - 2; 
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

  if (cidrDetails.prefix === 32) {
      return ipNum === networkNum;
  }
  // For /31, both IPs are considered "usable" in point-to-point, and within the range
  if (cidrDetails.prefix === 31) {
      return ipNum === networkNum || ipNum === broadcastNum; 
  }
  // For standard subnets (/1 to /30), usable IPs are between network and broadcast
  return ipNum > networkNum && ipNum < broadcastNum;
}

export function groupConsecutiveIpsToRanges(ipNumbers: number[]): string[] {
  if (!ipNumbers || ipNumbers.length === 0) return [];
  
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
        ranges.push(numberToIp(rangeStart) + '-' + numberToIp(rangeEnd));
      }
      rangeStart = sortedUniqueIpNumbers[i];
      rangeEnd = sortedUniqueIpNumbers[i];
    }
  }
  
  if (rangeStart === rangeEnd) {
    ranges.push(numberToIp(rangeStart));
  } else {
    ranges.push(numberToIp(rangeStart) + '-' + numberToIp(rangeEnd));
  }
  
  return ranges;
}

// Removed getPrefixFromRequiredHosts and generateSubnetsFromParent functions

