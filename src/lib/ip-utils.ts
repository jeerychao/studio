
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
  
  const subnetMask = prefixToSubnetMask(prefix);
  const broadcastAddress = calculateBroadcastAddress(calculatedNetworkAddress, prefix); 
  const ipRangeString = calculateIpRange(calculatedNetworkAddress, prefix); 

  let firstUsableIp: string | undefined;
  let lastUsableIp: string | undefined;

  if (ipRangeString) {
    const parts = ipRangeString.split(' - ');
    firstUsableIp = parts[0];
    lastUsableIp = parts.length > 1 ? parts[1] : parts[0];
  }

  return {
    inputIp, 
    prefix,
    networkAddress: calculatedNetworkAddress, 
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
  if (cidrDetails.prefix === 31) {
      return ipNum === networkNum || ipNum === broadcastNum; 
  }
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

export function getPrefixFromRequiredHosts(requiredUsableHosts: number): number {
  if (requiredUsableHosts <= 0) {
    throw new ValidationError("期望可用主机数必须大于 0。", "requiredHostsPerSubnet", requiredUsableHosts, "期望可用主机数必须大于零。");
  }

  if (requiredUsableHosts === 1) {
    return 32; // /32 provides 1 usable IP.
  }
  // For point-to-point links, /31 is often used, providing 2 usable IPs.
  // However, if user means 2 usable IPs in the traditional sense (excluding network and broadcast),
  // they need a /30 (4 total IPs - 2 usable).
  if (requiredUsableHosts === 2) {
    return 30; 
  }
  
  // For requiredUsableHosts > 2, we need space for network addr, broadcast addr, AND the hosts.
  const totalAddressesNeeded = requiredUsableHosts + 2;

  let power = 0;
  while (Math.pow(2, power) < totalAddressesNeeded) {
    power++;
    if (power > 30) { 
      throw new ValidationError('期望可用主机数量过大 (' + requiredUsableHosts + ')，无法分配有效的子网。', "requiredHostsPerSubnet", requiredUsableHosts, "期望可用主机数过大。");
    }
  }
  
  const prefix = 32 - power;

  if (prefix < 1 ) { 
      throw new ValidationError("期望可用主机数量过大，已超出IPv4地址空间或导致无效前缀。", "requiredHostsPerSubnet", requiredUsableHosts, "期望可用主机数过大。");
  }
  // Standard networks (prefix <= 30) must fit network and broadcast.
  // /31 (2 usable), /32 (1 usable) are handled above.
  if (prefix > 30 && requiredUsableHosts > 2) { // This check needs to be careful with /31
     throw new ValidationError('根据期望主机数 (' + requiredUsableHosts + ') 计算出的前缀 /' + prefix + ' 无效。请检查主机数。', "requiredHostsPerSubnet", requiredUsableHosts, "所需主机数导致了无效的网络前缀计算。");
  }
  return prefix;
}

export function generateSubnetsFromParent(
  parentCidr: string,
  newSubnetPrefixLength: number,
  count?: number
): { generatedSubnets: SubnetProperties[]; maxPossible: number } | { error: string } {
  const parentProps = getSubnetPropertiesFromCidr(parentCidr);
  if (!parentProps) {
    return { error: "无效的父网络 CIDR。" };
  }

  if (newSubnetPrefixLength < parentProps.prefix) {
    return { error: "新子网前缀长度 /" + newSubnetPrefixLength + " 不能小于父网络前缀长度 /" + parentProps.prefix + " (即网络更大)。" };
  }
  if (newSubnetPrefixLength > 32) { 
    return { error: "新子网前缀长度不能大于 32。" };
  }

  const parentNetworkNum = ipToNumber(parentProps.networkAddress);
  const parentBroadcastNum = ipToNumber(parentProps.broadcastAddress);

  if (newSubnetPrefixLength === parentProps.prefix) {
    // If the new prefix is the same as parent, only one "subnet" can be generated, which is the parent itself.
    const subnetDetail = getSubnetPropertiesFromCidr(`${parentProps.networkAddress}/${parentProps.prefix}`);
    if (subnetDetail) {
        // Verify if this single subnet can actually provide the number of hosts that led to this prefix calculation.
        // This check is implicitly handled by how getPrefixFromRequiredHosts works.
        return { generatedSubnets: [subnetDetail], maxPossible: 1 };
    } else {
        return { error: "无法为父网络本身生成子网详情。父CIDR: " + parentCidr };
    }
  }


  const newSubnetSize = Math.pow(2, 32 - newSubnetPrefixLength);
  const maxPossibleSubnets = Math.pow(2, newSubnetPrefixLength - parentProps.prefix);

  const generatedSubnets: SubnetProperties[] = [];
  let currentNetworkNum = parentNetworkNum;
  let subnetsGenerated = 0;

  while (currentNetworkNum <= parentBroadcastNum) {
    const currentSubnetEndRange = currentNetworkNum + newSubnetSize - 1;

    if (currentSubnetEndRange > parentBroadcastNum || currentSubnetEndRange < currentNetworkNum ) {
        break; 
    }

    if (count && subnetsGenerated >= count) {
      break;
    }

    const currentSubnetIp = numberToIp(currentNetworkNum);
    const subnetDetail = getSubnetPropertiesFromCidr(`${currentSubnetIp}/${newSubnetPrefixLength}`);
    
    if (subnetDetail) {
        if (ipToNumber(subnetDetail.networkAddress) >= parentNetworkNum && 
            ipToNumber(subnetDetail.broadcastAddress) <= parentBroadcastNum) {
            generatedSubnets.push(subnetDetail);
            subnetsGenerated++;
        } else {
            break;
        }
    } else {
        return { error: '无法为 ' + currentSubnetIp + '/' + newSubnetPrefixLength + ' 生成子网详情。'};
    }
    
    if (newSubnetSize === 0 && newSubnetPrefixLength === 32) { // Only break if it's /32 and size is 0 effectively (1 IP)
      if (currentNetworkNum >= parentBroadcastNum) break; // Stop if we processed the last IP of parent
    } else if (newSubnetSize === 0) { // Should not happen for prefix < 32
      break;
    }
    
    const nextNetworkNum = currentNetworkNum + newSubnetSize;
    if (nextNetworkNum <= currentNetworkNum && newSubnetSize > 0) { 
        break;
    }
    currentNetworkNum = nextNetworkNum;
  }

  return { generatedSubnets, maxPossible: maxPossibleSubnets };
}

    