import { redirect } from "next/navigation";

// Katalog jasa digabung ke /persediaan/daftar (filter Jenis = Jasa).
export default function JasaRedirect() {
  redirect("/persediaan/daftar?jenis=jasa");
}
