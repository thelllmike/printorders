import { redirect } from "next/navigation";
import CustomerView from "@/components/CustomerView";
import { getRole } from "@/lib/auth";

export default async function Home() {
  const role = await getRole();
  if (!role) redirect("/login");
  if (role === "shop") redirect("/shop");
  return <CustomerView />;
}
