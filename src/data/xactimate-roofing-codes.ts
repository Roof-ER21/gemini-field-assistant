/**
 * Comprehensive Xactimate Roofing Line Item Codes Database
 *
 * Sources: Xactware documentation, Quizlet flashcard sets, Brainscape,
 * Assistimate, RoofingProfessor, ContractorTalk forums, GAF estimating
 * legend, C3 Adjusters white papers, and industry practitioner data.
 *
 * Pricing notes:
 * - Prices are approximate national averages (2025-2026) and vary by region.
 * - Xactimate updates pricing monthly from 35,000+ material suppliers.
 * - DMV (DC/MD/VA) area prices tend to be 10-20% above national average.
 * - Always verify against your local Xactimate price list.
 *
 * IMPORTANT: DMO vs RFG labor distinction
 * - Xactimate defaults removal tasks to DMO (Demolition) labor rates (uninsured day laborers).
 * - Roofing contractors should supplement to change removal to RFG (Roofing) labor rates
 *   (skilled, insured labor with workers comp). This can increase removal line items by 50-140%.
 */

export type UnitOfMeasure = "SQ" | "LF" | "SF" | "EA" | "HR" | "%" | "DAY";

export type XactimateCategory =
  | "tear-off"
  | "shingle-install"
  | "underlayment"
  | "flashing"
  | "ventilation"
  | "accessory"
  | "decking"
  | "gutter-soffit-fascia"
  | "metal-roofing"
  | "flat-roofing"
  | "specialty-roofing"
  | "labor-charge"
  | "additional-charge"
  | "disposal"
  | "protection"
  | "painting"
  | "overhead-profit"
  | "misc";

export interface XactimateRoofingCode {
  /** Xactimate line item code (e.g., "RFG 300") */
  code: string;
  /** Full description of the line item */
  description: string;
  /** Unit of measure */
  unit: UnitOfMeasure;
  /** Functional category for grouping */
  category: XactimateCategory;
  /** Approximate price range [low, high] in USD (national average) */
  priceRange: [number, number];
  /** Whether this item is commonly missed and supplemented */
  commonlySupplement: boolean;
  /** IRC/IBC code reference if applicable */
  codeReference?: string;
  /** Additional notes for estimators */
  notes?: string;
  /** What the line item includes (materials, labor, etc.) */
  includes?: string;
  /** Action type: R&R = Remove & Replace, R = Remove only, I = Install only */
  actionType?: "R&R" | "R" | "I" | "N/A";
}

