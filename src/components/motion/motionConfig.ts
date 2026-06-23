import type { Transition } from "framer-motion";

export const LUXURY_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const PAGE_TRANSITION: Transition = {
  duration: 0.58,
  ease: LUXURY_EASE,
};

export const CARD_TRANSITION: Transition = {
  duration: 0.5,
  ease: LUXURY_EASE,
};

export const INTERACTION_TRANSITION: Transition = {
  duration: 0.22,
  ease: LUXURY_EASE,
};

export const PRESS_TRANSITION: Transition = {
  duration: 0.12,
  ease: LUXURY_EASE,
};

export const REDUCED_MOTION_TRANSITION: Transition = {
  duration: 0.12,
  ease: "linear",
};

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
