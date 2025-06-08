
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
  if (prefix === 0) return '0.0.0.0'; // For /0, network address is 0.0.0.0
  const maskNum = (0xffffffff << (32 - prefix)) >>> 0;
  const networkNum = (ipNum & maskNum) >>> 0;
  return numberToIp(networkNum);
}

// Helper: Calculate broadcast address
export function calculateBroadcastAddress(ipOrNetworkAddress: string, prefix: number): string {
  if (prefix < 0 || prefix > 32) throw new RangeError('Invalid prefix length for broadcast address calculation.');
  const networkNum = ipToNumber(calculateNetworkAddress(ipOrNetworkAddress, prefix));
  if (prefix === 32) return ipOrNetworkAddress; // For /32, broadcast is the same as network address
  if (prefix === 0) return '255.255.255.255'; // For /0, broadcast is 255.255.255.255

  const hostBits = 32 - prefix;
  const broadcastNum = (networkNum | ((1 << hostBits) - 1)) >>> 0;
  return numberToIp(broadcastNum);
}

// Helper: Calculate IP Range (first usable to last usable)
export function calculateIpRange(networkAddr: string, prefix: number): string | null {
  if (prefix < 0 || prefix > 32) throw new RangeError('Invalid prefix length for IP range calculation.');
  const networkAddressNum = ipToNumber(networkAddr);

  if (prefix === 32) { // /32 network has 1 IP, which is itself. Usable for host.
    return `${networkAddr} - ${networkAddr}`;
  }
  if (prefix === 31) { // /31 network has 2 IPs, both usable in point-to-point.
    const secondIpNum = (networkAddressNum + 1) >>> 0;
    return `${networkAddr} - ${numberToIp(secondIpNum)}`;
  }
  
  // For standard networks /1 to /30
  if (prefix > 30 || prefix < 1) { 
    // Networks smaller than /30 don't have traditional "network + 2" usable IPs.
    // /0 is too broad for a specific range.
    return null; 
  }

  const firstUsableNum = (networkAddressNum + 1) >>> 0;

  const broadcastAddress = calculateBroadcastAddress(networkAddr, prefix);
  const broadcastNum = ipToNumber(broadcastAddress);
  const lastUsableNum = (broadcastNum - 1) >>> 0;

  if (lastUsableNum < firstUsableNum) return null; // Should not happen for /1 to /30

  return `${numberToIp(firstUsableNum)} - ${numberToIp(lastUsableNum)}`;
}

export interface SubnetProperties {
    inputIp: string; // The IP part of the input CIDR
    prefix: number;
    networkAddress: string;
    subnetMask: string;
    broadcastAddress: string;
    firstUsableIp?: string; 
    lastUsableIp?: string;  
    ipRange?: string; // Formatted string "firstUsable - lastUsable" or single IP for /32
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
  // Ensure the IP part of the input CIDR is indeed the network address
  if (inputIp !== networkAddress && prefix < 31) { // For /31 and /32, input IP doesn't have to be network address
      // console.warn(`Input IP ${inputIp} for CIDR ${cidr} is not the network address. Network address is ${networkAddress}. Proceeding with calculated network address.`);
      // Depending on strictness, one might return null or throw error here. For now, we proceed with calculated network address.
  }


  const subnetMask = prefixToSubnetMask(prefix);
  const broadcastAddress = calculateBroadcastAddress(networkAddress, prefix); // Use calculated networkAddress
  const ipRangeString = calculateIpRange(networkAddress, prefix); // Use calculated networkAddress

  let firstUsableIp: string | undefined;
  let lastUsableIp: string | undefined;

  if (ipRangeString) {
    const parts = ipRangeString.split(' - ');
    firstUsableIp = parts[0];
    lastUsableIp = parts.length > 1 ? parts[1] : parts[0];
  }


