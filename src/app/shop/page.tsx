import { redirect } from "next/navigation";
import ShopView from "@/components/ShopView";
import { getRole } from "@/lib/auth";

export default async function Shop() {
  const role = await getRole();
  if (!role) redirect("/login");
  if (role !== "shop") redirect("/");
  return <ShopView />;
}
