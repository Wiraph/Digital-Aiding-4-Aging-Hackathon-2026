import { forwardRef, type ReactNode } from "react";
import { motion, useReducedMotion, type HTMLMotionProps, type Variants } from "framer-motion";
import { PAGE_TRANSITION, REDUCED_MOTION_TRANSITION } from "./motionConfig";

type PageTransitionProps = HTMLMotionProps<"div"> & {
  children: ReactNode;
};

const pageVariants: Variants = {
  initial: (reduceMotion: boolean) => ({
    opacity: 0,
    y: reduceMotion ? 0 : 14,
  }),
  animate: (reduceMotion: boolean) => ({
    opacity: 1,
    y: 0,
    transition: reduceMotion ? REDUCED_MOTION_TRANSITION : PAGE_TRANSITION,
  }),
  exit: (reduceMotion: boolean) => ({
    opacity: 0,
    y: reduceMotion ? 0 : -8,
    transition: reduceMotion
      ? REDUCED_MOTION_TRANSITION
      : { ...PAGE_TRANSITION, duration: 0.34 },
  }),
};

export const PageTransition = forwardRef<HTMLDivElement, PageTransitionProps>(
  function PageTransition({ children, style, ...props }, ref) {
    const reduceMotion = useReducedMotion();
    const mergedStyle: HTMLMotionProps<"div">["style"] = {
      minHeight: "100%",
      width: "100%",
      willChange: reduceMotion ? "opacity" : "opacity, transform",
      ...style,
    };

    return (
      <motion.div
        ref={ref}
        animate="animate"
        custom={Boolean(reduceMotion)}
        exit="exit"
        initial="initial"
        style={mergedStyle}
        variants={pageVariants}
        {...props}
      >
        {children}
      </motion.div>
    );
  },
);
