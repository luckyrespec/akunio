import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ItemRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/persediaan/daftar/${id}`);
}
