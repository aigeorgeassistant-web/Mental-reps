import { AiChat } from "@/components/coach/AiChat";

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AiChat />
    </>
  );
}
