/**
 * Email Compliance Checker Service
 *
 * Prevents unlicensed public adjuster activity by scanning emails
 * for language that crosses legal boundaries.
 *
 * Legal Context:
 * - Contractors can communicate about CONSTRUCTION/CODE matters
 * - Contractors CANNOT negotiate claims, interpret policies, or act as intermediaries
 * - Violations can result in felony charges (FL), misdemeanors, fines up to $10k
 *
 * @see Maryland Insurance Advisory for Home Improvement Contractors
 * @see Virginia Code § 38.2-1845.12
 */

export interface ComplianceViolation {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  found: string;
  position: { start: number; end: number };
  why: string;
  suggestions: string[];
  example?: { bad: string; good: string };
}

export interface ComplianceResult {
  canSend: boolean;
  score: number; // 0-100, 100 = fully compliant
  violations: ComplianceViolation[];
  warnings: ComplianceViolation[];
  cautions: ComplianceViolation[];
  safePatternCount: number;
  summary: string;
}

// =============================================================================
// CRITICAL VIOLATIONS - Block Email Until Fixed
// =============================================================================

const CRITICAL_VIOLATIONS = [
  {
    id: 'insurance-requirements',
    badPhrases: [
      "insurance companies are required to",
      "insurance carriers are required to",
      "USAA is required to",
      "State Farm is required to",
      "Allstate is required to",
      "your company must",
      "the carrier must",
      "regulations require insurance to",
      "state law requires insurance to",
      "Maryland regulations require insurance companies to",
      "Virginia law requires insurance to",
      "Pennsylvania regulations require insurance to",
      "insurance is obligated to",
      "the insurer must pay",
      "insurance is legally required"
    ],
    why: "You're interpreting insurance regulations - that's unlicensed public adjuster activity. Contractors can only speak to CONSTRUCTION and CODE requirements.",
    goodAlternatives: [
      "Maryland building codes require that contractors",
      "As the licensed contractor, I am required to",
      "Building code regulations require",
      "Code compliance standards require that we",
      "Manufacturer specifications require"
    ],
    example: {
      bad: "Maryland state regulations require insurance companies to account for matching in the event of partial replacement.",
      good: "Maryland building codes require contractors to ensure uniform appearance across roof planes when performing repairs. As the licensed contractor, I cannot perform work that would violate these code requirements."
    }
  },

  {
    id: 'claim-negotiation',
    badPhrases: [
      "we request that the claim be updated",
      "the claim should be revised",
      "please update the claim to reflect",
      "requesting the claim be adjusted to",
      "we request approval for",
      "please approve the claim for",
      "we are requesting that you approve",
      "the claim should include",
      "the claim should cover",
      "the estimate should be revised to",
      "please revise the estimate to include",
      "we need the claim updated"
    ],
    why: "You're negotiating the claim on behalf of the homeowner - that's unlicensed public adjuster activity.",
    goodAlternatives: [
      "Mr./Ms. [Homeowner] has requested a reinspection",
      "Our client has asked us to provide technical documentation",
      "The homeowner has requested that we share",
      "Mr./Ms. [Homeowner] would like to discuss",
      "[Homeowner name] asked that we provide this technical information"
    ],
    example: {
      bad: "We respectfully request that Mr. Palmer's claim be updated to reflect a full roof replacement.",
      good: "Mr. Palmer has requested a reinspection. From a contractor perspective, we wanted to ensure you have complete technical information about the code requirements for this repair."
    }
  },

  {
    id: 'coverage-determination',
    badPhrases: [
      "is warranted",
      "coverage is warranted",
      "replacement is warranted",
      "a full replacement is warranted",
      "payment is warranted",
      "approval is warranted",
      "coverage should be provided",
      "this warrants full coverage",
      "full coverage is justified",
      "the damage warrants"
    ],
    why: "You're determining what insurance coverage should be - that's the insurer's job, not yours.",
    goodAlternatives: [
      "is necessary from a code compliance standpoint",
      "would be required to meet building codes",
      "is necessary to meet manufacturer specifications",
      "is required for a code-compliant repair",
      "is necessary to maintain warranty coverage"
    ],
    example: {
      bad: "Given the extensive nature of the documented damage, a full roof replacement is warranted.",
      good: "Given the extensive nature of the documented damage, a full roof replacement is necessary to meet building codes and manufacturer warranty requirements."
    }
  },

  {
    id: 'policy-interpretation',
    badPhrases: [
      "your policy should cover",
      "your policy must cover",
      "the policy covers",
      "policy requires payment for",
      "under the policy you must",
      "under your policy",
      "per your policy terms",
      "your coverage includes",
      "your policy entitles",
      "according to the policy",
      "the policy should pay"
    ],
    why: "You're interpreting their insurance policy - only they can determine coverage.",
    goodAlternatives: [
      "industry standards require",
      "manufacturer specifications require",
      "code compliance requires",
      "professional standards dictate",
      "building codes mandate"
    ],
    example: {
      bad: "Your policy should cover the full replacement given the matching requirements.",
      good: "Industry standards require full replacement when matching is not possible due to material discontinuation and age differential."
    }
  },

  {
    id: 'acting-as-intermediary',
    badPhrases: [
      "on behalf of the homeowner",
      "on behalf of our client",
      "on behalf of the insured",
      "representing the homeowner",
      "acting for the insured",
      "as the homeowner's representative",
      "speaking for the policyholder",
      "advocating for the insured"
    ],
    why: "You're positioning yourself as their representative in the claim - that's public adjuster work requiring a license.",
    goodAlternatives: [
      "at the homeowner's request",
      "Mr./Ms. [Name] has asked us to",
      "our client has requested that we",
      "the homeowner asked us to provide",
      "at [Name]'s request, we are providing"
    ],
    example: {
      bad: "On behalf of Mr. Palmer, we are requesting a claim review.",
      good: "Mr. Palmer has requested that we provide you with additional technical documentation regarding the repair scope."
    }
  }
];