  return {
    inputIp, // Store the original IP part from CIDR for reference
    prefix,
    networkAddress, // Correct network address
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
  if (prefix < 0 || prefix > 32) return 0; 
  if (prefix === 32) return 1; // A /32 network has 1 usable IP (the host itself).
  if (prefix === 31) return 2; // A /31 network has 2 usable IPs (point-to-point).
  // For standard networks /1 to /30, subtract 2 for network and broadcast.
  return Math.pow(2, 32 - prefix) - 2; 
}

export function doSubnetsOverlap(subnet1Details: SubnetProperties, subnet2Details: SubnetProperties): boolean {
  const s1NetworkNum = ipToNumber(subnet1Details.networkAddress);
  const s1BroadcastNum = ipToNumber(subnet1Details.broadcastAddress);
  const s2NetworkNum = ipToNumber(subnet2Details.networkAddress);
  const s2BroadcastNum = ipToNumber(subnet2Details.broadcastAddress);
  // Overlap occurs if the start of one is less than or equal to the end of the other, for both ranges.
  return Math.max(s1NetworkNum, s2NetworkNum) <= Math.min(s1BroadcastNum, s2BroadcastNum);
}

export function isIpInCidrRange(ipAddress: string, cidrDetails: SubnetProperties): boolean {
  const ipNum = ipToNumber(ipAddress);
  const networkNum = ipToNumber(cidrDetails.networkAddress);
  const broadcastNum = ipToNumber(cidrDetails.broadcastAddress);

  if (cidrDetails.prefix === 32) {
      return ipNum === networkNum;
  }
  // For /31, any IP within the two addresses of the network is valid.
  if (cidrDetails.prefix === 31) {
      return ipNum === networkNum || ipNum === broadcastNum; // Broadcast for /31 is the second IP
  }
  // For other standard networks
  return ipNum >= networkNum && ipNum <= broadcastNum;
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
        ranges.push(`${numberToIp(rangeStart)}-${numberToIp(rangeEnd)}`);
      }
      rangeStart = sortedUniqueIpNumbers[i];
      rangeEnd = sortedUniqueIpNumbers[i];
    }
  }
  
  // Add the last range
  if (rangeStart === rangeEnd) {
    ranges.push(numberToIp(rangeStart));
  } else {
    ranges.push(`${numberToIp(rangeStart)}-${numberToIp(rangeEnd)}`);
  }
  
  return ranges;
}

/**
 * Calculates the smallest subnet prefix length that can accommodate a given number of *usable* host IP addresses.
 * @param requiredUsableHosts The number of *usable* host IP addresses required (network & broadcast are excluded by the user).
 * @returns The prefix length (e.g., 30 for 2 usable hosts).
 * @throws Error if the number of hosts is invalid or too large.
 */
export function getPrefixFromRequiredHosts(requiredUsableHosts: number): number {
  if (requiredUsableHosts <= 0) {
    throw new ValidationError("期望可用主机数必须大于 0。", "requiredHostsPerSubnet", requiredUsableHosts, "期望可用主机数必须大于零。");
  }

  // Special cases for /32 and /31 based on *usable* hosts
  if (requiredUsableHosts === 1) {
    // To get 1 usable host, you need a /32 network.
    // (Total IPs = 1. Usable = 1. No separate network/broadcast address)
    return 32;
  }
  if (requiredUsableHosts === 2) {
    // To get 2 usable hosts, you need a /31 network (point-to-point).
    // (Total IPs = 2. Usable = 2. The two IPs are the network and broadcast essentially, but both are assignable).
    // Or a /30 network (Total IPs = 4. Usable = 2. Network + Broadcast + 2 usable)
    // User expectation for "2 usable" after excluding network/broadcast typically means a /30.
    return 30;
  }
  
  // For requiredUsableHosts > 2, we need space for network addr, broadcast addr, AND the hosts.
  const totalAddressesNeeded = requiredUsableHosts + 2;

  let power = 0;
  while (Math.pow(2, power) < totalAddressesNeeded) {
    power++;
    if (power > 30) { // Max host bits for a network (excluding /0, /1 which are huge)
                     // 2^30 is a very large number of hosts. Max prefix would be 32-30 = 2.
      throw new ValidationError(`期望可用主机数量过大 (${requiredUsableHosts})，无法分配有效的子网。`, "requiredHostsPerSubnet", requiredUsableHosts, "期望可用主机数过多。");
    }
  }
  
  const prefix = 32 - power;

  if (prefix < 1 ) { // Cannot be /0 for practical subnetting
      throw new ValidationError("期望可用主机数量过大，已超出IPv4地址空间或导致无效前缀。", "requiredHostsPerSubnet", requiredUsableHosts, "期望可用主机数过大。");
  }
  // Standard networks (prefix <= 30) must fit network and broadcast.
  // /31 (2 usable), /32 (1 usable) are handled above.
  if (prefix > 30 && requiredUsableHosts > 2) {
     throw new ValidationError(`根据期望主机数 (${requiredUsableHosts}) 计算出的前缀 /${prefix} 无效。请检查主机数。`, "requiredHostsPerSubnet", requiredUsableHosts, "所需主机数导致了无效的网络前缀计算。");
  }
  return prefix;
}

