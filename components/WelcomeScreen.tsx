import React from 'react';
import { motion, type Variants } from 'framer-motion';
import {
  Brain,
  Zap,
  Shield,
  Globe,
  Database,
  Sparkles,
  MessageSquare,
  BookOpen,
  Image as ImageIcon,
  Mic,
  Mail,
  MapPin,
  Radio,
  ArrowRight,
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Card } from './ui/card';

interface WelcomeScreenProps {
  onGetStarted?: () => void;
}

// Simple fallback component in case of rendering issues
const SimpleFallback: React.FC<WelcomeScreenProps> = ({ onGetStarted }) => (
  <div className="h-full flex items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-8">
    <div className="text-center space-y-6 max-w-2xl">
      <div className="h-24 w-24 mx-auto rounded-3xl bg-gradient-to-br from-red-600 via-red-600 to-red-700 flex items-center justify-center shadow-2xl shadow-red-600/50">
        <Sparkles className="h-12 w-12 text-white" strokeWidth={2} />
      </div>
      <h1 className="text-5xl font-bold bg-gradient-to-r from-red-500 via-red-600 to-red-700 bg-clip-text text-transparent">
        S21 Field Assistant
      </h1>
      <p className="text-xl text-zinc-400 max-w-lg mx-auto">
        Your premium AI-powered roofing assistant with advanced capabilities
      </p>
      <button
        onClick={onGetStarted}
        className="inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-bold shadow-2xl shadow-red-600/30 hover:shadow-red-600/50 transition-all duration-300"
      >
        <MessageSquare className="h-5 w-5" />
        <span>Start Chatting</span>
        <ArrowRight className="h-5 w-5" />
      </button>
    </div>
  </div>
);

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onGetStarted }) => {
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    // Catch any rendering errors
    const handleError = () => setHasError(true);
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return <SimpleFallback onGetStarted={onGetStarted} />;
  }
  const features = [
    {
      icon: Brain,
      title: 'Multi-Provider AI',
      description: 'Seamlessly switch between multiple AI providers for optimal responses',
      color: 'from-blue-500 to-cyan-500',
      badge: 'Smart',
    },
    {
      icon: Database,
      title: 'RAG Knowledge Base',
      description: 'Enhanced responses using your custom roofing knowledge base',
      color: 'from-purple-500 to-pink-500',
      badge: 'RAG',
    },
    {
      icon: Shield,
      title: 'Enterprise Security',
      description: 'Bank-level encryption and secure API handling',
      color: 'from-red-500 to-orange-500',
      badge: 'Secure',
    },
    {
      icon: Zap,
      title: 'Lightning Fast',
      description: 'Optimized for speed with local and cloud processing',
      color: 'from-yellow-500 to-amber-500',
      badge: 'Fast',
    },
  ];

  const capabilities = [
    { icon: MessageSquare, label: 'AI Chat', count: '24/7' },
    { icon: BookOpen, label: 'Knowledge Base', count: '1000+' },
    { icon: ImageIcon, label: 'Image Analysis', count: 'Unlimited' },
    { icon: Mic, label: 'Voice Transcription', count: 'Real-time' },
    { icon: Mail, label: 'Email Generation', count: 'Smart' },
    { icon: MapPin, label: 'Maps Integration', count: 'Live' },
    { icon: Radio, label: 'Live Conversation', count: 'Active' },
  ];

  const containerVariants: Variants = {
    hidden: { opacity: 1 }, // Changed from 0 to 1 for immediate visibility
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 1, y: 0 }, // Changed for immediate visibility
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 260,
        damping: 20,
      },
    },
  };

  return (
    <div className="h-full overflow-y-auto">
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        variants={containerVariants}
        className="max-w-6xl mx-auto p-8 lg:p-12 space-y-12"
      >
        {/* Hero Section */}
        <motion.div variants={itemVariants} className="text-center space-y-6 py-12">
          {/* Animated Logo/Icon */}
          <motion.div
            animate={{
              scale: [1, 1.05, 1],
              rotate: [0, 5, -5, 0],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="flex justify-center mb-8"
          >
            <div className="relative">
              <div className="h-24 w-24 rounded-3xl bg-gradient-to-br from-red-600 via-red-600 to-red-700 flex items-center justify-center shadow-2xl shadow-red-600/30">
                <Sparkles className="h-12 w-12 text-white" strokeWidth={2} />
              </div>
              <motion.div
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.5, 0.8, 0.5],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                className="absolute inset-0 bg-red-500/30 rounded-3xl blur-2xl"
              />
            </div>
          </motion.div>

          {/* Title */}
          <div className="space-y-4 s21-card-glass inline-block text-left">
            <motion.h1 variants={itemVariants} className="s21-header-title">S21 CORE</motion.h1>
            <div className="s21-header-subtitle">Field Assistant</div>
            <motion.p variants={itemVariants} className="text-lg text-[color:var(--s21-text-secondary)] max-w-2xl">
              Your premium AI-powered roofing assistant with advanced capabilities designed for storm restoration professionals.
            </motion.p>
          </div>

          {/* Stats */}
          <motion.div
            variants={itemVariants}
            className="flex flex-wrap justify-center gap-6 mt-8"
          >
            {capabilities.map((cap, index) => {
              const Icon = cap.icon;
              return (
                <motion.div
                  key={cap.label}
                  whileHover={{ scale: 1.05, y: -5 }}
                  className="flex items-center gap-3 px-6 py-3 rounded-xl bg-white border border-zinc-200 shadow-md"
                >
                  <Icon className="h-5 w-5 text-red-500" strokeWidth={2} />
                  <div className="text-left">
                    <div className="text-xs text-zinc-500 font-medium">{cap.label}</div>
                    <div className="text-sm font-bold text-zinc-900">{cap.count}</div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </motion.div>

        {/* Features Grid */}
        <motion.div variants={itemVariants} className="space-y-6">
          <h2 className="text-3xl font-bold text-center text-white">
            Powerful Features
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  variants={itemVariants}
                  whileHover={{ scale: 1.02, y: -5 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <Card className="relative overflow-hidden p-6 s21-card-glass transition-all duration-300 group">
                    {/* Gradient Overlay */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />

                    {/* Content */}
                    <div className="relative z-10 space-y-4">
                      <div className="flex items-start justify-between">
                        <div className={`p-3 rounded-xl bg-gradient-to-br ${feature.color} shadow-lg`}>
                          <Icon className="h-6 w-6 text-white" strokeWidth={2} />
                        </div>
                        <Badge variant="outline" className="text-[10px] text-white/80 border-white/20">
                          {feature.badge}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-bold text-white">{feature.title}</h3>
                        <p className="text-sm text-[color:var(--s21-text-secondary)] leading-relaxed">
                          {feature.description}
                        </p>
                      </div>
                    </div>

                    {/* Hover Effect */}
                    <motion.div
                      className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
                      initial={{ x: '-100%' }}
                      whileHover={{ x: '100%' }}
                      transition={{ duration: 0.6 }}
                    />
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* CTA Section */}
        <motion.div
          variants={itemVariants}
          className="text-center space-y-6 py-12"
        >
          <h3 className="text-2xl font-bold text-white">
            Ready to Get Started?
          </h3>
          <p className="text-[color:var(--s21-text-secondary)] max-w-lg mx-auto">
            Start chatting with S21 and experience the power of multi-provider AI assistance
          </p>
          <motion.button
            onClick={onGetStarted}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-gradient-to-r from-[#e94560] to-[#ff6b88] text-white font-bold shadow-2xl shadow-red-600/30 hover:shadow-red-600/50 transition-all duration-300"
          >
            <MessageSquare className="h-5 w-5" />
            <span>Start Chatting</span>
            <ArrowRight className="h-5 w-5" />
          </motion.button>
        </motion.div>

        {/* Footer Info */}
        <motion.div
          variants={itemVariants}
          className="text-center space-y-3 py-8 border-t border-white/10"
        >
          <p className="text-sm text-white/60">
            Powered by cutting-edge AI technology
          </p>
          <div className="flex justify-center gap-4 text-xs text-white/50">
            <span>OpenAI GPT-4</span>
            <span>•</span>
            <span>Anthropic Claude</span>
            <span>•</span>
            <span>Google Gemini</span>
            <span>•</span>
            <span>Local Ollama</span>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default WelcomeScreen;
