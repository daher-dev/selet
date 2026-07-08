import { redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/access";
import { listStoresForUser } from "@/data/stores";
import { NoStoreScreen } from "./no-store-screen";

export default async function Home() {
  const user = await requireSessionUser();
  const stores = await listStoresForUser(user);
  if (!stores[0]) {
    // Authorized but no store assigned — show a friendly dead-end instead of
    // bouncing back to /login (which would redirect here again — an infinite loop).
    return <NoStoreScreen name={user.name} />;
  }
  redirect(`/s/${stores[0].id}`);
}