export const XACTIMATE_ROOFING_CODES: XactimateRoofingCode[] = [
  // ============================================================
  // TEAR-OFF / REMOVAL
  // ============================================================
  {
    code: "RFG ARMV",
    description: "Tear off, haul, and dispose of comp. shingles - 3 Tab (1 layer)",
    unit: "SQ",
    category: "tear-off",
    priceRange: [75, 135],
    commonlySupplement: false,
    notes:
      "All-inclusive: includes tear-off labor, haul, dump fees for one layer. Xactimate defaults removal to DMO labor rates; supplement to RFG for skilled labor pricing. DMO default ~$45/SQ vs RFG ~$108/SQ.",
    includes: "Labor to remove, haul to dumpster, disposal fees",
    actionType: "R",
  },
  {
    code: "RFG ARMV>",
    description: "Tear off, haul, and dispose of comp. shingles - Laminated/Architectural (1 layer)",
    unit: "SQ",
    category: "tear-off",
    priceRange: [85, 150],
    commonlySupplement: false,
    notes: "Laminated/architectural shingles are heavier than 3-tab. Higher disposal weight.",
    includes: "Labor to remove, haul to dumpster, disposal fees",
    actionType: "R",
  },
  {
    code: "RFG ARMV>>",
    description: "Tear off, haul, and dispose of comp. shingles - High Profile/Premium",
    unit: "SQ",
    category: "tear-off",
    priceRange: [95, 165],
    commonlySupplement: false,
    notes: "Premium/designer shingles are heaviest composition type.",
    includes: "Labor to remove, haul to dumpster, disposal fees",
    actionType: "R",
  },
  {
    code: "RFG ADDRMV",
    description: "Remove additional layer of shingles - 3 Tab",
    unit: "SQ",
    category: "tear-off",
    priceRange: [30, 60],
    commonlySupplement: true,
    notes: "For roofs with 2+ layers. Added per additional layer beyond the first.",
    codeReference: "IRC R907.3 - Max 2 layers",
    actionType: "R",
  },
  {
    code: "RFG ADDRM>",
    description: "Remove additional layer of shingles - Laminated",
    unit: "SQ",
    category: "tear-off",
    priceRange: [35, 70],
    commonlySupplement: true,
    notes: "Additional layer removal for laminated/architectural shingles.",
    actionType: "R",
  },
  {
    code: "RFG ADDRM>>",
    description: "Remove additional layer of shingles - High Profile/Premium",
    unit: "SQ",
    category: "tear-off",
    priceRange: [40, 80],
    commonlySupplement: true,
    actionType: "R",
  },
  {
    code: "RFG BIRMV",
    description: "Tear off modified bitumen roofing",
    unit: "SQ",
    category: "tear-off",
    priceRange: [90, 160],
    commonlySupplement: false,
    notes: "Modified bitumen (mod-bit) is common on flat/low-slope commercial roofs.",
    actionType: "R",
  },
  {
    code: "RFG BU3RMV",
    description: "Tear off 3-ply built-up roofing",
    unit: "SQ",
    category: "tear-off",
    priceRange: [100, 180],
    commonlySupplement: false,
    notes: "Built-up (tar & gravel) roofing is very heavy. May require additional disposal fees.",
    actionType: "R",
  },
  {
    code: "RFG RLRMV",
    description: "Tear off roll roofing",
    unit: "SQ",
    category: "tear-off",
    priceRange: [50, 95],
    commonlySupplement: false,
    actionType: "R",
  },
  {
    code: "RFG WSRMV",
    description: "Tear off wood shakes - medium",
    unit: "SQ",
    category: "tear-off",
    priceRange: [120, 200],
    commonlySupplement: false,
    notes: "Wood shakes require more labor to remove due to individual nailing.",
    actionType: "R",
  },

  // ============================================================
  // COMPOSITION SHINGLE INSTALLATION
  // ============================================================
  {
    code: "RFG 220",
    description: "3-Tab 20-year composition shingle roofing - includes felt",
    unit: "SQ",
    category: "shingle-install",
    priceRange: [200, 310],
    commonlySupplement: false,
    notes: "Entry-level shingle. Includes 15lb felt underlayment in the line item.",
    includes: "Shingles, 15lb felt, nails, labor to install",
    codeReference: "IRC R905.2",
    actionType: "R&R",
  },
  {
    code: "RFG 220S",
    description: "3-Tab 20-year composition shingle roofing - WITHOUT felt",
    unit: "SQ",
    category: "shingle-install",
    priceRange: [170, 280],
    commonlySupplement: false,
    notes: "Use when adding IWS or synthetic underlayment separately.",
    includes: "Shingles, nails, labor to install",
    actionType: "R&R",
  },
  {
    code: "RFG 240",
    description: "3-Tab 25-year composition shingle roofing - includes felt",
    unit: "SQ",
    category: "shingle-install",
    priceRange: [210, 325],
    commonlySupplement: false,
    includes: "Shingles, 15lb felt, nails, labor to install",
    codeReference: "IRC R905.2",
    actionType: "R&R",
  },
  {
    code: "RFG 240S",
    description: "3-Tab 25-year composition shingle roofing - WITHOUT felt",
    unit: "SQ",
    category: "shingle-install",
    priceRange: [180, 290],
    commonlySupplement: false,
    notes: "Use when adding IWS or synthetic underlayment as separate line item.",
    actionType: "R&R",
  },
  {
    code: "RFG 300",
    description: "Laminated (Architectural) 30-year composition shingle roofing - includes felt",
    unit: "SQ",
    category: "shingle-install",
    priceRange: [250, 380],
    commonlySupplement: false,
    notes: "Most commonly used shingle type for residential. ~$300/SQ national average. Includes 15lb felt.",
    includes: "Laminated shingles, 15lb felt, nails, labor to install",
    codeReference: "IRC R905.2",
    actionType: "R&R",
  },
  {
    code: "RFG 300S",
    description: "Laminated 30-year composition shingle roofing - WITHOUT felt",
    unit: "SQ",
    category: "shingle-install",
    priceRange: [220, 350],
    commonlySupplement: false,
    notes: "Use when billing underlayment (IWS/synthetic) separately.",
    actionType: "R&R",
  },
  {
    code: "RFG 400",
    description: "Laminated 40-year composition shingle - High Grade - includes felt",
    unit: "SQ",
    category: "shingle-install",
    priceRange: [300, 440],
    commonlySupplement: false,
    notes: "Premium architectural shingle. Thicker, more dimensional profile.",
    includes: "High-grade laminated shingles, felt, nails, labor",
    codeReference: "IRC R905.2",
    actionType: "R&R",
  },
  {
    code: "RFG 400S",
    description: "Laminated 40-year composition shingle - High Grade - WITHOUT felt",
    unit: "SQ",
    category: "shingle-install",
    priceRange: [270, 410],
    commonlySupplement: false,
    actionType: "R&R",
  },
  {
    code: "RFG 500",
    description: "Laminated Lifetime (Deluxe Grade) composition shingle roofing - includes felt",
    unit: "SQ",
    category: "shingle-install",
    priceRange: [350, 520],
    commonlySupplement: false,
    notes: "Top-tier residential shingle. Heaviest composition type.",
    includes: "Lifetime laminated shingles, felt, nails, labor",
    codeReference: "IRC R905.2",
    actionType: "R&R",
  },
  {
    code: "RFG 500S",
    description: "Laminated Lifetime composition shingle roofing - WITHOUT felt",
    unit: "SQ",
    category: "shingle-install",
    priceRange: [320, 490],
    commonlySupplement: false,
    actionType: "R&R",
  },
  {
    code: "RFG 500SH",
    description: "Laminated composition shingle - Shake Look (Deluxe)",
    unit: "SQ",
    category: "shingle-install",
    priceRange: [380, 560],
    commonlySupplement: false,
    notes: "Designer shingle mimicking wood shake appearance.",
    actionType: "R&R",
  },
  {
    code: "RFG 500SL",
    description: "Laminated composition shingle - Slate Look (Deluxe)",
    unit: "SQ",
    category: "shingle-install",
    priceRange: [380, 560],
    commonlySupplement: false,
    notes: "Designer shingle mimicking natural slate appearance.",
    actionType: "R&R",
  },

  // ============================================================
  // UNDERLAYMENT
  // ============================================================
  {
    code: "RFG FELT15",
    description: "Roofing felt - 15 lb",
    unit: "SQ",
    category: "underlayment",
    priceRange: [15, 35],
    commonlySupplement: false,
    notes: "Standard underlayment. Often included in shingle line items (non-S variants).",
    codeReference: "IRC R905.2.7 - Underlayment required",
    actionType: "I",
  },
  {
    code: "RFG FELT30",
    description: "Roofing felt - 30 lb",
    unit: "SQ",
    category: "underlayment",
    priceRange: [25, 50],
    commonlySupplement: true,
    notes: "Heavier underlayment. Required by some manufacturers for laminated shingles.",
    codeReference: "IRC R905.2.7",
    actionType: "I",
  },
  {
    code: "RFG IWS",
    description: "Ice and water shield (self-adhering membrane)",
    unit: "SF",
    category: "underlayment",
    priceRange: [1.5, 3.5],
    commonlySupplement: true,
    notes:
      "Required by code at eaves, valleys, and around penetrations in cold climates. Often left off adjuster estimates. Use SF not SQ. Typical coverage: 2 courses (6 ft) up from eave edge.",
    codeReference: "IRC R905.2.7.1 - Ice barrier required where mean Jan temp < 25F",
    actionType: "I",
  },
  {
    code: "RFG SYNT",
    description: "Synthetic underlayment",
    unit: "SQ",
    category: "underlayment",
    priceRange: [30, 65],
    commonlySupplement: true,
    notes: "Superior to felt for tear resistance and UV exposure. Many manufacturers now require it.",
    codeReference: "IRC R905.2.7",
    actionType: "I",
  },

  // ============================================================
  // STARTER COURSE & RIDGE CAP
  // ============================================================
  {
    code: "RFG ASTR",
    description: "Asphalt starter course - universal starter strip",
    unit: "LF",
    category: "accessory",
    priceRange: [1.5, 3.5],
    commonlySupplement: true,
    notes:
      "FREQUENTLY LEFT OFF adjuster estimates. Carriers argue it is covered by waste factor, but Xactimate has separate rates for starter vs field shingles. Critical for wind resistance. Always supplement if missing.",
    includes: "Factory-made starter strip shingles, labor to install",
    codeReference: "IRC R905.2.8.1 - Eave starter required",
    actionType: "I",
  },
  {
    code: "RFG RIDGC",
    description: "Ridge cap - composition shingles (cut from 3-tab)",
    unit: "LF",
    category: "accessory",
    priceRange: [3, 7],
    commonlySupplement: true,
    notes:
      "FREQUENTLY LEFT OFF estimates. Carriers argue waste covers it. For 3-tab, can be cut from field shingles. For laminated, factory ridge cap is required (shingles crack if bent).",
    codeReference: "Manufacturer installation instructions",
    actionType: "R&R",
  },
  {
    code: "RFG RIDGL",
    description: "Ridge cap - laminated/architectural shingles (factory made)",
    unit: "LF",
    category: "accessory",
    priceRange: [4, 9],
    commonlySupplement: true,
    notes: "Factory-made ridge cap is required for laminated shingles. Cannot be cut from field shingles.",
    actionType: "R&R",
  },

  // ============================================================
  // FLASHING
  // ============================================================
  {
    code: "RFG STEP",
    description: "Step flashing - galvanized",
    unit: "LF",
    category: "flashing",
    priceRange: [5, 12],
    commonlySupplement: true,
    notes:
      "COMMONLY LEFT OFF estimates. Carriers claim it can be reused, but most manufacturers recommend R&R. If nailed to roof deck (as recommended), it must be replaced. Removal cost included in tear-off.",
    codeReference: "IRC R905.2.8.3 - Flashing required at wall intersections",
    actionType: "R&R",
  },
  {
    code: "RFG FLCH",
    description: 'Chimney flashing - average size (32" x 36")',
    unit: "EA",
    category: "flashing",
    priceRange: [250, 500],
    commonlySupplement: true,
    notes: "Includes step flashing, counter flashing, and cricket/saddle if needed. Often underbid.",
    codeReference: "IRC R905.2.8.3",
    actionType: "R&R",
  },
  {
    code: "RFG FLCNTR",
    description: "Counter flashing - galvanized",
    unit: "LF",
    category: "flashing",
    priceRange: [8, 18],
    commonlySupplement: true,
    notes: "Required at brick/stucco walls above step flashing. Reglets cut into mortar joints.",
    codeReference: "IRC R905.2.8.3",
    actionType: "R&R",
  },
  {
    code: "RFG FLWL",
    description: "Head wall / end wall flashing",
    unit: "LF",
    category: "flashing",
    priceRange: [6, 14],
    commonlySupplement: true,
    notes:
      "COMMONLY LEFT OFF. Carriers think it can be reused. If face-nailed, new shingles won't align with old nail holes = leak potential. Always R&R.",
    codeReference: "IRC R905.2.8.3",
    actionType: "R&R",
  },
  {
    code: "RFG FLPIPE",
    description: "Pipe jack / pipe flashing - standard (neoprene)",
    unit: "EA",
    category: "flashing",
    priceRange: [40, 85],
    commonlySupplement: false,
    notes: "For plumbing vent pipes penetrating the roof. Various sizes (1.5\", 2\", 3\", 4\").",
    actionType: "R&R",
  },
  {
    code: "RFG FLPIPEL",
    description: "Pipe jack / pipe flashing - lead",
    unit: "EA",
    category: "flashing",
    priceRange: [55, 110],
    commonlySupplement: false,
    notes: "Lead pipe boots are more durable than neoprene. Required by some codes/specs.",
    actionType: "R&R",
  },
  {
    code: "RFG FLKICK",
    description: "Kick-out / diverter flashing",
    unit: "EA",
    category: "flashing",
    priceRange: [25, 60],
    commonlySupplement: true,
    notes:
      "Diverts water away from walls at roof-to-wall transitions. Critical for preventing water intrusion behind siding. Often missed.",
    codeReference: "IRC R905.2.8.3",
    actionType: "I",
  },
  {
    code: "RFG FL14",
    description: 'Flashing - galvanized steel 14" wide',
    unit: "LF",
    category: "flashing",
    priceRange: [5, 12],
    commonlySupplement: false,
    notes: "General purpose roof flashing. Multiple width variants available (7\", 10\", 14\", 20\").",
    actionType: "R&R",
  },
  {
    code: "RFG FL14C",
    description: 'Flashing - copper 14" wide',
    unit: "LF",
    category: "flashing",
    priceRange: [18, 40],
    commonlySupplement: false,
    notes: "Copper flashing for premium/historic installations. Significantly more expensive.",
    actionType: "R&R",
  },

  // ============================================================
  // VALLEY
  // ============================================================
  {
    code: "RFG VMTL",
    description: "Valley metal - galvanized (W-shape)",
    unit: "LF",
    category: "flashing",
    priceRange: [6, 14],
    commonlySupplement: true,
    notes:
      "COMMONLY LEFT OFF. Valley lining cannot usually be reused - field shingles are nailed through it. Open valley style.",
    codeReference: "IRC R905.2.8.2 - Valley flashing required",
    actionType: "R&R",
  },
  {
    code: "RFG VMTLWP",
    description: "Valley metal - painted/color matched",
    unit: "LF",
    category: "flashing",
    priceRange: [8, 18],
    commonlySupplement: true,
    notes: "Painted valley metal to match roof color. Higher material cost.",
    actionType: "R&R",
  },

  // ============================================================
  // DRIP EDGE
  // ============================================================
  {
    code: "RFG DRIP",
    description: "Drip edge - galvanized steel",
    unit: "LF",
    category: "accessory",
    priceRange: [2, 5],
    commonlySupplement: true,
    notes:
      "INCREASINGLY OMITTED by carriers. They argue it can be reused, but if felt/IWS/starter is installed under drip edge, it must be removed to replace those items. Always supplement if felt was under drip edge.",
    codeReference: "IRC R905.2.8.5 - Drip edge required at eaves and gables",
    actionType: "R&R",
  },
  {
    code: "RFG DRIPC",
    description: "Drip edge - copper",
    unit: "LF",
    category: "accessory",
    priceRange: [10, 25],
    commonlySupplement: false,
    notes: "For premium/historic properties with copper accents.",
    actionType: "R&R",
  },

  // ============================================================
  // VENTILATION
  // ============================================================
  {
    code: "RFG VENTA",
    description: "Ridge vent - aluminum",
    unit: "LF",
    category: "ventilation",
    priceRange: [5, 12],
    commonlySupplement: false,
    notes: "External aluminum ridge vent. Provides continuous ridge ventilation.",
    codeReference: "IRC R806 - Ventilation required",
    actionType: "R&R",
  },
  {
    code: "RFG VENTR",
    description: "Ridge vent - shingle over (filtered)",
    unit: "LF",
    category: "ventilation",
    priceRange: [6, 14],
    commonlySupplement: false,
    notes: "Low-profile ridge vent covered by ridge cap shingles. Most common residential type.",
    codeReference: "IRC R806",
    actionType: "R&R",
  },
  {
    code: "RFG VENTB",
    description: "Turbine vent (whirlybird)",
    unit: "EA",
    category: "ventilation",
    priceRange: [60, 130],
    commonlySupplement: false,
    notes: "Wind-powered spinning attic ventilator. Common in southern states.",
    actionType: "R&R",
  },
  {
    code: "RFG VENTT",
    description: "Turtle vent / static box vent",
    unit: "EA",
    category: "ventilation",
    priceRange: [45, 95],
    commonlySupplement: false,
    notes: "Static (non-powered) box vent for passive attic ventilation.",
    codeReference: "IRC R806.1 - 1 sq ft NFA per 150 sq ft attic",
    actionType: "R&R",
  },
  {
    code: "RFG VENTE",
    description: "Exhaust vent through roof (bathroom/kitchen fan)",
    unit: "EA",
    category: "ventilation",
    priceRange: [50, 110],
    commonlySupplement: false,
    notes: "For bathroom fan or kitchen exhaust ducting through roof.",
    actionType: "R&R",
  },
  {
    code: "RFG PAV",
    description: "Power attic ventilator (electric)",
    unit: "EA",
    category: "ventilation",
    priceRange: [150, 350],
    commonlySupplement: false,
    notes: "Electric-powered attic fan. Thermostat controlled.",
    actionType: "R&R",
  },
  {
    code: "RFG PAVC",
    description: "Power attic ventilator - copper housing",
    unit: "EA",
    category: "ventilation",
    priceRange: [250, 500],
    commonlySupplement: false,
    notes: "Premium copper-housing power vent for upscale properties.",
    actionType: "R&R",
  },

  // ============================================================
  // DECKING / SHEATHING
  // ============================================================
  {
    code: "RFG SH3/8",
    description: 'Roof sheathing - 3/8" plywood/OSB',
    unit: "SF",
    category: "decking",
    priceRange: [2.5, 5],
    commonlySupplement: true,
    notes: 'Minimum code thickness for 24" o.c. rafters. OSB or plywood.',
    codeReference: "IRC R803.1 - Roof sheathing requirements",
    actionType: "R&R",
  },
  {
    code: "RFG SH1/2",
    description: 'Roof sheathing - 1/2" plywood/OSB',
    unit: "SF",
    category: "decking",
    priceRange: [3, 5.5],
    commonlySupplement: true,
    notes: "Standard residential roof decking thickness.",
    codeReference: "IRC R803.1, Table R503.2.1.1",
    actionType: "R&R",
  },
  {
    code: "RFG SH5/8",
    description: 'Roof sheathing - 5/8" plywood/OSB',
    unit: "SF",
    category: "decking",
    priceRange: [3.5, 6.5],
    commonlySupplement: true,
    notes: "Heavy-duty decking for longer rafter spans or heavier materials.",
    codeReference: "IRC R803.1",
    actionType: "R&R",
  },

  // ============================================================
  // ADDITIONAL CHARGES (STEEP / HIGH)
  // ============================================================
  {
    code: "RFG STEEP",
    description: "Additional charge for steep roof - 7/12 to 9/12 slope",
    unit: "SQ",
    category: "additional-charge",
    priceRange: [25, 75],
    commonlySupplement: true,
    notes:
      "Lost labor productivity due to steep slope. Must be applied to EVERY applicable line item. Three steep tiers: STEEP, STEEP>, STEEP>>.",
    actionType: "N/A",
  },
  {
    code: "RFG STEEP>",
    description: "Additional charge for steep roof - 10/12 to 12/12 slope",
    unit: "SQ",
    category: "additional-charge",
    priceRange: [50, 125],
    commonlySupplement: true,
    notes: "Requires roof jacks and additional safety equipment. Significant productivity loss.",
    actionType: "N/A",
  },
  {
    code: "RFG STEEP>>",
    description: "Additional charge for steep roof - greater than 12/12 slope",
    unit: "SQ",
    category: "additional-charge",
    priceRange: [75, 175],
    commonlySupplement: true,
    notes: "Extreme pitch. May require scaffolding. Rare in residential.",
    actionType: "N/A",
  },
  {
    code: "RFG HIGH",
    description: "Additional charge for high roof (2+ stories at eave)",
    unit: "SQ",
    category: "additional-charge",
    priceRange: [25, 75],
    commonlySupplement: true,
    notes:
      "Applied when eave height is 2 stories or greater. Accounts for material hauling and safety. When in doubt, count as 2-story - adjusters generally pay it.",
    actionType: "N/A",
  },
  {
    code: "RFG SHSTP",
    description: "Additional charge for sheathing on steep roof - 7/12 to 9/12",
    unit: "SF",
    category: "additional-charge",
    priceRange: [0.5, 1.5],
    commonlySupplement: true,
    notes: "Steep charge variant specifically for decking/sheathing replacement.",
    actionType: "N/A",
  },

  // ============================================================
  // METAL ROOFING
  // ============================================================
  {
    code: "RFG MTL",
    description: "Metal roofing - standing seam or corrugated",
    unit: "SQ",
    category: "metal-roofing",
    priceRange: [400, 800],
    commonlySupplement: false,
    notes: "Multiple metal roofing types available. Standing seam is premium.",
    actionType: "R&R",
  },
  {
    code: "RFG MTLCS",
    description: "Closure strips for metal roofing",
    unit: "LF",
    category: "metal-roofing",
    priceRange: [2, 5],
    commonlySupplement: false,
    notes: "Foam or rubber closure strips that seal corrugation gaps at eaves/ridges.",
    actionType: "I",
  },
  {
    code: "RFG MTLET",
    description: "Eave trim for metal roofing",
    unit: "LF",
    category: "metal-roofing",
    priceRange: [4, 10],
    commonlySupplement: false,
    actionType: "R&R",
  },
  {
    code: "RFG MTLGT",
    description: "Gable trim for metal roofing",
    unit: "LF",
    category: "metal-roofing",
    priceRange: [4, 10],
    commonlySupplement: false,
    actionType: "R&R",
  },
  {
    code: "RFG MTLREC",
    description: "Ridge end cap for metal roof",
    unit: "EA",
    category: "metal-roofing",
    priceRange: [25, 60],
    commonlySupplement: false,
    actionType: "R&R",
  },

  // ============================================================
  // FLAT / LOW-SLOPE ROOFING
  // ============================================================
  {
    code: "RFG BI",
    description: "Modified bitumen roofing (torch-down or self-adhered)",
    unit: "SQ",
    category: "flat-roofing",
    priceRange: [250, 450],
    commonlySupplement: false,
    notes: "Common flat/low-slope residential and commercial roofing.",
    actionType: "R&R",
  },
  {
    code: "RFG RL",
    description: "Roll roofing (mineral surface)",
    unit: "SQ",
    category: "flat-roofing",
    priceRange: [100, 200],
    commonlySupplement: false,
    notes: "Economical low-slope roofing. 36\" wide rolls.",
    actionType: "R&R",
  },
  {
    code: "RFG RUB",
    description: "Rubber roofing (EPDM) - mechanically attached",
    unit: "SQ",
    category: "flat-roofing",
    priceRange: [300, 500],
    commonlySupplement: false,
    notes: "EPDM rubber membrane for flat roofs. Mechanically fastened.",
    actionType: "R&R",
  },
  {
    code: "RFG RUBF",
    description: "Rubber roofing (EPDM) - fully adhered",
    unit: "SQ",
    category: "flat-roofing",
    priceRange: [350, 600],
    commonlySupplement: false,
    notes: "Fully adhered EPDM provides better wind uplift resistance.",
    actionType: "R&R",
  },
  {
    code: "RFG SPLY",
    description: "Single-ply membrane roofing (TPO/PVC)",
    unit: "SQ",
    category: "flat-roofing",
    priceRange: [350, 650],
    commonlySupplement: false,
    notes: "TPO or PVC single-ply membrane. Common commercial flat roof system.",
    actionType: "R&R",
  },

  // ============================================================
  // SPECIALTY ROOFING (WOOD, SLATE, TILE)
  // ============================================================
  {
    code: "RFG WSHK",
    description: "Wood shakes - medium grade",
    unit: "SQ",
    category: "specialty-roofing",
    priceRange: [600, 1000],
    commonlySupplement: false,
    notes: "Cedar wood shakes. Requires special underlayment and ventilation.",
    codeReference: "IRC R905.7",
    actionType: "R&R",
  },
  {
    code: "RFG WSTP",
    description: "Wood shingles - taper sawn",
    unit: "SQ",
    category: "specialty-roofing",
    priceRange: [500, 850],
    commonlySupplement: false,
    notes: "Machine-cut wood shingles (vs hand-split shakes).",
    codeReference: "IRC R905.7",
    actionType: "R&R",
  },

  // ============================================================
  // GABLE CORNICE
  // ============================================================
  {
    code: "RFG GCR240",
    description: "Gable cornice return - 3-tab shingles (1 story)",
    unit: "EA",
    category: "accessory",
    priceRange: [60, 130],
    commonlySupplement: true,
    notes:
      "OFTEN OVERLOOKED. Gable cornice returns and strips are frequently left out, leaving money on the table. Different rates for 1-story vs 2-story.",
    actionType: "R&R",
  },
  {
    code: "RFG GCS240",
    description: "Gable cornice return - 3-tab shingles (2 stories or greater)",
    unit: "EA",
    category: "accessory",
    priceRange: [75, 160],
    commonlySupplement: true,
    notes: "2-story gable cornice return. Higher pricing due to height.",
    actionType: "R&R",
  },
  {
    code: "RFG GCR300",
    description: "Gable cornice return - laminated shingles (1 story)",
    unit: "EA",
    category: "accessory",
    priceRange: [70, 145],
    commonlySupplement: true,
    actionType: "R&R",
  },
  {
    code: "RFG GCST",
    description: "Gable cornice strip",
    unit: "LF",
    category: "accessory",
    priceRange: [4, 10],
    commonlySupplement: true,
    notes: "Linear portion of gable cornice (vs the return which is EA).",
    actionType: "R&R",
  },

  // ============================================================
  // SKYLIGHTS
  // ============================================================
  {
    code: "RFG SKYLR",
    description: "Re-flash existing skylight",
    unit: "EA",
    category: "flashing",
    priceRange: [150, 350],
    commonlySupplement: true,
    notes: "Reflashing kit for existing skylight during re-roof.",
    actionType: "R&R",
  },
  {
    code: "WDS DDFL",
    description: "Skylight flashing kit (domed)",
    unit: "EA",
    category: "flashing",
    priceRange: [100, 250],
    commonlySupplement: true,
    notes: "Under WDS (Windows/Doors/Skylights) category, not RFG. Often needed with roof work.",
    actionType: "R&R",
  },

  // ============================================================
  // SOFFIT, FASCIA & GUTTER (SFG category)
  // ============================================================
  {
    code: "SFG GUTA5",
    description: 'Gutter - aluminum 5" (K-style)',
    unit: "LF",
    category: "gutter-soffit-fascia",
    priceRange: [6, 14],
    commonlySupplement: false,
    notes: "Standard residential gutter. SFG category (Soffit, Fascia, Gutter).",
    actionType: "R&R",
  },
  {
    code: "SFG GUTA6",
    description: 'Gutter - aluminum 6" (K-style)',
    unit: "LF",
    category: "gutter-soffit-fascia",
    priceRange: [8, 18],
    commonlySupplement: false,
    notes: "Oversized gutter for high-volume water flow areas.",
    actionType: "R&R",
  },
  {
    code: "SFG DSPAT",
    description: 'Downspout - aluminum (2"x3" or 3"x4")',
    unit: "LF",
    category: "gutter-soffit-fascia",
    priceRange: [5, 12],
    commonlySupplement: false,
    actionType: "R&R",
  },
  {
    code: "SFG GRD",
    description: "Gutter guard / screen",
    unit: "LF",
    category: "gutter-soffit-fascia",
    priceRange: [4, 12],
    commonlySupplement: true,
    notes: "Gutter protection screens. Various styles available.",
    actionType: "R&R",
  },
  {
    code: "SFG FACM4",
    description: 'Fascia - metal/aluminum 4"',
    unit: "LF",
    category: "gutter-soffit-fascia",
    priceRange: [4, 10],
    commonlySupplement: false,
    actionType: "R&R",
  },
  {
    code: "SFG FACV",
    description: 'Fascia - vinyl coated aluminum 4"-6"',
    unit: "LF",
    category: "gutter-soffit-fascia",
    priceRange: [5, 12],
    commonlySupplement: false,
    actionType: "R&R",
  },
  {
    code: "SFG FACV>",
    description: 'Fascia - vinyl coated aluminum 7"-10"',
    unit: "LF",
    category: "gutter-soffit-fascia",
    priceRange: [7, 16],
    commonlySupplement: false,
    actionType: "R&R",
  },
  {
    code: "SFG FACW4",
    description: 'Fascia - wood 4"',
    unit: "LF",
    category: "gutter-soffit-fascia",
    priceRange: [4, 10],
    commonlySupplement: false,
    actionType: "R&R",
  },
  {
    code: "SFG FACFC4",
    description: 'Fascia - fiber cement 4"',
    unit: "LF",
    category: "gutter-soffit-fascia",
    priceRange: [5, 12],
    commonlySupplement: false,
    actionType: "R&R",
  },
  {
    code: "SFG SFTM",
    description: "Soffit - metal/aluminum",
    unit: "SF",
    category: "gutter-soffit-fascia",
    priceRange: [5, 12],
    commonlySupplement: false,
    actionType: "R&R",
  },
  {
    code: "SFG SFTV",
    description: "Soffit - vinyl",
    unit: "SF",
    category: "gutter-soffit-fascia",
    priceRange: [4, 10],
    commonlySupplement: false,
    actionType: "R&R",
  },
  {
    code: "SFG SFTW",
    description: "Soffit - wood",
    unit: "SF",
    category: "gutter-soffit-fascia",
    priceRange: [5, 12],
    commonlySupplement: false,
    actionType: "R&R",
  },
  {
    code: "SFG SFTFC",
    description: "Soffit - fiber cement",
    unit: "SF",
    category: "gutter-soffit-fascia",
    priceRange: [6, 14],
    commonlySupplement: false,
    actionType: "R&R",
  },

  // ============================================================
  // PAINTING
  // ============================================================
  {
    code: "PNT GUTG",
    description: "Prime & paint gutter / downspout",
    unit: "LF",
    category: "painting",
    priceRange: [2, 5],
    commonlySupplement: true,
    notes:
      "If original vents/flashings/drip edge were painted a custom color, new materials need painting. Xactimate has rates by EA for vents, by LF for trim/drip edge.",
    actionType: "I",
  },
  {
    code: "PNT SFTM1",
    description: "Paint exterior soffit - metal - 1 coat",
    unit: "SF",
    category: "painting",
    priceRange: [1, 3],
    commonlySupplement: true,
    actionType: "I",
  },

  // ============================================================
  // LABOR & MISCELLANEOUS
  // ============================================================
  {
    code: "RFG LAB",
    description: "Roofing labor - skilled (per hour)",
    unit: "HR",
    category: "labor-charge",
    priceRange: [45, 85],
    commonlySupplement: true,
    notes:
      "General roofing labor for tasks not covered by specific line items. Use for hand-carrying shingles when roof-loading is not possible, extra cleanup, etc.",
    actionType: "N/A",
  },
  {
    code: "RFG BIDITM",
    description: "Roofing bid item (user-defined)",
    unit: "EA",
    category: "misc",
    priceRange: [0, 0],
    commonlySupplement: false,
    notes: "Custom line item for non-standard roofing work. User sets price.",
    actionType: "N/A",
  },
  {
    code: "RFG CAULK",
    description: "Roofing sealant / caulk (per tube applied)",
    unit: "EA",
    category: "misc",
    priceRange: [15, 35],
    commonlySupplement: false,
    notes: "Sealant around penetrations, flashings, and transitions.",
    actionType: "I",
  },

  // ============================================================
  // DISPOSAL & HAULING
  // ============================================================
  {
    code: "GNL DMPST",
    description: "Dumpster load - roofing debris",
    unit: "EA",
    category: "disposal",
    priceRange: [350, 650],
    commonlySupplement: true,
    notes:
      "Not all tear-off line items include disposal. If using labor-only tear-off codes, add dumpster separately. Under GNL (General) category.",
    actionType: "N/A",
  },
  {
    code: "GNL TRPHZ",
    description: "Haul debris - per pickup truck load",
    unit: "EA",
    category: "disposal",
    priceRange: [75, 175],
    commonlySupplement: true,
    notes: "For smaller jobs where a dumpster is not cost-effective.",
    actionType: "N/A",
  },

  // ============================================================
  // PROTECTION / TEMPORARY
  // ============================================================
  {
    code: "GNL TARP",
    description: "Temporary tarp / emergency board-up for roof",
    unit: "SF",
    category: "protection",
    priceRange: [1, 4],
    commonlySupplement: true,
    notes: "Emergency protection until permanent repairs. Often needed after storm damage.",
    actionType: "I",
  },
  {
    code: "GNL PROT",
    description: "Property protection (landscaping, pool, etc.)",
    unit: "EA",
    category: "protection",
    priceRange: [50, 200],
    commonlySupplement: true,
    notes:
      "Protection of property during roofing work. Plywood over AC units, tarps over landscaping, etc. One of the 'secret' line items.",
    actionType: "I",
  },

  // ============================================================
  // OVERHEAD & PROFIT
  // ============================================================
  {
    code: "O&P",
    description: "General Contractor Overhead (10%) and Profit (10%)",
    unit: "%",
    category: "overhead-profit",
    priceRange: [10, 10],
    commonlySupplement: true,
    notes:
      "Standard 10% overhead + 10% profit = 20% addition. FREQUENTLY DISPUTED by carriers. Rule of thumb: qualifies when 3+ trades are involved. Carriers argue O&P is already in unit costs ('job-personnel overhead'), but Xactimate's white paper distinguishes between job-personnel overhead and GC overhead. Always worth fighting for on multi-trade claims. Some carriers refuse O&P on roofing-only claims.",
    actionType: "N/A",
  },

  // ============================================================
  // ELECTRICAL (related to roofing)
  // ============================================================
  {
    code: "ELS DISH",
    description: "Satellite dish - detach and reset",
    unit: "EA",
    category: "misc",
    priceRange: [75, 175],
    commonlySupplement: true,
    notes: "Under ELS (Electrical) category. For removing and resetting satellite dishes during re-roof.",
    actionType: "R&R",
  },
  {
    code: "ELS ANTN",
    description: "Antenna - detach and reset",
    unit: "EA",
    category: "misc",
    priceRange: [60, 150],
    commonlySupplement: true,
    notes: "For TV antennas or other roof-mounted equipment.",
    actionType: "R&R",
  },
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/** Get all codes in a specific category */
export function getCodesByCategory(category: XactimateCategory): XactimateRoofingCode[] {
  return XACTIMATE_ROOFING_CODES.filter((c) => c.category === category);
}

/** Get commonly supplemented items */
export function getCommonSupplements(): XactimateRoofingCode[] {
  return XACTIMATE_ROOFING_CODES.filter((c) => c.commonlySupplement);
}

/** Search codes by keyword in description or notes */
export function searchCodes(query: string): XactimateRoofingCode[] {
  const q = query.toLowerCase();
  return XACTIMATE_ROOFING_CODES.filter(
    (c) =>
      c.code.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.notes?.toLowerCase().includes(q)
  );
}

/** Look up a specific code */
export function getCode(code: string): XactimateRoofingCode | undefined {
  return XACTIMATE_ROOFING_CODES.find(
    (c) => c.code.toLowerCase() === code.toLowerCase()
  );
}

/** Get all unique categories */
export function getCategories(): XactimateCategory[] {
  return Array.from(new Set(XACTIMATE_ROOFING_CODES.map((c) => c.category)));
}

/** Calculate estimated cost for a line item given quantity */
export function estimateCost(
  code: string,
  quantity: number
): { low: number; high: number; code: XactimateRoofingCode } | null {
  const item = getCode(code);
  if (!item) return null;
  return {
    low: item.priceRange[0] * quantity,
    high: item.priceRange[1] * quantity,
    code: item,
  };
}

/**
 * Summary statistics
 */
export const XACTIMATE_DB_STATS = {
  totalCodes: XACTIMATE_ROOFING_CODES.length,
  categories: [
    "tear-off",
    "shingle-install",
    "underlayment",
    "flashing",
    "ventilation",
    "accessory",
    "decking",
    "gutter-soffit-fascia",
    "metal-roofing",
    "flat-roofing",
    "specialty-roofing",
    "labor-charge",
    "additional-charge",
    "disposal",
    "protection",
    "painting",
    "overhead-profit",
    "misc",
  ],
  commonlySupplemented: XACTIMATE_ROOFING_CODES.filter((c) => c.commonlySupplement).length,
  lastUpdated: "2026-03-25",
  sources: [
    "Xactware official documentation",
    "Quizlet: Roofing Xactimate Codes (560910592)",
    "Quizlet: Roofing Codes (224301163) - 28 codes",
    "Quizlet: Xactimate Quick Entry 2 (202882358)",
    "Brainscape: Common Xactimate Codes (Mark Harter)",
    "Assistimate: 9 Missing Supplement Items",
    "RoofingProfessor: DMO vs RFG",
    "ContractorTalk forums",
    "GAF Xactimate Estimating Legend",
    "C3 Adjusters: Roof Flashing White Paper",
    "Xactimate White Paper on O&P (05/01/2011)",
  ],
};