/**
 * Generates a list of subnets by dividing a parent CIDR.
 * @param parentCidr The parent network in CIDR notation (e.g., "192.168.0.0/16").
 * @param newSubnetPrefixLength The desired prefix length for the new, smaller subnets (e.g., 24 for /24).
 * @param count Optional. The number of new subnets to generate. If not provided, generates all possible subnets.
 * @returns An object containing the list of generated SubnetProperties and the maximum possible subnets, or an error object.
 */
export function generateSubnetsFromParent(
  parentCidr: string,
  newSubnetPrefixLength: number,
  count?: number
): { generatedSubnets: SubnetProperties[]; maxPossible: number } | { error: string } {
  const parentProps = getSubnetPropertiesFromCidr(parentCidr);
  if (!parentProps) {
    return { error: "无效的父网络 CIDR。" };
  }

  if (newSubnetPrefixLength <= parentProps.prefix) {
    return { error: "新子网前缀长度必须大于父网络前缀长度 (即网络更小)。" };
  }
  if (newSubnetPrefixLength > 32) { // Can't be greater than /32
    return { error: "新子网前缀长度不能大于 32。" };
  }

  const parentNetworkNum = ipToNumber(parentProps.networkAddress);
  const parentBroadcastNum = ipToNumber(parentProps.broadcastAddress);

  // Size of each new subnet (total IPs)
  const newSubnetSize = Math.pow(2, 32 - newSubnetPrefixLength);
  // Max possible subnets of this new size within the parent
  const maxPossibleSubnets = Math.pow(2, newSubnetPrefixLength - parentProps.prefix);

  const generatedSubnets: SubnetProperties[] = [];
  let currentNetworkNum = parentNetworkNum;
  let subnetsGenerated = 0;

  if (parentProps.prefix === 32 && newSubnetPrefixLength === 32) {
    if (!count || count >= 1) { 
        const subnetDetail = getSubnetPropertiesFromCidr(`${parentProps.networkAddress}/32`);
        if (subnetDetail) generatedSubnets.push(subnetDetail);
    }
    return { generatedSubnets, maxPossible: 1};
  }


  while (currentNetworkNum <= parentBroadcastNum) {
    const currentSubnetEndRange = currentNetworkNum + newSubnetSize -1;

    if (currentSubnetEndRange > parentBroadcastNum || currentSubnetEndRange < currentNetworkNum /* overflow check */) {
        break; 
    }

    if (count && subnetsGenerated >= count) {
      break;
    }

    const currentSubnetIp = numberToIp(currentNetworkNum);
    const subnetDetail = getSubnetPropertiesFromCidr(`${currentSubnetIp}/${newSubnetPrefixLength}`);
    
    if (subnetDetail) {
        // Ensure the generated subnet is fully within the parent.
        if (ipToNumber(subnetDetail.networkAddress) >= parentNetworkNum && 
            ipToNumber(subnetDetail.broadcastAddress) <= parentBroadcastNum) {
            generatedSubnets.push(subnetDetail);
            subnetsGenerated++;
        } else {
            break;
        }
    } else {
        return { error: `无法为 ${currentSubnetIp}/${newSubnetPrefixLength} 生成子网详情。`};
    }
    
    if (newSubnetSize === 0) break; 
    
    const nextNetworkNum = currentNetworkNum + newSubnetSize;
    // Check for overflow if nextNetworkNum wraps around (becomes smaller than current)
    if (nextNetworkNum <= currentNetworkNum && newSubnetSize > 0) { 
        break;
    }
    currentNetworkNum = nextNetworkNum;
  }

  return { generatedSubnets, maxPossible: maxPossibleSubnets };
}
