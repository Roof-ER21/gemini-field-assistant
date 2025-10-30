# S21 Field Assistant - Visual Design Guide

## Color System

### Primary Colors
```
Red Primary:    #dc2626 (rgb(220, 38, 38))
Red Secondary:  #ef4444 (rgb(239, 68, 68))
Red Dark:       #7f1d1d (rgb(127, 29, 29))
Red Light:      #f87171 (rgb(248, 113, 113))
```

### Background Colors
```
Zinc 950:       #09090b (deepest background)
Zinc 900:       #18181b (primary background)
Zinc 800:       #27272a (card backgrounds)
Zinc 700:       #3f3f46 (borders, dividers)
```

### Text Colors
```
White:          #ffffff (primary text)
Zinc 300:       #d4d4d8 (secondary text)
Zinc 400:       #a1a1aa (tertiary text)
Zinc 500:       #71717a (muted text)
Zinc 600:       #52525b (subtle text)
```

### Accent Colors
```
Yellow 400:     #facc15 (sparkle accents)
Blue 500:       #3b82f6 (info accents)
Green 400:      #4ade80 (success indicators)
Red 400:        #f87171 (error states, bot accents)
```

## Typography

### Font Stack
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto',
             'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans',
             'Droid Sans', 'Helvetica Neue', sans-serif;
```

### Font Sizes
```
xs:   0.75rem (12px)  - Labels, badges
sm:   0.875rem (14px) - Secondary text, message content
base: 1rem (16px)     - Primary text
lg:   1.125rem (18px) - Subheadings
xl:   1.25rem (20px)  - Card titles
2xl:  1.5rem (24px)   - Section headers
3xl:  1.875rem (30px) - Page titles
6xl:  3.75rem (60px)  - Hero headings
7xl:  4.5rem (72px)   - Main hero
```

### Font Weights
```
Regular:  400 - Body text
Medium:   500 - Emphasized text
Semibold: 600 - Subheadings
Bold:     700 - Headings, buttons
```

## Spacing System

### Gap/Padding Scale (Tailwind)
```
1:   0.25rem (4px)
2:   0.5rem (8px)
3:   0.75rem (12px)
4:   1rem (16px)
5:   1.25rem (20px)
6:   1.5rem (24px)
8:   2rem (32px)
12:  3rem (48px)
16:  4rem (64px)
```

## Border Radius

### Rounding Scale
```
rounded-lg:   0.5rem (8px)  - Small cards
rounded-xl:   0.75rem (12px) - Buttons, inputs
rounded-2xl:  1rem (16px)    - Message bubbles
rounded-3xl:  1.5rem (24px)  - Hero elements
```

## Shadow System

### Standard Shadows
```css
/* Small shadow - Subtle depth */
box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1),
            0 1px 2px -1px rgb(0 0 0 / 0.1);

/* Medium shadow - Cards, panels */
box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1),
            0 2px 4px -2px rgb(0 0 0 / 0.1);

/* Large shadow - Modals, important elements */
box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1),
            0 4px 6px -4px rgb(0 0 0 / 0.1);

/* XL shadow - Floating elements */
box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1),
            0 8px 10px -6px rgb(0 0 0 / 0.1);

/* 2XL shadow - Hero elements */
box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
```

### Colored Shadows (Red Accent)
```css
/* Red glow - Buttons */
box-shadow: 0 0 20px rgba(220, 38, 38, 0.3);

/* Red shadow - Active states */
box-shadow: 0 10px 20px -5px rgba(220, 38, 38, 0.3),
            0 4px 6px -2px rgba(220, 38, 38, 0.2);
```

## Glassmorphism Formula

### Standard Glass Card
```css
background: rgba(39, 39, 42, 0.7);          /* 70% opaque zinc-800 */
backdrop-filter: blur(12px);                /* Frosted glass effect */
-webkit-backdrop-filter: blur(12px);        /* Safari support */
border: 1px solid rgba(63, 63, 70, 0.5);   /* 50% opaque border */
box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37); /* Depth shadow */
```

### Variants

#### Strong Glass (More Blur)
```css
background: rgba(39, 39, 42, 0.5);
backdrop-filter: blur(24px);
-webkit-backdrop-filter: blur(24px);
border: 1px solid rgba(63, 63, 70, 0.3);
```

#### Subtle Glass (Less Blur)
```css
background: rgba(39, 39, 42, 0.8);
backdrop-filter: blur(8px);
-webkit-backdrop-filter: blur(8px);
border: 1px solid rgba(63, 63, 70, 0.6);
```

### Shine Overlay
```css
/* Add this as a pseudo-element on top */
.glass-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.05) 0%,
    transparent 50%
  );
  border-radius: inherit;
  pointer-events: none;
}
```

## Gradient System

### Background Gradients
```css
/* Primary red gradient */
background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);

