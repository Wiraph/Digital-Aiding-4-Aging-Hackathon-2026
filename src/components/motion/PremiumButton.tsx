import { forwardRef, type ReactNode } from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { INTERACTION_TRANSITION, PRESS_TRANSITION, cn } from "./motionConfig";

type PremiumButtonVariant = "primary" | "secondary" | "danger";
type PremiumButtonSize = "sm" | "md" | "lg" | "icon";

type PremiumButtonProps = HTMLMotionProps<"button"> & {
  children?: ReactNode;
  fullWidth?: boolean;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  size?: PremiumButtonSize;
  variant?: PremiumButtonVariant;
};

const variantClass: Record<PremiumButtonVariant, string> = {
  danger: "lux-button--danger",
  primary: "lux-button--primary",
  secondary: "lux-button--secondary",
};

const sizeClass: Record<PremiumButtonSize, string> = {
  icon: "min-h-12 w-12 px-0",
  lg: "min-h-14 px-6 text-base",
  md: "",
  sm: "min-h-10 px-4 text-sm",
};

export const PremiumButton = forwardRef<HTMLButtonElement, PremiumButtonProps>(
  function PremiumButton(
    {
      children,
      className,
      disabled,
      fullWidth = false,
      isLoading = false,
      leftIcon,
      rightIcon,
      size = "md",
      type = "button",
      variant = "primary",
      ...props
    },
    ref,
  ) {
    const reduceMotion = Boolean(useReducedMotion());
    const isDisabled = Boolean(disabled || isLoading);
    const hoverState =
      isDisabled || reduceMotion
        ? undefined
        : {
            filter: "brightness(1.025) saturate(1.035)",
            scale: 1.012,
            y: -1,
          };
    const tapState =
      isDisabled || reduceMotion
        ? undefined
        : {
            filter: "brightness(0.98)",
            scale: 0.98,
            y: 0,
            transition: PRESS_TRANSITION,
          };

    return (
      <motion.button
        ref={ref}
        aria-busy={isLoading || undefined}
        className={cn(
          "lux-button",
          "framer-motion-button",
          variantClass[variant],
          sizeClass[size],
          fullWidth && "w-full",
          className,
        )}
        disabled={isDisabled}
        transition={INTERACTION_TRANSITION}
        type={type}
        whileHover={hoverState}
        whileTap={tapState}
        {...props}
      >
        {isLoading ? (
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-current opacity-70" />
        ) : (
          leftIcon
        )}
        {children}
        {rightIcon}
      </motion.button>
    );
  },
);
