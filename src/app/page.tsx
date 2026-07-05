import { redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/access";
import { listStoresForUser } from "@/data/stores";

export default async function Home() {
  const user = await requireSessionUser();
  const stores = await listStoresForUser(user);
  if (!stores[0]) {
    // Authorized but no store assigned — nothing to show.
    redirect("/login");
  }
  redirect(`/s/${stores[0].id}`);
}
