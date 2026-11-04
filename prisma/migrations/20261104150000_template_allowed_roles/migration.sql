-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "allowedRoles" "Role"[] DEFAULT ARRAY['ADMIN', 'MANAGER', 'STAFF']::"Role"[];

