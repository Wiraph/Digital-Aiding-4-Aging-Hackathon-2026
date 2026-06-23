import { forwardRef, type KeyboardEvent, type ReactNode } from "react";
import { motion, useReducedMotion, type HTMLMotionProps, type Variants } from "framer-motion";
import {
  CARD_TRANSITION,
  INTERACTION_TRANSITION,
  PRESS_TRANSITION,
  REDUCED_MOTION_TRANSITION,
  cn,
} from "./motionConfig";

type AnimatedBentoCardProps = HTMLMotionProps<"section"> & {
  children: ReactNode;
  hoverable?: boolean;
  interactive?: boolean;
};

const cardVariants: Variants = {
  hidden: (reduceMotion: boolean) => ({
    opacity: 0,
    scale: reduceMotion ? 1 : 0.985,
    y: reduceMotion ? 0 : 18,
  }),
  visible: (reduceMotion: boolean) => ({
    opacity: 1,
    scale: 1,
    y: 0,
    transition: reduceMotion ? REDUCED_MOTION_TRANSITION : CARD_TRANSITION,
  }),
};

export const AnimatedBentoCard = forwardRef<HTMLElement, AnimatedBentoCardProps>(
  function AnimatedBentoCard(
    {
      children,
      className,
      hoverable = true,
      interactive,
      onClick,
      onKeyDown,
      role,
      style,
      tabIndex,
      ...props
    },
    ref,
  ) {
    const reduceMotion = Boolean(useReducedMotion());
    const isInteractive = Boolean(interactive || onClick);
    const hoverState =
      hoverable && !reduceMotion
        ? {
            boxShadow: "0 8px 14px rgba(42, 58, 98, 0.14)",
            filter: "brightness(1.018)",
            scale: 1.012,
            y: -2,
          }
        : hoverable
          ? { filter: "brightness(1.018)" }
          : undefined;
    const tapState =
      isInteractive && !reduceMotion
        ? { filter: "brightness(0.985)", scale: 0.98, y: 0 }
        : isInteractive
          ? { filter: "brightness(0.985)" }
          : undefined;
    const mergedStyle: HTMLMotionProps<"section">["style"] = {
      transformOrigin: "center",
      ...style,
    };

    function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
      onKeyDown?.(event);
      if (event.defaultPrevented || !isInteractive || !onClick) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.currentTarget.click();
      }
    }

    return (
      <motion.section
        ref={ref}
        className={cn("bento-card", isInteractive && "cursor-pointer", className)}
        custom={reduceMotion}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        role={isInteractive ? (role ?? "button") : role}
        style={mergedStyle}
        tabIndex={isInteractive ? (tabIndex ?? 0) : tabIndex}
        transition={INTERACTION_TRANSITION}
        variants={cardVariants}
        whileHover={hoverState}
        whileTap={tapState ? { ...tapState, transition: PRESS_TRANSITION } : undefined}
        {...props}
      >
        {children}
      </motion.section>
    );
  },
);
