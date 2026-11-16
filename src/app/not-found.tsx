import { Header } from "@/components/header";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
      <Header />
      <main className="pt-8">
        <h1 className="text-4xl font-semibold tracking-tight">404</h1>
        <p className="mt-1 text-ink-2">Nothing at this address</p>
      </main>
    </div>
  );
}
