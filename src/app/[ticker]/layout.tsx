import { Header } from "@/components/header";

export default function TickerLayout({ children }: LayoutProps<"/[ticker]">) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16 sm:px-6">
      <Header />
      <main>{children}</main>
    </div>
  );
}