/* Dark background gradient */
background: linear-gradient(to bottom right, #18181b, #27272a, #18181b);

/* Animated gradient background */
background: linear-gradient(-45deg, #18181b, #27272a, #18181b, #09090b);
background-size: 400% 400%;
animation: gradientShift 15s ease infinite;
```

### Text Gradients
```css
/* Red gradient text */
background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
background-clip: text;

/* White to gray gradient */
background: linear-gradient(to right, #ffffff, #d4d4d8);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
background-clip: text;
```

### Border Gradients
```css
border: 1px solid transparent;
background:
  linear-gradient(#18181b, #18181b) padding-box,
  linear-gradient(135deg, #dc2626, #7f1d1d) border-box;
```

## Animation Timing

### Durations
```
Fast:     150-200ms  - Hover states, quick transitions
Standard: 300-400ms  - Most UI transitions
Slow:     500-800ms  - Page transitions, reveals
Very Slow: 1-2s      - Background animations, ambient effects
```

### Easing Functions
```
ease:           Standard easing
ease-in-out:    Smooth start and end
ease-out:       Quick start, slow end (good for entrances)
ease-in:        Slow start, quick end (good for exits)
cubic-bezier:   Custom curves for unique effects
```

### Spring Physics (Framer Motion)
```javascript
{
  type: 'spring',
  stiffness: 260,  // Snappiness (higher = more bouncy)
  damping: 20      // Friction (lower = more bounce)
}
```

## Component Anatomy

### Message Bubble Structure
```
┌─────────────────────────────────────┐
│ [Avatar]  ┌────────────────────┐   │
│           │ Message Content    │   │ ← Glassmorphism
│           │ with text...       │   │   + Shadow
│           └────────────────────┘   │
│             [timestamp]            │
└─────────────────────────────────────┘
```

### Glass Card Structure
```
┌─────────────────────────────────────┐
│ ╔═══════════════════════════════╗  │ ← Gradient border
│ ║ [Icon] Title        [Badge]   ║  │
│ ║                               ║  │
│ ║ Description text here...      ║  │ ← Blur backdrop
│ ║                               ║  │   + Shine overlay
│ ╚═══════════════════════════════╝  │
│           ▂▂▂▂▂                    │ ← Hover accent
└─────────────────────────────────────┘
```

## Icon System

### Icon Sizes
```
xs:    12px (h-3 w-3)   - Inline icons
sm:    16px (h-4 w-4)   - Small buttons
base:  20px (h-5 w-5)   - Standard icons
lg:    24px (h-6 w-6)   - Feature icons
xl:    32px (h-8 w-8)   - Large icons
2xl:   48px (h-12 w-12) - Hero icons
```

### Icon Colors & Effects
```css
/* Primary icons */
color: #f87171; /* red-400 */
stroke-width: 2;

/* With glow */
color: #f87171;
filter: drop-shadow(0 0 8px rgba(248, 113, 113, 0.5));

/* Animated pulse */
animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
```

## States & Interactions

### Button States
```css
/* Default */
background: linear-gradient(to right, #dc2626, #ef4444);
box-shadow: 0 10px 20px -5px rgba(220, 38, 38, 0.3);

/* Hover */
transform: scale(1.05);
box-shadow: 0 15px 30px -5px rgba(220, 38, 38, 0.4);

/* Active/Pressed */
transform: scale(0.95);
box-shadow: 0 5px 10px -2px rgba(220, 38, 38, 0.3);

/* Disabled */
opacity: 0.5;
cursor: not-allowed;
pointer-events: none;
```

### Card States
```css
/* Default */
transform: translateY(0);
box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);

/* Hover */
transform: translateY(-4px);
box-shadow: 0 12px 24px 0 rgb(0 0 0 / 0.3);

/* Active */
transform: scale(0.98);
```

## Responsive Breakpoints

### Mobile First Approach
```css
/* Mobile (default) */
.container { padding: 1rem; }

/* Tablet (md: 768px) */
@media (min-width: 768px) {
  .container { padding: 1.5rem; }
}

/* Desktop (lg: 1024px) */
@media (min-width: 1024px) {
  .container { padding: 2rem; }
}

/* Large Desktop (xl: 1280px) */
@media (min-width: 1280px) {
  .container { padding: 3rem; }
}
```

### Component Scaling
```
Mobile:     Single column, compact spacing
Tablet:     Two columns, medium spacing
Desktop:    Multi-column, generous spacing
Ultra-wide: Max-width constraints (1536px)
```

## Accessibility

### Focus States
```css
/* Standard focus ring */
outline: 2px solid #dc2626;
outline-offset: 2px;

/* Custom focus (preferred) */
box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.5);
```

### Contrast Ratios
```
White on Zinc-900:  15.4:1 ✅ AAA
White on Red-600:   4.9:1  ✅ AA
Zinc-400 on Zinc-900: 7.6:1 ✅ AAA
Red-400 on Zinc-900: 5.2:1  ✅ AA
```

### Motion Preferences
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Best Practices

### Performance
1. Use `transform` and `opacity` for animations (GPU-accelerated)
2. Avoid animating `width`, `height`, `top`, `left` (causes reflow)
3. Use `will-change` sparingly on animated elements
4. Implement lazy loading for heavy components

### Visual Hierarchy
1. Largest/boldest: Primary actions, main headings
2. Medium: Secondary content, subheadings
3. Smallest/lightest: Tertiary info, labels

### Spacing
1. Use consistent multiples of 4px or 8px
2. Increase spacing between unrelated groups
3. Reduce spacing within related groups

### Color Usage
1. Limit accent colors (primarily red)
2. Maintain consistent background hierarchy
3. Use color to indicate state and importance
4. Ensure sufficient contrast for readability

---

**Note**: This guide uses Tailwind CSS utility classes and modern CSS features. Ensure browser compatibility with your target audience.
