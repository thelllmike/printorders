import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { getRole } from "@/lib/auth";

export default async function Login() {
  const role = await getRole();
  if (role) redirect(role === "shop" ? "/shop" : "/");
  return <LoginForm />;
}
