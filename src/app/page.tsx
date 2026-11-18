import { Logo } from "@/components/header";
import { Search } from "@/components/search";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 pt-[22vh]">
      <h1 className="flex justify-center text-xl">
        <Logo />
      </h1>
      <Search large autoFocus />
    </main>
  );
}
