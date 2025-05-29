
import { Edit, Trash2, ShieldCheck } from "lucide-react"; // PlusCircle removed
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { getRolesAction } from "@/lib/actions";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { RoleFormSheet } from "./role-form-sheet";

export default async function RolesPage() {
  const roles = await getRolesAction();

  return (
    <>
      <PageHeader
        title="Role Management"
        description="Define user roles and their permissions (permissions UI not implemented)."
        icon={ShieldCheck}
        actionElement={<RoleFormSheet />} // Use actionElement
      />
      {/* The RoleFormSheet that was here for "Add Role" is now passed to PageHeader's actionElement */}

      <Card>
        <CardHeader>
          <CardTitle>Role List</CardTitle>
          <CardDescription>All defined roles in the system.</CardDescription>
        </CardHeader>
        <CardContent>
          {roles.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">{role.name}</TableCell>
                    <TableCell className="max-w-md truncate">{role.description || "N/A"}</TableCell>
                    <TableCell>{role.userCount ?? 0}</TableCell>
                    <TableCell className="text-right">
                      <RoleFormSheet role={role}>
                        <Button variant="ghost" size="icon" aria-label="Edit Role">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </RoleFormSheet>
                      <DeleteConfirmationDialog
                        itemId={role.id}
                        itemName={role.name}
                        deleteAction={() => import("@/lib/actions").then(actions => actions.deleteRoleAction(role.id))}
                        triggerButton={
                          <Button variant="ghost" size="icon" aria-label="Delete Role">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-10">
              <p className="text-muted-foreground">No roles found.</p>
              <RoleFormSheet buttonProps={{className: "mt-4"}} />
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
