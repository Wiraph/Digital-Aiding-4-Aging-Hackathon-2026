import { useMemo, type ReactNode } from "react";
import { motion, useReducedMotion, type HTMLMotionProps, type Variants } from "framer-motion";

type AnimatedBentoContainerProps = Omit<HTMLMotionProps<"div">, "animate" | "initial" | "variants"> & {
  children: ReactNode;
  delayChildren?: number;
  staggerChildren?: number;
};

type StaggerConfig = {
  delayChildren: number;
  reduceMotion: boolean;
  staggerChildren: number;
};

export function AnimatedBentoContainer({
  children,
  delayChildren = 0.08,
  staggerChildren = 0.065,
  style,
  ...props
}: AnimatedBentoContainerProps) {
  const reduceMotion = Boolean(useReducedMotion());
  const variants = useMemo<Variants>(
    () => ({
      hidden: {},
      visible: ({ delayChildren, reduceMotion, staggerChildren }: StaggerConfig) => ({
        transition: reduceMotion
          ? { duration: 0 }
          : {
              delayChildren,
              staggerChildren,
              when: "beforeChildren",
            },
      }),
    }),
    [],
  );
  const mergedStyle: HTMLMotionProps<"div">["style"] = {
    ...style,
  };

  return (
    <motion.div
      animate="visible"
      custom={{ delayChildren, reduceMotion, staggerChildren }}
      initial={reduceMotion ? false : "hidden"}
      style={mergedStyle}
      variants={variants}
      {...props}
    >
      {children}
    </motion.div>
  );
}