// =============================================================================
// HIGH WARNINGS - Allow Send But Warn Strongly
// =============================================================================

const HIGH_WARNINGS = [
  {
    id: 'insurance-payment-demands',
    badPhrases: [
      "insurance must pay for",
      "insurance should pay for",
      "insurance needs to cover",
      "carrier must approve",
      "carrier should approve",
      "you need to pay for",
      "you should cover",
      "you must pay"
    ],
    why: "Getting close to telling insurance what they must do - this language can be seen as claim negotiation.",
    goodAlternatives: [
      "the repair scope includes",
      "code-compliant repair requires",
      "to meet warranty requirements, the scope must include",
      "from a construction standpoint, this requires"
    ]
  },

  {
    id: 'insurance-matching-language',
    badPhrases: [
      "matching requirements for insurance",
      "insurance matching standards",
      "matching obligations under policy",
      "insurance is required to match",
      "matching is required by insurance",
      "your matching requirement"
    ],
    why: "Sounds like you're referencing insurance obligations, not construction standards.",
    goodAlternatives: [
      "building code matching requirements",
      "manufacturer matching specifications",
      "code-compliant matching standards",
      "uniform appearance requirements per building code"
    ]
  },

  {
    id: 'negotiation-language',
    badPhrases: [
      "we respectfully request approval",
      "we request payment for",
      "please authorize payment",
      "we need approval for",
      "requesting your authorization",
      "seeking your approval for",
      "we are asking for payment"
    ],
    why: "Sounds like you're negotiating the claim on behalf of the homeowner.",
    goodAlternatives: [
      "the homeowner has requested approval",
      "Mr./Ms. [Name] is seeking approval for",
      "our client has asked for your review of",
      "[Homeowner] would like your decision on"
    ]
  },

  {
    id: 'claim-advocacy',
    badPhrases: [
      "the claim deserves",
      "this claim merits",
      "the homeowner deserves",
      "fair treatment requires",
      "in fairness to the homeowner"
    ],
    why: "This language positions you as advocating for the claim outcome.",
    goodAlternatives: [
      "from a technical standpoint",
      "based on building code requirements",
      "per manufacturer specifications",
      "according to industry standards"
    ]
  }
];

