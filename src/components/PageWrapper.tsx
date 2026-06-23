import type { ReactNode } from "react";
import { PageTransition } from "./motion/PageTransition";

type PageWrapperProps = {
  children: ReactNode;
  className?: string;
};

export function PageWrapper({ children, className }: PageWrapperProps) {
  return <PageTransition className={className}>{children}</PageTransition>;
}
