"use client";

import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

const ease = [0.22, 1, 0.36, 1] as const;

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

type FadeInProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "motion.div" | "motion.section";
};

export function FadeIn({
  children,
  className = "",
  delay = 0,
}: FadeInProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease }}
    >
      {children}
    </motion.div>
  );
}

type StaggerListProps = {
  children: ReactNode;
  className?: string;
};

export function StaggerList({ children, className = "" }: StaggerListProps) {
  return (
    <motion.div
      className={className}
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={fadeInUp}
      transition={{ duration: 0.45, ease }}
    >
      {children}
    </motion.div>
  );
}

export function SlideInSidebar({
  children,
  open,
  className = "",
}: {
  children: ReactNode;
  open: boolean;
  className?: string;
}) {
  return (
    <motion.aside
      className={className}
      initial={false}
      animate={{ x: open ? 0 : "-100%" }}
      transition={{ type: "spring", stiffness: 380, damping: 36 }}
    >
      {children}
    </motion.aside>
  );
}
