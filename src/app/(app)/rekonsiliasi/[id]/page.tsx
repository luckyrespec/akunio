import { redirect } from "next/navigation";

export default async function RekonsiliasiDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/kas-bank/rekonsiliasi/${id}`);
}
