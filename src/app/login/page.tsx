import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string; callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const returnTo = params.return ?? params.callbackUrl ?? "/explore";
  redirect(`/sign-in?return=${encodeURIComponent(returnTo)}`);
}
