import React, { useState } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { Copy, CheckCheck, User, Bot, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

interface MessageBubbleProps {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp?: Date;
  index: number;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ id, text, sender, timestamp, index }) => {
  const [copied, setCopied] = useState(false);
  const isUser = sender === 'user';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const bubbleVariants: Variants = {
    hidden: {
      opacity: 0,
      y: 20,
      scale: 0.95,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 260,
        damping: 20,
        delay: index * 0.05,
      },
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      transition: { duration: 0.2 },
    },
  };

  const formatTime = (date?: Date) => {
    if (!date) return '';
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <motion.div
      variants={bubbleVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      layout
      className={cn(
        "flex items-end gap-2 md:gap-3 group",
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {/* Bot Avatar */}
      {!isUser && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: index * 0.05 + 0.1 }}
          className="flex-shrink-0 h-9 w-9 md:h-10 md:w-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center shadow-md touch-target"
        >
          <div className="relative">
            <Bot className="h-4 w-4 md:h-5 md:w-5 text-red-500" strokeWidth={2} />
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
      )}

      {/* Message Content */}
      <div className={cn(
        "flex flex-col max-w-[85%] sm:max-w-[75%] lg:max-w-2xl",
        isUser ? 'items-end' : 'items-start'
      )}>
        <motion.div
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className={cn(
            "relative rounded-2xl px-4 py-3 md:px-5 md:py-3.5 shadow-lg transition-all duration-300 tap-feedback touch-target",
            isUser
              ? 'bg-gradient-to-br from-[#e94560] via-[#e94560] to-[#ff6b88] text-white shadow-[rgba(233,69,96,0.2)] border border-red-500/20'
              : 'bg-[rgba(255,255,255,0.03)] text-white border border-white/10'
          )}
        >
          {/* Accent underline for bot messages */}
          {!isUser && (
            <div className="absolute left-3 right-3 -bottom-px h-[2px] bg-gradient-to-r from-transparent via-[#e94560]/50 to-transparent rounded-b-2xl" />
          )}

          {/* Sparkle effect for user messages */}
          {isUser && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.5, delay: index * 0.05 }}
              className="absolute -top-1 -right-1"
            >
              <Sparkles className="h-4 w-4 text-yellow-300" fill="currentColor" />
            </motion.div>
          )}

          <div className="relative z-10">
            <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap font-medium">
              {text}
            </p>
          </div>

          {/* Action buttons - show on hover (desktop) or always visible on mobile */}
          <div className={cn(
            "absolute -top-2 flex items-center gap-1 transition-all duration-200",
            "md:opacity-0 md:group-hover:opacity-100",
            "opacity-100",
            isUser ? '-left-12 md:-left-16' : '-right-12 md:-right-16'
          )}>
            <Button
              size="icon"
              variant="outline"
              onClick={handleCopy}
              className="h-8 w-8 md:h-7 md:w-7 rounded-lg bg-transparent border border-white/20 hover:bg-white/10 text-white shadow-md touch-target"
            >
              {copied ? (
                <CheckCheck className="h-4 w-4 md:h-3.5 md:w-3.5 text-[#10b981]" />
              ) : (
                <Copy className="h-4 w-4 md:h-3.5 md:w-3.5 text-white/80" />
              )}
            </Button>
          </div>
        </motion.div>

        {/* Timestamp */}
        {timestamp && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: index * 0.05 + 0.2 }}
            className="text-[10px] text-zinc-600 mt-1.5 px-2 font-medium"
          >
            {formatTime(timestamp)}
          </motion.span>
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: index * 0.05 + 0.1 }}
          className="flex-shrink-0 h-9 w-9 md:h-10 md:w-10 rounded-xl bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-lg shadow-red-600/30 glow-red-subtle touch-target"
        >
          <User className="h-4 w-4 md:h-5 md:w-5 text-white" strokeWidth={2} />
        </motion.div>
      )}
    </motion.div>
  );
};

export default MessageBubble;
