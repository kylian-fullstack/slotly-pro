import { CancellationFlow } from "./cancellation-flow";

export default async function CancellationPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ code?: string; token?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  return <CancellationFlow slug={slug} initialCode={query.code ?? ""} initialToken={query.token ?? ""} />;
}
