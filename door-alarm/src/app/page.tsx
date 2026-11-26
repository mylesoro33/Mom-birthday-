import { redirect } from "next/navigation";
import { getSessionEmail } from "@/lib/session";

export default async function Home() {
  redirect((await getSessionEmail()) ? "/log" : "/connect");
}
