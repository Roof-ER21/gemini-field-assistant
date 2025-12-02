import React from 'react';
import { motion, type Transition } from 'framer-motion';
import { Bot, Sparkles } from 'lucide-react';

const TypingIndicator: React.FC = () => {
  const dotVariants = {
    initial: { y: 0 },
    animate: { y: -8 },
  };

  const dotTransition: Transition = {
    duration: 0.5,
    repeat: Infinity,
    repeatType: "reverse",
    ease: "easeInOut",
  };

  return (
    <div className="flex items-end gap-3">
      {/* Bot Avatar */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="flex-shrink-0 h-9 w-9 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700/50 flex items-center justify-center shadow-lg"
      >
        <div className="relative">
          <Bot className="h-5 w-5 text-red-400" strokeWidth={2} />
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute inset-0 bg-red-400/20 rounded-full blur-md"
          />
        </div>
      </motion.div>

      {/* Typing Animation */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative px-5 py-3.5 rounded-2xl bg-gradient-to-br from-zinc-800/90 via-zinc-800/90 to-zinc-900/90 border border-zinc-700/50 shadow-xl backdrop-blur-xl"
      >
        {/* Glassmorphism effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent rounded-2xl pointer-events-none" />

        {/* Typing dots */}
        <div className="relative z-10 flex items-center gap-1.5">
          <motion.div
            variants={dotVariants}
            initial="initial"
            animate="animate"
            transition={{ ...dotTransition, delay: 0 }}
            className="w-2.5 h-2.5 bg-red-400 rounded-full shadow-lg shadow-red-400/50"
          />
          <motion.div
            variants={dotVariants}
            initial="initial"
            animate="animate"
            transition={{ ...dotTransition, delay: 0.15 }}
            className="w-2.5 h-2.5 bg-red-400 rounded-full shadow-lg shadow-red-400/50"
          />
          <motion.div
            variants={dotVariants}
            initial="initial"
            animate="animate"
            transition={{ ...dotTransition, delay: 0.3 }}
            className="w-2.5 h-2.5 bg-red-400 rounded-full shadow-lg shadow-red-400/50"
          />

          {/* Sparkle accent */}
          <motion.div
            animate={{
              opacity: [0, 1, 0],
              scale: [0.8, 1, 0.8],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="ml-1"
          >
            <Sparkles className="h-3 w-3 text-red-400/70" />
          </motion.div>
        </div>

        {/* Shimmer effect */}
        <motion.div
          animate={{
            x: ['-100%', '100%'],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent"
        />
      </motion.div>
    </div>
  );
};

export default TypingIndicator;
