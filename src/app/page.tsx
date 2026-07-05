import { redirect } from "next/navigation";

// TODO(M2): redirect authenticated users to their first store, others to /login.
export default function Home() {
  redirect("/s/demo");
}