// =============================================================================
// MEDIUM CAUTIONS - Suggest But Allow
// =============================================================================

const MEDIUM_CAUTIONS = [
  {
    id: 'claim-scope-suggestions',
    badPhrases: [
      "the claim should include",
      "the claim should reflect",
      "claim should cover",
      "estimate should include",
      "the scope should be",
      "the estimate should reflect"
    ],
    why: "Could be interpreted as claim negotiation - consider rephrasing.",
    goodAlternatives: [
      "the repair scope should include",
      "code-compliant work requires",
      "a proper repair would include",
      "the construction scope requires"
    ]
  },

  {
    id: 'soft-negotiation',
    badPhrases: [
      "we hope you'll approve",
      "we trust you'll see",
      "we believe coverage includes",
      "we expect approval for",
      "we anticipate you will",
      "hopefully you will approve"
    ],
    why: "Still sounds like you're advocating for claim outcome rather than providing technical info.",
    goodAlternatives: [
      "we've documented the technical requirements",
      "the code requirements specify",
      "industry standards require",
      "the technical documentation shows"
    ]
  },

  {
    id: 'urgency-pressure',
    badPhrases: [
      "we need this resolved quickly",
      "this needs immediate attention",
      "urgent approval needed",
      "time-sensitive matter",
      "please expedite"
    ],
    why: "Putting pressure on the adjuster can be seen as negotiation tactics.",
    goodAlternatives: [
      "the homeowner has asked about the timeline",
      "[Name] inquired about next steps",
      "please let us know the expected timeline"
    ]
  }
];

// =============================================================================
// SAFE LANGUAGE PATTERNS - Always Acceptable
// =============================================================================

const SAFE_PATTERNS = {
  CONTRACTOR_AUTHORITY: [
    "as the licensed contractor responsible for this work",
    "from a construction and code compliance standpoint",
    "based on manufacturer specifications",
    "building codes require that contractors",
    "our professional liability as contractors requires",
    "industry standards dictate that we",
    "as a gaf master elite certified contractor",
    "to maintain our licensing and insurance",
    "as the contractor, we must",
    "our contractor's license requires"
  ],

  TECHNICAL_REQUIREMENTS: [
    "building codes require",
    "manufacturer warranty specifications state",
    "nrca standards specify",
    "gaf certification requires",
    "code-compliant installation requires",
    "professional installation standards require",
    "to meet warranty requirements",
    "industry best practices dictate",
    "per irc r908",
    "according to building code"
  ],

  SCOPE_EXPLANATION: [
    "the documented damage extends to",
    "a code-compliant repair would require",
    "to meet building codes and warranty requirements",
    "from a technical construction perspective",
    "the repair scope necessary for code compliance",
    "manufacturer specifications require",
    "to avoid creating code violations",
    "the construction scope includes"
  ],

  CONTRACTOR_LIMITATIONS: [
    "as the contractor, i cannot perform work that",
    "i am unable to recommend a repair that would",
    "professional standards prevent us from",
    "our licensing prohibits us from",
    "we cannot in good faith perform work that",
    "code compliance requires that we",
    "to maintain our warranty coverage, we must",
    "we are unable to warranty work that"
  ],

  HOMEOWNER_REQUESTS: [
    "has requested",
    "asked us to provide",
    "asked us to share",
    "requested that we",
    "at the homeowner's request",
    "the property owner has asked",
    "our client asked us to",
    "at their request"
  ],

  INFORMATION_SHARING: [
    "we wanted to ensure you have complete technical information",
    "for your reference, we've documented",
    "we're providing this technical assessment",
    "we wanted to share the construction requirements",
    "this technical documentation shows",
    "we've prepared detailed specifications",
    "please find attached our technical assessment"
  ]
};

// =============================================================================
// COMPLIANCE CHECKER FUNCTIONS
// =============================================================================

/**
 * Find all occurrences of a phrase in text (case-insensitive)
 */
function findAllOccurrences(text: string, phrase: string): { start: number; end: number }[] {
  const results: { start: number; end: number }[] = [];
  const lowerText = text.toLowerCase();
  const lowerPhrase = phrase.toLowerCase();

  let pos = 0;
  while ((pos = lowerText.indexOf(lowerPhrase, pos)) !== -1) {
    results.push({ start: pos, end: pos + phrase.length });
    pos += 1;
  }

  return results;
}

