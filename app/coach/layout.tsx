import { Suspense } from "react";
import { AiChat } from "@/components/coach/AiChat";

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Suspense>
        <AiChat />
      </Suspense>
    </>
  );
}
