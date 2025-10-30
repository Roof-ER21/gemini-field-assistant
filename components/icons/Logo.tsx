import React from 'react';
import { Zap } from 'lucide-react';

const Logo = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>((props, ref) => {
  return <Zap ref={ref} {...props} />;
});

Logo.displayName = 'Logo';

export default Logo;