/**
 * Check email text for compliance violations
 */
export function checkEmailCompliance(emailText: string): ComplianceResult {
  const violations: ComplianceViolation[] = [];
  const warnings: ComplianceViolation[] = [];
  const cautions: ComplianceViolation[] = [];
  let safePatternCount = 0;

  // Check for CRITICAL violations
  CRITICAL_VIOLATIONS.forEach(violation => {
    violation.badPhrases.forEach(phrase => {
      const occurrences = findAllOccurrences(emailText, phrase);
      occurrences.forEach(position => {
        violations.push({
          severity: 'CRITICAL',
          found: phrase,
          position,
          why: violation.why,
          suggestions: violation.goodAlternatives,
          example: violation.example
        });
      });
    });
  });

  // Check for HIGH warnings
  HIGH_WARNINGS.forEach(warning => {
    warning.badPhrases.forEach(phrase => {
      const occurrences = findAllOccurrences(emailText, phrase);
      occurrences.forEach(position => {
        warnings.push({
          severity: 'HIGH',
          found: phrase,
          position,
          why: warning.why,
          suggestions: warning.goodAlternatives
        });
      });
    });
  });

  // Check for MEDIUM cautions
  MEDIUM_CAUTIONS.forEach(caution => {
    caution.badPhrases.forEach(phrase => {
      const occurrences = findAllOccurrences(emailText, phrase);
      occurrences.forEach(position => {
        cautions.push({
          severity: 'MEDIUM',
          found: phrase,
          position,
          why: caution.why,
          suggestions: caution.goodAlternatives
        });
      });
    });
  });

  // Count safe patterns used (good sign!)
  const lowerText = emailText.toLowerCase();
  Object.values(SAFE_PATTERNS).forEach(patterns => {
    patterns.forEach(pattern => {
      if (lowerText.includes(pattern.toLowerCase())) {
        safePatternCount++;
      }
    });
  });

  // Calculate compliance score
  const criticalPenalty = violations.length * 30;
  const highPenalty = warnings.length * 15;
  const mediumPenalty = cautions.length * 5;
  const safeBonus = Math.min(safePatternCount * 5, 20);

  const score = Math.max(0, Math.min(100, 100 - criticalPenalty - highPenalty - mediumPenalty + safeBonus));

  // Generate summary
  let summary: string;
  if (violations.length > 0) {
    summary = `BLOCKED: ${violations.length} critical violation(s) found. This email contains language that could be interpreted as unlicensed public adjuster activity. Fix before sending.`;
  } else if (warnings.length > 0) {
    summary = `WARNING: ${warnings.length} high-risk phrase(s) found. Review carefully before sending.`;
  } else if (cautions.length > 0) {
    summary = `CAUTION: ${cautions.length} phrase(s) could be improved. Consider revising for clarity.`;
  } else if (safePatternCount > 0) {
    summary = `COMPLIANT: Email uses ${safePatternCount} safe contractor-focused pattern(s). Good to send!`;
  } else {
    summary = `OK: No violations detected. Email appears compliant.`;
  }

  return {
    canSend: violations.length === 0,
    score,
    violations,
    warnings,
    cautions,
    safePatternCount,
    summary
  };
}

/**
 * Auto-fix critical violations in email text
 * Returns the corrected text and a list of changes made
 */
export function autoFixViolations(emailText: string): {
  correctedText: string;
  changesMade: { original: string; replacement: string; reason: string }[]
} {
  let correctedText = emailText;
  const changesMade: { original: string; replacement: string; reason: string }[] = [];

  CRITICAL_VIOLATIONS.forEach(violation => {
    violation.badPhrases.forEach(phrase => {
      const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      if (regex.test(correctedText)) {
        const replacement = violation.goodAlternatives[0];
        correctedText = correctedText.replace(regex, replacement);
        changesMade.push({
          original: phrase,
          replacement,
          reason: violation.why
        });
      }
    });
  });

  return { correctedText, changesMade };
}

