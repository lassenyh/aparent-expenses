import { notFound } from "next/navigation";
import { PreviewPopup } from "./PreviewPopup";

type Params = { token: string };
type PageProps = { params: Params | Promise<Params> };

export default async function PreviewPage(props: PageProps) {
  const { token } = await props.params;

  if (!token) return notFound();

  return <PreviewPopup token={token} />;
}
