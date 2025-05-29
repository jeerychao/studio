
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
  if (prefix < 0 || prefix > 32) throw new Error('Invalid prefix length');
  if (prefix === 0) return '0.0.0.0';
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return numberToIp(mask);
}

// Helper: Calculate prefix length from subnet mask string
export function subnetMaskToPrefix(mask: string): number {
    const maskNum = ipToNumber(mask);
    let prefix = 0;
    let tempMask = maskNum;
    while (tempMask & 0x80000000) {
        prefix++;
        tempMask <<= 1;
    }
    // Validate that the mask is contiguous
    if ((tempMask & 0xffffffff) !== 0 && prefix !== 0) { // if prefix is 0, mask is 0.0.0.0, tempMask is 0
        throw new Error('Invalid subnet mask: not contiguous');
    }
    return prefix;
}


// Helper: Calculate network address
export function calculateNetworkAddress(ip: string, prefix: number): string {
  const ipNum = ipToNumber(ip);
  if (prefix === 0) return '0.0.0.0'; // Network address for /0 is 0.0.0.0
  const maskNum = (0xffffffff << (32 - prefix)) >>> 0;
  const networkNum = (ipNum & maskNum) >>> 0;
  return numberToIp(networkNum);
}

// Helper: Calculate broadcast address
export function calculateBroadcastAddress(ipOrNetworkAddress: string, prefix: number): string {
  const networkNum = ipToNumber(calculateNetworkAddress(ipOrNetworkAddress, prefix));
  if (prefix === 32) return ipOrNetworkAddress; // For /32, broadcast is the IP itself
  if (prefix === 0) return '255.255.255.255'; // Broadcast for /0
  
  const hostBits = 32 - prefix;
  const broadcastNum = (networkNum | ((1 << hostBits) - 1)) >>> 0;
  return numberToIp(broadcastNum);
}

// Helper: Calculate IP Range
export function calculateIpRange(networkAddr: string, prefix: number): string | null {
  const networkAddressNum = ipToNumber(networkAddr);

  if (prefix === 32) {
    return `${networkAddr} - ${networkAddr}`;
  }
  if (prefix === 31) {
    // RFC 3021: for /31, both addresses are usable
    const secondIpNum = (networkAddressNum + 1) >>> 0;
    return `${networkAddr} - ${numberToIp(secondIpNum)}`;
  }
  if (prefix < 0 || prefix > 30) { // Covers /0 and invalid prefixes for typical host ranges
    return null; // No typical usable host range
  }


  const firstUsableNum = (networkAddressNum + 1) >>> 0;
  
  const broadcastAddress = calculateBroadcastAddress(networkAddr, prefix);
  const broadcastNum = ipToNumber(broadcastAddress);
  const lastUsableNum = (broadcastNum - 1) >>> 0;

  if (lastUsableNum < firstUsableNum) return null; 

  return `${numberToIp(firstUsableNum)} - ${numberToIp(lastUsableNum)}`;
}

export interface ParsedCIDR {
    inputIp: string; // The original IP part of the user's CIDR input string
    prefix: number;
    networkAddress: string; // Calculated network address
    subnetMask: string;
    broadcastAddress: string; // Calculated broadcast address
    firstUsableIp?: string;
    lastUsableIp?: string;
    ipRange?: string;
}

// Helper: Validate and parse CIDR string
// Now, it calculates the network address based on the input IP and prefix,
// rather than requiring the input IP to already be the network address.
export function parseAndValidateCIDR(cidr: string): ParsedCIDR | null {
  const match = cidr.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
  if (!match) return null;
  
  const [, inputIp, prefixStr] = match; // Renamed 'ip' to 'inputIp' for clarity
  const prefix = parseInt(prefixStr, 10);

  if (prefix < 0 || prefix > 32) return null;

  const ipParts = inputIp.split('.').map(Number);
  if (ipParts.some(part => part < 0 || part > 255) || ipParts.length !== 4) return null;
  
  // Calculate the true network address from the input IP and prefix
  const networkAddress = calculateNetworkAddress(inputIp, prefix);
  const subnetMask = prefixToSubnetMask(prefix);
  const broadcastAddress = calculateBroadcastAddress(networkAddress, prefix); // Use calculated networkAddress
  const ipRange = calculateIpRange(networkAddress, prefix);
  
  let firstUsableIp: string | undefined;
  let lastUsableIp: string | undefined;

  if (ipRange) {
    const parts = ipRange.split(' - ');
    firstUsableIp = parts[0];
    lastUsableIp = parts[1];
  }

  return { 
    inputIp, // Store the original IP from user's CIDR string
    prefix, 
    networkAddress, // This is the calculated, canonical network address
    subnetMask,
    broadcastAddress,
    firstUsableIp,
    lastUsableIp,
    ipRange: ipRange ?? undefined
  };
}

export function cidrToPrefix(cidr: string): number {
    const parts = cidr.split('/');
    if (parts.length !== 2) throw new Error('Invalid CIDR format');
    const prefix = parseInt(parts[1], 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 32) throw new Error('Invalid prefix in CIDR');
    return prefix;
}

// Helper: Calculate the number of usable IP addresses in a subnet
export function getUsableIpCount(prefix: number): number {
  if (prefix === 32) {
    return 1; // Single host
  }
  if (prefix === 31) {
    return 2; // Point-to-point link, both IPs usable as per RFC 3021
  }
  if (prefix >= 0 && prefix <= 30) {
    // Total addresses = 2^(32-prefix). Subtract 2 for network and broadcast addresses.
    return Math.pow(2, 32 - prefix) - 2;
  }
  return 0; // For invalid prefixes or /0 where "usable for hosts" is typically 0
}

// Helper: Check if two subnets (represented by their ParsedCIDR details) overlap
export function doSubnetsOverlap(subnet1Details: ParsedCIDR, subnet2Details: ParsedCIDR): boolean {
  const s1NetworkNum = ipToNumber(subnet1Details.networkAddress);
  const s1BroadcastNum = ipToNumber(subnet1Details.broadcastAddress);
  const s2NetworkNum = ipToNumber(subnet2Details.networkAddress);
  const s2BroadcastNum = ipToNumber(subnet2Details.broadcastAddress);

  // Overlap exists if max(start1, start2) <= min(end1, end2)
  return Math.max(s1NetworkNum, s2NetworkNum) <= Math.min(s1BroadcastNum, s2BroadcastNum);
}

// Helper: Check if a given IP address string is within a given CIDR's range (network to broadcast)
export function isIpInCidrRange(ipAddress: string, cidrDetails: ParsedCIDR): boolean {
  const ipNum = ipToNumber(ipAddress);
  const networkNum = ipToNumber(cidrDetails.networkAddress);
  const broadcastNum = ipToNumber(cidrDetails.broadcastAddress);

  return ipNum >= networkNum && ipNum <= broadcastNum;
}