/**
 * Get compliance guidance for email generation
 * Returns instructions to add to the AI prompt
 */
export function getCompliancePromptInstructions(): string {
  return `
**CRITICAL LEGAL COMPLIANCE - UNLICENSED PUBLIC ADJUSTER PREVENTION**

As a contractor, you CANNOT:
- Tell insurance what they're "required to" do or pay
- Request claim updates, revisions, or approvals on behalf of homeowner
- Use words like "warranted" for coverage determinations
- Interpret or reference policy coverage
- Act "on behalf of" or "represent" the homeowner in the claim

You CAN ONLY speak to:
- Building code requirements (as they apply to YOUR work as contractor)
- Manufacturer specifications and warranty requirements
- Construction/technical standards
- Your limitations as a contractor (what you cannot do due to codes/licensing)
- Sharing information "at the homeowner's request"

ALWAYS use language like:
- "As the licensed contractor, I am required to..."
- "Building codes require that..."
- "Mr./Ms. [Name] has requested that we share..."
- "From a construction standpoint..."
- "To meet code compliance..."
- "Manufacturer specifications require..."
- "As the contractor, I cannot perform work that would..."

NEVER use language like:
- "Insurance is required to..."
- "We request the claim be updated..."
- "A full replacement is warranted..."
- "Your policy should cover..."
- "On behalf of the homeowner..."

The homeowner negotiates their claim. You provide TECHNICAL CONSTRUCTION INFORMATION.

Frame everything through the lens of:
1. What YOU as the contractor are required to do by code
2. What YOU cannot do as the contractor
3. What the HOMEOWNER has requested you share
4. What the TECHNICAL REQUIREMENTS are for the work
`;
}

/**
 * Highlight violations in HTML format for display
 */
export function highlightViolationsHTML(emailText: string, result: ComplianceResult): string {
  let highlighted = emailText;

  // Sort all issues by position (descending) to replace from end to start
  const allIssues = [
    ...result.violations.map(v => ({ ...v, color: '#fee2e2', border: '#dc2626' })),
    ...result.warnings.map(w => ({ ...w, color: '#fef3c7', border: '#d97706' })),
    ...result.cautions.map(c => ({ ...c, color: '#e0e7ff', border: '#4f46e5' }))
  ].sort((a, b) => b.position.start - a.position.start);

  allIssues.forEach(issue => {
    const before = highlighted.slice(0, issue.position.start);
    const match = highlighted.slice(issue.position.start, issue.position.end);
    const after = highlighted.slice(issue.position.end);

    highlighted = `${before}<span style="background-color: ${issue.color}; border-bottom: 2px solid ${issue.border}; padding: 2px 4px; border-radius: 2px;" title="${issue.why}">${match}</span>${after}`;
  });

  return highlighted;
}

/**
 * Get safe pattern suggestions based on context
 */
export function getSafePatternSuggestions(context: 'adjuster' | 'insurance' | 'homeowner'): string[] {
  const suggestions: string[] = [];

  if (context === 'adjuster' || context === 'insurance') {
    suggestions.push(...SAFE_PATTERNS.CONTRACTOR_AUTHORITY);
    suggestions.push(...SAFE_PATTERNS.TECHNICAL_REQUIREMENTS);
    suggestions.push(...SAFE_PATTERNS.CONTRACTOR_LIMITATIONS);
    suggestions.push(...SAFE_PATTERNS.INFORMATION_SHARING);
  }

  suggestions.push(...SAFE_PATTERNS.HOMEOWNER_REQUESTS);
  suggestions.push(...SAFE_PATTERNS.SCOPE_EXPLANATION);

  return suggestions;
}

// Export constants for UI display
export const COMPLIANCE_RULES = {
  CRITICAL_VIOLATIONS,
  HIGH_WARNINGS,
  MEDIUM_CAUTIONS,
  SAFE_PATTERNS
};

export default {
  checkEmailCompliance,
  autoFixViolations,
  getCompliancePromptInstructions,
  highlightViolationsHTML,
  getSafePatternSuggestions,
  COMPLIANCE_RULES
};
