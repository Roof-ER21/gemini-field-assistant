# S21 Field Assistant - Component Reference Guide

## Quick Reference for All UI Components

---

## Button Component

**File:** `/components/ui/button.tsx`

### Variants
```tsx
<Button variant="default">Primary Action</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Outlined</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>
```

### Sizes
```tsx
<Button size="default">Default</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Icon /></Button>
```

### Examples
```tsx
// Primary submit button
<Button type="submit" className="shadow-lg shadow-red-600/30">
  Send Message
</Button>

// Icon button for voice input
<Button variant="secondary" size="icon">
  <Mic className="h-5 w-5" />
</Button>

// Loading state
<Button disabled>
  {isLoading ? <Spinner /> : 'Submit'}
</Button>
```

---

## Card Component

**File:** `/components/ui/card.tsx`

### Structure
```tsx
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter
} from './components/ui/card';

<Card className="bg-zinc-800/30 border-zinc-800">
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Optional description</CardDescription>
  </CardHeader>
  <CardContent>
    Main content goes here
  </CardContent>
  <CardFooter>
    Optional footer content
  </CardFooter>
</Card>
```

### Use Cases

#### Document Card
```tsx
<Card
  className={`cursor-pointer transition-all hover:scale-[1.02] ${
    isSelected
      ? 'bg-gradient-to-br from-red-600 to-red-700 shadow-lg'
      : 'bg-zinc-800/30 hover:bg-zinc-800/50'
  }`}
  onClick={handleClick}
>
  <CardContent className="p-3">
    <div className="flex items-center gap-3">
      <Icon />
      <div>
        <div className="font-medium text-sm">{name}</div>
        <div className="text-xs text-zinc-500">{category}</div>
      </div>
    </div>
  </CardContent>
</Card>
```

#### Content Display Card
```tsx
<Card className="mb-6 bg-zinc-800/30 border-zinc-800">
  <CardHeader>
    <CardTitle className="text-2xl">{title}</CardTitle>
    <Badge variant="default">{category}</Badge>
  </CardHeader>
  <CardContent>
    <div className="whitespace-pre-wrap text-zinc-300 leading-relaxed">
      {content}
    </div>
  </CardContent>
</Card>
```

---

## Badge Component

**File:** `/components/ui/badge.tsx`

### Variants
```tsx
<Badge variant="default">Active</Badge>
<Badge variant="secondary">Info</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="outline">Neutral</Badge>
<Badge variant="success">Success</Badge>
<Badge variant="warning">Warning</Badge>
```

### Examples
```tsx
// Provider status
<Badge variant="success">{currentProvider}</Badge>

// Document count
<Badge variant="secondary">{documents.length}</Badge>

// Match percentage
<Badge variant="default" className="text-xs">
  {(relevance * 100).toFixed(0)}% match
</Badge>

// File type
<Badge variant="outline" className="text-xs">
  {fileType.toUpperCase()}
</Badge>
```

---

## Input & Textarea Components

**Files:** `/components/ui/input.tsx`, `/components/ui/textarea.tsx`

### Input
```tsx
import { Input } from './components/ui/input';

// Basic text input
<Input
  type="text"
  placeholder="Enter text..."
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>

// With icon
<div className="relative">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
  <Input
    placeholder="Search..."
    className="pl-10"
  />
</div>

// Styled input
<Input
  className="h-12 bg-zinc-800/50 border-zinc-700 focus:border-red-600"
  disabled={isLoading}
/>
```

### Textarea
```tsx
import { Textarea } from './components/ui/textarea';

<Textarea
  placeholder="Enter longer text..."
  rows={4}
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>
```

---

## Tabs Component

**File:** `/components/ui/tabs.tsx`

### Basic Usage
```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';

<Tabs defaultValue="tab1">
  <TabsList>
    <TabsTrigger value="tab1">Tab 1</TabsTrigger>
    <TabsTrigger value="tab2">Tab 2</TabsTrigger>
    <TabsTrigger value="tab3">Tab 3</TabsTrigger>
  </TabsList>

  <TabsContent value="tab1">
    Content for tab 1
  </TabsContent>

  <TabsContent value="tab2">
    Content for tab 2
  </TabsContent>

  <TabsContent value="tab3">
    Content for tab 3
  </TabsContent>
</Tabs>
```

### Controlled Tabs
```tsx
const [activeTab, setActiveTab] = useState('tab1');

<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList className="w-full grid grid-cols-3">
    <TabsTrigger value="all">All</TabsTrigger>
    <TabsTrigger value="sales">Sales</TabsTrigger>
    <TabsTrigger value="guides">Guides</TabsTrigger>
  </TabsList>

  <TabsContent value="all">
    {/* All content */}
  </TabsContent>
</Tabs>
```

---

## ScrollArea Component

**File:** `/components/ui/scroll-area.tsx`

