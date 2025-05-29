
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
    ip: string;
    prefix: number;
    networkAddress: string;
    subnetMask: string;
    broadcastAddress: string;
    firstUsableIp?: string;
    lastUsableIp?: string;
    ipRange?: string;
}

// Helper: Validate and parse CIDR string
export function parseAndValidateCIDR(cidr: string): ParsedCIDR | null {
  const match = cidr.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
  if (!match) return null;
  
  const [, ip, prefixStr] = match;
  const prefix = parseInt(prefixStr, 10);

  if (prefix < 0 || prefix > 32) return null;

  const ipParts = ip.split('.').map(Number);
  if (ipParts.some(part => part < 0 || part > 255) || ipParts.length !== 4) return null;
  
  const networkAddress = calculateNetworkAddress(ip, prefix);
  // For subnet creation, the IP part of CIDR must be the network address itself.
  if (ip !== networkAddress) {
    // console.warn(`Provided IP ${ip} in CIDR ${cidr} is not the network address. Using ${networkAddress}.`);
    // Depending on strictness, you might return null or use the calculated networkAddress.
    // For user input that should define a network, it's better to be strict.
    return null; 
  }

  const subnetMask = prefixToSubnetMask(prefix);
  const broadcastAddress = calculateBroadcastAddress(networkAddress, prefix);
  const ipRange = calculateIpRange(networkAddress, prefix);
  
  let firstUsableIp: string | undefined;
  let lastUsableIp: string | undefined;

  if (ipRange) {
    const parts = ipRange.split(' - ');
    firstUsableIp = parts[0];
    lastUsableIp = parts[1];
  }


  return { 
    ip, // The original IP from CIDR, which we've validated is the network address
    prefix, 
    networkAddress, 
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
