
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
                 throw new ValidationError(\`无效的子网掩码: \${mask} (非连续)。\`, 'subnetMask', mask, '子网掩码格式不正确。');
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
    return \`\${networkAddr} - \${networkAddr}\`;
  }
  if (prefix === 31) { 
    const secondIpNum = (networkAddressNum + 1) >>> 0;
    return \`\${networkAddr} - \${numberToIp(secondIpNum)}\`;
  }
  
  if (prefix > 30 || prefix < 1) { 
    return null; 
  }

  const firstUsableNum = (networkAddressNum + 1) >>> 0;

  const broadcastAddress = calculateBroadcastAddress(networkAddr, prefix);
  const broadcastNum = ipToNumber(broadcastAddress);
  const lastUsableNum = (broadcastNum - 1) >>> 0;

  if (lastUsableNum < firstUsableNum) return null; 

  return \`\${numberToIp(firstUsableNum)} - \${numberToIp(lastUsableNum)}\`;
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
  const match = cidr.match(/^(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})\\/(\\d{1,2})$/);
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
        throw new ValidationError(\`CIDR 前缀 "\${parts[1]}" 无效。\`, 'cidr', cidr, 'CIDR 前缀必须是 0 到 32 之间的数字。');
    }
    return prefix;
}

export function getUsableIpCount(prefix: number): number {
  if (prefix < 0 || prefix > 32) return 0; 
  if (prefix === 32) return 1;
  if (prefix === 31) return 2; 
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
        ranges.push(\`\${numberToIp(rangeStart)}-\${numberToIp(rangeEnd)}\`);
      }
      rangeStart = sortedUniqueIpNumbers[i];
      rangeEnd = sortedUniqueIpNumbers[i];
    }
  }
  
  if (rangeStart === rangeEnd) {
    ranges.push(numberToIp(rangeStart));
  } else {
    ranges.push(\`\${numberToIp(rangeStart)}-\${numberToIp(rangeEnd)}\`);
  }
  
  return ranges;
}

/**
 * Calculates the smallest subnet prefix length that can accommodate a given number of usable host IP addresses.
 * Accounts for network and broadcast addresses.
 * @param requiredHosts The number of usable host IP addresses required.
 * @returns The prefix length (e.g., 24 for a /24 network).
 * @throws Error if the number of hosts is invalid or too large.
 */
export function getPrefixFromRequiredHosts(requiredHosts: number): number {
  if (requiredHosts <= 0) {
    throw new ValidationError("所需主机数量必须大于 0。", "requiredHostsPerSubnet", requiredHosts, "所需可用主机数必须大于零。");
  }
  // For /32, 1 usable host, 0 reserved. For /31, 2 usable hosts, 0 reserved.
  // Our getUsableIpCount returns 1 for /32 and 2 for /31.
  if (requiredHosts === 1) return 32; // Special case for /32
  if (requiredHosts === 2) return 31; // Special case for /31
  
  // For other cases, add 2 to account for network and broadcast addresses
  const totalAddressesNeeded = requiredHosts + 2;

  // Find the smallest power of 2 greater than or equal to totalAddressesNeeded
  let power = 0;
  while (Math.pow(2, power) < totalAddressesNeeded) {
    power++;
    if (power > 30) { // Cannot create a network larger than /0 or /1 equivalent, and practically /2 or larger
      throw new ValidationError(\`所需主机数量过大 (\${requiredHosts})，无法分配有效的子网。\`, "requiredHostsPerSubnet", requiredHosts, "所需可用主机数过多，超出了单个子网的实际容量。");
    }
  }
  
  const prefix = 32 - power;

  if (prefix < 0 ) { // Should be caught by power > 30 check already
      throw new ValidationError("所需主机数量过大，已超出IPv4地址空间。", "requiredHostsPerSubnet", requiredHosts, "所需可用主机数超出了IPv4总地址空间。");
  }
  // Ensure calculated prefix is not smaller than 0 (e.g. for very large host counts)
  // or larger than 30 (for standard networks that need network/broadcast).
  // /31 and /32 are handled above.
  if (prefix > 30 || prefix < 1) { // /0 is possible but impractical for this tool's scope
     throw new ValidationError(\`根据所需主机数 (\${requiredHosts}) 计算出的前缀 /${prefix} 无效。请检查主机数。`, "requiredHostsPerSubnet", requiredHosts, "所需主机数导致了无效的网络前缀计算。");
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
  // Allow /31 and /32 for new subnets
  if (newSubnetPrefixLength > 32) {
    return { error: "新子网前缀长度不能大于 32。" };
  }

  const parentNetworkNum = ipToNumber(parentProps.networkAddress);
  const parentBroadcastNum = ipToNumber(parentProps.broadcastAddress);

  const newSubnetSize = Math.pow(2, 32 - newSubnetPrefixLength);
  const maxPossibleSubnets = Math.pow(2, newSubnetPrefixLength - parentProps.prefix);

  const generatedSubnets: SubnetProperties[] = [];
  let currentNetworkNum = parentNetworkNum;
  let subnetsGenerated = 0;

  // For /32, the broadcast and network addresses are the same. Loop needs care.
  // If parent is /32 and new is /32, only 1 subnet.
  if (parentProps.prefix === 32 && newSubnetPrefixLength === 32) {
    if (count && count < 1) { /* no op */ }
    else {
        const subnetDetail = getSubnetPropertiesFromCidr(`${parentProps.networkAddress}/32`);
        if (subnetDetail) generatedSubnets.push(subnetDetail);
    }
    return { generatedSubnets, maxPossible: 1};
  }


  while (currentNetworkNum <= parentBroadcastNum && (newSubnetPrefixLength === 32 ? currentNetworkNum <= parentNetworkNum : currentNetworkNum + newSubnetSize -1 <= parentBroadcastNum) ) {
    if (count && subnetsGenerated >= count) {
      break;
    }

    const currentSubnetIp = numberToIp(currentNetworkNum);
    const subnetDetail = getSubnetPropertiesFromCidr(\`\${currentSubnetIp}/\${newSubnetPrefixLength}\`);
    if (subnetDetail) {
      // Ensure the generated subnet's network address starts at or after parent's network address
      // And its broadcast address ends at or before parent's broadcast address
      if (ipToNumber(subnetDetail.networkAddress) >= parentNetworkNum && ipToNumber(subnetDetail.broadcastAddress) <= parentBroadcastNum) {
        generatedSubnets.push(subnetDetail);
        subnetsGenerated++;
      } else {
         // This condition means the current calculated subnet bleeds outside the parent. Stop.
        break;
      }
    } else {
        return { error: \`无法为 \${currentSubnetIp}/\${newSubnetPrefixLength} 生成子网详情。\`};
    }
    
    if (newSubnetSize === 0) break; // Should not happen for prefix <= 32
    currentNetworkNum += newSubnetSize;
    if (currentNetworkNum === 0 && newSubnetSize > 0) { // Overflow protection if currentNetworkNum wrapped around
        break;
    }
  }

  return { generatedSubnets, maxPossible: maxPossibleSubnets };
}