### Usage
```tsx
import { ScrollArea } from './components/ui/scroll-area';

// Vertical scrolling
<ScrollArea className="h-96 scrollbar-thin scrollbar-track-zinc-900 scrollbar-thumb-zinc-700">
  {/* Long content */}
</ScrollArea>

// Horizontal scrolling
<ScrollArea orientation="horizontal" className="w-full">
  {/* Wide content */}
</ScrollArea>

// Full height with custom styling
<ScrollArea className="flex-1 p-6 scrollbar-thin scrollbar-track-zinc-900 scrollbar-thumb-zinc-700">
  {children}
</ScrollArea>
```

---

## Separator Component

**File:** `/components/ui/separator.tsx`

### Usage
```tsx
import { Separator } from './components/ui/separator';

// Horizontal separator (default)
<Separator />

// Vertical separator
<div className="flex items-center gap-3">
  <span>Item 1</span>
  <Separator orientation="vertical" className="h-4" />
  <span>Item 2</span>
</div>

// Custom styling
<Separator className="my-6 bg-zinc-800/50" />

// Non-decorative (accessibility)
<Separator decorative={false} />
```

---

## Avatar Component

**File:** `/components/ui/avatar.tsx`

### Usage
```tsx
import { Avatar, AvatarImage, AvatarFallback } from './components/ui/avatar';

// With image
<Avatar>
  <AvatarImage src="/avatar.jpg" alt="User" />
  <AvatarFallback>UN</AvatarFallback>
</Avatar>

// Fallback only
<Avatar>
  <AvatarFallback className="bg-red-600 text-white">
    S21
  </AvatarFallback>
</Avatar>

// Custom size
<Avatar className="h-12 w-12">
  <AvatarFallback>AI</AvatarFallback>
</Avatar>
```

---

## Alert Component

**File:** `/components/ui/alert.tsx`

### Variants
```tsx
import { Alert, AlertTitle, AlertDescription } from './components/ui/alert';

// Default
<Alert>
  <AlertTitle>Note</AlertTitle>
  <AlertDescription>This is an informational message.</AlertDescription>
</Alert>

// Destructive (error)
<Alert variant="destructive">
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>Something went wrong.</AlertDescription>
</Alert>

// Success
<Alert variant="success">
  <AlertTitle>Success</AlertTitle>
  <AlertDescription>Operation completed successfully.</AlertDescription>
</Alert>

// Warning
<Alert variant="warning">
  <AlertTitle>Warning</AlertTitle>
  <AlertDescription>Please proceed with caution.</AlertDescription>
</Alert>
```

### With Icon
```tsx
<Alert variant="destructive">
  <AlertCircle className="h-4 w-4" />
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>
    Failed to load data. Please try again.
  </AlertDescription>
</Alert>
```

---

## Common Patterns

### Panel Header
```tsx
<div className="p-6 border-b border-zinc-800/50">
  <div className="flex items-center space-x-3 mb-4">
    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-lg shadow-red-600/30">
      <Icon className="h-5 w-5 text-white" />
    </div>
    <div>
      <h1 className="text-2xl font-bold text-white">Panel Title</h1>
      <p className="text-xs text-zinc-400">Panel description</p>
    </div>
  </div>
</div>
```

### Search Bar
```tsx
<div className="flex gap-2">
  <div className="flex-1 relative">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
    <Input
      placeholder="Search..."
      className="pl-10 h-11 bg-zinc-800/50 border-zinc-700"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
    />
  </div>
  <Button className="h-11 px-6 shadow-lg shadow-red-600/30">
    <Search className="h-4 w-4 mr-2" /> Search
  </Button>
</div>
```

### Message Bubble
```tsx
<div className={`flex items-end ${isUser ? 'justify-end' : 'justify-start'}`}>
  <div
    className={`max-w-lg px-5 py-3 rounded-2xl shadow-lg transition-all hover:scale-[1.01] ${
      isUser
        ? 'bg-gradient-to-br from-red-600 to-red-700 text-white shadow-red-600/20'
        : 'bg-zinc-800/80 backdrop-blur-sm text-zinc-100 border border-zinc-700/50'
    }`}
  >
    <p className="whitespace-pre-wrap leading-relaxed text-sm">{message}</p>
  </div>
</div>
```

### Footer Stats
```tsx
<div className="p-4 border-t border-zinc-800/50 bg-zinc-900/50 backdrop-blur-sm">
  <div className="flex items-center gap-3 text-xs text-zinc-500">
    <div className="flex items-center gap-1">
      <FileText className="h-3 w-3" />
      <span>{count} items</span>
    </div>
    <Separator orientation="vertical" className="h-3" />
    <Badge variant="outline" className="text-xs">Feature 1</Badge>
    <Separator orientation="vertical" className="h-3" />
    <Badge variant="outline" className="text-xs">Feature 2</Badge>
  </div>
</div>
```

