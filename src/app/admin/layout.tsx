import type { ReactNode } from "react";
import { requireAdminPage } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

type AdminLayoutProps = {
  children: ReactNode;
};

export default async function AdminLayout({ children }: AdminLayoutProps) {
  await requireAdminPage("/admin");

  return <>{children}</>;
}
