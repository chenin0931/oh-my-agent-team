import Link from "next/link";
import { useLocale } from "../../i18n";

export function CloudSection() {
  const { t } = useLocale();
  const d = t.download.cloud;

  return (
    <section className="bg-white py-20 text-[#0a0d12] sm:py-24">
      <div className="mx-auto max-w-[720px] px-4 sm:px-6 lg:px-8">
        <h2 className="font-[family-name:var(--font-serif)] text-[2.2rem] leading-[1.1] sm:text-[2.6rem]">
          {d.title}
        </h2>
        <p className="mt-4 max-w-[560px] text-[15px] leading-7 text-[#0a0d12]/72">
          {d.sub}
        </p>

        <Link
          href="/contact-sales"
          className="mt-8 inline-flex h-10 items-center border border-[#0a0d12] bg-[#0a0d12] px-5 text-sm font-medium text-white transition-colors hover:bg-[#2a2d31]"
        >
          {d.cta}
        </Link>
      </div>
    </section>
  );
}