### Loading State
```tsx
{loading ? (
  <div className="flex items-center justify-center h-full">
    <Spinner />
  </div>
) : (
  <div>Content</div>
)}
```

### Empty State
```tsx
<div className="flex items-center justify-center h-full">
  <div className="text-center">
    <div className="h-20 w-20 mx-auto mb-4 rounded-full bg-zinc-800 flex items-center justify-center">
      <Icon className="h-10 w-10 text-zinc-600" />
    </div>
    <h3 className="text-xl font-semibold text-white mb-2">No items found</h3>
    <p className="text-sm text-zinc-500">Try searching or adding new items</p>
    <Badge variant="outline" className="mt-4">Powered by AI</Badge>
  </div>
</div>
```

---

## Styling Utilities

### Glassmorphism
```tsx
className="backdrop-blur-xl bg-zinc-900/30 border border-zinc-800/50"
```

### Gradient Background
```tsx
className="bg-gradient-to-br from-red-600 to-red-700"
```

### Gradient Text
```tsx
className="bg-gradient-to-r from-red-500 to-red-600 bg-clip-text text-transparent"
```

### Shadow with Color
```tsx
className="shadow-lg shadow-red-600/30"
```

### Hover Effects
```tsx
className="transition-all duration-200 hover:scale-[1.02]"
```

### Custom Scrollbar
```tsx
className="scrollbar-thin scrollbar-track-zinc-900 scrollbar-thumb-zinc-700"
```

---

## Color Reference

### Background Colors
- `bg-zinc-950` - Darkest background
- `bg-zinc-900` - Primary background
- `bg-zinc-800` - Secondary background
- `bg-zinc-800/30` - Transparent background (30% opacity)
- `bg-zinc-800/50` - Semi-transparent background

### Text Colors
- `text-white` - Primary text
- `text-zinc-100` - High emphasis
- `text-zinc-200` - Medium emphasis
- `text-zinc-400` - Low emphasis
- `text-zinc-500` - Disabled/placeholder

### Border Colors
- `border-zinc-800` - Primary border
- `border-zinc-700` - Lighter border
- `border-zinc-800/50` - Transparent border

### Accent Colors
- `bg-red-600` - Primary accent
- `bg-red-700` - Darker accent
- `text-red-400` - Red text
- `text-red-500` - Lighter red text

---

## Icon Usage (Lucide React)

### Common Icons
```tsx
import {
  MessageSquare,  // Chat
  BookOpen,       // Knowledge
  Image,          // Image analysis
  Mic,            // Voice/Audio
  Mail,           // Email
  MapPin,         // Location
  Radio,          // Live
  Search,         // Search
  FileText,       // Document
  Presentation,   // Slides
  FileSpreadsheet,// Spreadsheet
  File,           // Generic file
  Sparkles,       // AI/Magic
  Settings,       // Settings
  User,           // User
  Check,          // Confirmation
  X,              // Close
  ChevronRight,   // Navigation
  AlertCircle     // Alert
} from 'lucide-react';
```

### Standard Sizes
```tsx
<Icon className="h-4 w-4" /> // Small (16px)
<Icon className="h-5 w-5" /> // Medium (20px)
<Icon className="h-6 w-6" /> // Large (24px)
<Icon className="h-10 w-10" /> // Extra large (40px)
```

---

## Best Practices

1. **Consistent Spacing:** Use standard padding (p-3, p-4, p-6) and gaps (gap-2, gap-3)
2. **Hover States:** Always include hover effects for interactive elements
3. **Focus States:** Maintain focus rings for accessibility
4. **Loading States:** Show spinners or skeleton loaders during async operations
5. **Empty States:** Provide helpful empty states with icons and descriptions
6. **Color Contrast:** Ensure sufficient contrast for readability
7. **Responsive Design:** Consider mobile/tablet layouts
8. **Animations:** Keep animations smooth and purposeful (duration-200)
9. **Shadows:** Use shadows consistently for depth hierarchy
10. **Icons:** Use Lucide React icons with standard sizes

---

## Performance Tips

1. Use `transition-all` sparingly (prefer specific properties)
2. Leverage GPU acceleration with `transform` and `opacity`
3. Avoid excessive nesting
4. Use `backdrop-filter` judiciously (can be expensive)
5. Memoize expensive components
6. Optimize image sizes
7. Use CSS animations over JavaScript when possible

---

## Accessibility Checklist

- [ ] All interactive elements have focus states
- [ ] Color contrast meets WCAG AA standards
- [ ] Icons have descriptive labels or are decorative
- [ ] Buttons have clear labels
- [ ] Forms have proper labels and error messages
- [ ] Keyboard navigation works properly
- [ ] ARIA roles are used where appropriate
- [ ] Screen reader tested

---

This reference guide covers all the UI components and common patterns used in the S21 Field Assistant. Use it as a quick reference when building new features or modifying existing ones.
