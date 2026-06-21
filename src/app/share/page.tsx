import Link from "next/link";

type SharePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function SharePage({ searchParams }: SharePageProps) {
  const params = (await searchParams) ?? {};
  const title = firstParam(params.title);
  const text = firstParam(params.text);
  const url = firstParam(params.url);
  const sharedContent = [title, text, url].filter(Boolean);

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-[#0A0A0E] px-5 py-10 text-white">
      <section className="mx-auto flex min-h-[520px] w-full max-w-md flex-col justify-center">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-[#8B6CFF]">
          NightVibe
        </p>
        <h1 className="font-display mt-4 text-3xl font-semibold tracking-normal text-white">
          Shared to NightVibe
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/70">
          Your shared link is ready. Head back to the map to find the right spot for tonight.
        </p>

        {sharedContent.length > 0 && (
          <div className="mt-8 rounded-lg border border-white/10 bg-white/[0.04] p-4">
            {title && <p className="text-sm font-semibold text-white">{title}</p>}
            {text && <p className="mt-2 text-sm leading-6 text-white/70">{text}</p>}
            {url && (
              <p className="mt-3 break-words text-xs font-medium text-[#8B6CFF]">
                {url}
              </p>
            )}
          </div>
        )}

        <Link
          href="/map"
          className="mt-8 inline-flex h-12 items-center justify-center rounded-md bg-[#8B6CFF] px-5 text-sm font-semibold text-[#0A0A0E] transition hover:bg-[#A896FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Open map
        </Link>
      </section>
    </div>
  );
}
