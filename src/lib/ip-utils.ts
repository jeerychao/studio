
import { ValidationError } from './errors'; // Assuming errors.ts is in the same directory or accessible

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
    // Check for non-contiguous mask bits from the right (least significant)
    // A valid mask has all 1s on the left and all 0s on the right.
    // So, (mask XOR (mask + 1)) / 2 should be all 1s up to the prefix length.
    // Easier way: count leading 1s.
    for (let i = 0; i < 32; i++) {
        if ((tempMask << i) & 0x80000000) { // Check most significant bit
            prefix++;
        } else {
            // After the first 0, all subsequent bits must also be 0 for a valid mask
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
    return `${networkAddr} - ${networkAddr}`; // Single IP is "usable"
  }
  if (prefix === 31) {
    // RFC 3021: for /31, both addresses are usable
    const secondIpNum = (networkAddressNum + 1) >>> 0;
    return `${networkAddr} - ${numberToIp(secondIpNum)}`;
  }
   // For /0, there are no "usable" host IPs in the traditional sense (network=0.0.0.0, broadcast=255.255.255.255)
   // but the range of all IPs is vast. For typical "usable" ranges, /0 is not applicable.
  if (prefix > 30 || prefix < 1) { 
    return null; // No typical usable host range for /0 or prefixes > /30 (handled by /31, /32 above)
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
    ipRange?: string; // String representation like "192.168.1.1 - 192.168.1.254"
}

// Renamed from parseAndValidateCIDR to getSubnetPropertiesFromCidr
// This function now PRIMARILY PARSES and CALCULATES properties assuming basic CIDR format is okay.
// Deep validation (like ensuring input IP is network address) is now in error-utils.ts/validateCIDR
export function getSubnetPropertiesFromCidr(cidr: string): SubnetProperties | null {
  const match = cidr.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
  if (!match) return null; // Basic format check
  
  const [, inputIp, prefixStr] = match;
  const prefix = parseInt(prefixStr, 10);

  if (prefix < 0 || prefix > 32) return null; // Basic prefix range check

  const ipParts = inputIp.split('.').map(Number);
  if (ipParts.some(part => isNaN(part) || part < 0 || part > 255) || ipParts.length !== 4) return null;
  
  const networkAddress = calculateNetworkAddress(inputIp, prefix);
  const subnetMask = prefixToSubnetMask(prefix);
  const broadcastAddress = calculateBroadcastAddress(networkAddress, prefix);
  const ipRangeString = calculateIpRange(networkAddress, prefix);
  
  let firstUsableIp: string | undefined;
  let lastUsableIp: string | undefined;

  if (ipRangeString) {
    const parts = ipRangeString.split(' - ');
    firstUsableIp = parts[0];
    lastUsableIp = parts[1];
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
  if (prefix === 32) return 1;
  if (prefix === 31) return 2;
  if (prefix >= 0 && prefix <= 30) return Math.pow(2, 32 - prefix) - 2;
  return 0;
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
