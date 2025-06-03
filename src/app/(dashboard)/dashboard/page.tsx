
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getSubnetsAction, getIPAddressesAction, getAuditLogsAction } from "@/lib/actions";
import { cidrToPrefix, getUsableIpCount } from "@/lib/ip-utils";
import { Network, Globe, Users, Activity, AlertTriangle, ArrowUpRight } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  try {
    // Fetch all subnets and IPs by not passing pagination parameters
    // These actions are designed to return all data in PaginatedResponse.data if no page/pageSize is given.
    const subnetsResponse = await getSubnetsAction();
    const ipsResponse = await getIPAddressesAction();
    // For recent logs, explicitly fetch the first page with a small size
    const auditLogsResponse = await getAuditLogsAction({ page: 1, pageSize: 5 });

    const subnetsForProcessing = Array.isArray(subnetsResponse.data) ? subnetsResponse.data : [];
    const allIpsForProcessing = Array.isArray(ipsResponse.data) ? ipsResponse.data : [];
    const recentLogsForDisplay = Array.isArray(auditLogsResponse.data) ? auditLogsResponse.data : [];

    const totalSubnetCount = subnetsResponse.totalCount;

    const totalIPs = subnetsForProcessing.reduce((acc, subnet) => {
      if (subnet && typeof subnet.cidr === 'string') {
        try {
          const prefix = cidrToPrefix(subnet.cidr);
          return acc + getUsableIpCount(prefix);
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          console.error(`DashboardPage: Error processing CIDR '${subnet.cidr}' for subnet ID '${subnet.id}' during totalIPs calculation: ${error.message}`);
          return acc; 
        }
      }
      return acc; 
    }, 0);

    const allocatedIPsCount = allIpsForProcessing.filter(ip => ip && ip.status === 'allocated').length;
    const utilizationPercentage = totalIPs > 0 ? Math.round((allocatedIPsCount / totalIPs) * 100) : 0;

    const criticalSubnets = subnetsForProcessing.filter(s => s && (s.utilization ?? 0) > 85);

    return (
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Subnets</CardTitle>
              <Network className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalSubnetCount}</div>
              <p className="text-xs text-muted-foreground">Managed network segments</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Usable IPs</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalIPs.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Estimated usable IPs</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Allocated IPs</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{allocatedIPsCount}</div>
              <p className="text-xs text-muted-foreground">Currently in use</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Network Utilization</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{utilizationPercentage}%</div>
              <Progress value={utilizationPercentage} className="mt-2 h-2" />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest actions performed in the system.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="text-right">Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLogsForDisplay.map((log) => {
                    if (!log || !log.id) return null; 
                    return (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div className="font-medium">{log.username || "System"}</div>
                        <div className="hidden text-sm text-muted-foreground md:inline">
                          {/* Placeholder for user email or ID */}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{log.action.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{log.details}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleTimeString()}
                        <span className="block">{new Date(log.timestamp).toLocaleDateString()}</span>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
               <Button variant="outline" size="sm" className="mt-4 w-full asChild">
                  <Link href="/audit-logs">View All Logs</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Subnet Health
              </CardTitle>
              <CardDescription>Subnets nearing full capacity.</CardDescription>
            </CardHeader>
            <CardContent>
              {criticalSubnets.length > 0 ? (
                <ul className="space-y-3">
                  {criticalSubnets.map(subnet => {
                    if (!subnet || !subnet.id) return null; 
                    
                    let prefixDisplay: string | number = 'N/A';
                    if (subnet.cidr && typeof subnet.cidr === 'string') {
                      try {
                        prefixDisplay = cidrToPrefix(subnet.cidr);
                      } catch (prefixErr) {
                        const pError = prefixErr instanceof Error ? prefixErr : new Error(String(prefixErr));
                        console.warn(`DashboardPage: Error parsing prefix for subnet CIDR '${subnet.cidr}' in Subnet Health card: ${pError.message}`);
                        prefixDisplay = 'Invalid';
                      }
                    }

                    return (
                    <li key={subnet.id} className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{subnet.networkAddress}/{prefixDisplay}</p>
                        <p className="text-sm text-muted-foreground">{subnet.description || 'No description'}</p>
                      </div>
                      <div className="text-right">
                         <Badge variant={ (subnet.utilization ?? 0) > 95 ? "destructive" : "secondary"}>{(subnet.utilization ?? 0)}% Used</Badge>
                         <Link href={`/ip-addresses?subnetId=${subnet.id}`}>
                            <Button variant="ghost" size="sm" className="text-xs mt-1">Manage IPs <ArrowUpRight className="h-3 w-3 ml-1" /></Button>
                         </Link>
                      </div>
                    </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No subnets are critically utilized.</p>
              )}
               <Button variant="outline" size="sm" className="mt-4 w-full asChild">
                  <Link href="/subnets">View All Subnets</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  } catch (e) {
    let processedError: Error;
    if (e instanceof Error) {
      processedError = e;
    } else if (typeof e === 'string') {
      processedError = new Error(e);
    } else if (e === null || e === undefined) {
      processedError = new Error("An unknown null or undefined error occurred on DashboardPage.");
    } else {
      try {
        processedError = new Error(JSON.stringify(e));
      } catch (stringifyError) {
        processedError = new Error("An unknown non-serializable error occurred on DashboardPage.");
      }
    }
    console.error("INTERNAL SERVER ERROR on DashboardPage:", processedError.message, processedError.stack);
    // For server components, re-throwing the error is often the standard way to let Next.js handle it (e.g., show an error boundary).
    // However, you might want to render a fallback UI here instead if you have error.js/tsx files set up.
    // For now, re-throwing.
    throw processedError;
  }
}
